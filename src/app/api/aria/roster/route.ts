export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from("user_active_business").select("business_id").eq("user_id", userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from("businesses").select("id,name").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ rosters: [] });

  const { data, error } = await supabase.from("pos_roster_templates").select("*").eq("business_id", bid).order("week_starting", { ascending: false }).limit(20);
  if (error?.code === "42P01") return NextResponse.json({ rosters: [] });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rosters: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const weekStarting: string = body.week_starting ?? new Date(Date.now() - ((new Date().getDay() || 7) - 1) * 86400000).toISOString().split("T")[0];

  // Load staff
  const [{ data: staff }, { data: biz }, { data: recentSales }] = await Promise.all([
    supabase.from("pos_users").select("id,name,role,hourly_rate_cents,max_hours_per_week,availability").eq("business_id", bid).eq("is_active", true),
    supabase.from("businesses").select("name,industry").eq("id", bid).single(),
    supabase.from("pos_sales").select("total_amount,created_at").eq("business_id", bid).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(500),
  ]);

  if (!staff?.length) {
    return NextResponse.json({ error: "No staff found. Add staff in Settings > Staff PINs first." }, { status: 400 });
  }

  // Sales by day-of-week
  const dayTotals: Record<number, number> = {};
  for (const s of recentSales ?? []) {
    const dow = new Date(s.created_at).getDay();
    dayTotals[dow] = (dayTotals[dow] ?? 0) + (s.total_amount ?? 0);
  }

  const context = `
Business: ${biz?.name} (${biz?.industry ?? "retail"})
Week starting: ${weekStarting}

Staff available:
${(staff ?? []).map(s => `- ${s.name} (${s.role}), max ${s.max_hours_per_week ?? 40}h/week, $${((s.hourly_rate_cents ?? 2500) / 100).toFixed(2)}/hr`).join("\n")}

Recent daily revenue averages (0=Sun,1=Mon,...6=Sat):
${Object.entries(dayTotals).map(([d, t]) => `Day ${d}: A$${(t / 4).toFixed(0)} avg`).join(", ")}
`;

  const systemPrompt = `You are Aria, AI business manager. Generate a 7-day work roster for the week.

Rules (Australian Fair Work):
- Max 10 hours per shift
- Break of 30 min required for shifts > 5 hours
- Max hours/week per person as specified
- Minimum 2 staff when open (Mon-Sat: 8am-6pm, Sun: 9am-5pm)
- Busier days (Fri/Sat) need more staff
- Store closed if no revenue pattern for that day

Return ONLY a valid JSON object with this exact structure:
{
  "shifts": [
    {
      "staff_id": "...",
      "staff_name": "...",
      "date": "YYYY-MM-DD",
      "start_time": "09:00",
      "end_time": "17:00",
      "break_minutes": 30,
      "role": "Cashier",
      "hours": 7.5,
      "cost_cents": 18750
    }
  ],
  "reasoning": "Brief explanation of scheduling decisions",
  "warnings": ["any compliance warnings"],
  "total_hours": 0,
  "total_cost_cents": 0
}`;

  let shifts: unknown[] = [];
  let reasoning = "Roster generated based on sales patterns and staff availability.";
  let totalHours = 0;
  let totalCostCents = 0;

  try {
    const resp = await trackAICall({ route: 'aria/roster', model: 'claude-sonnet-4-6', businessId: undefined, purpose: 'roster-optimization' }, () => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: `Generate the roster for this business:\n${context}` }],
      system: systemPrompt,
    }));
    const text = ((resp.content[0] as { type: string; text: string }).text ?? "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      shifts = parsed.shifts ?? [];
      reasoning = parsed.reasoning ?? reasoning;
      totalHours = parsed.total_hours ?? shifts.reduce((s: number, sh: unknown) => s + ((sh as {hours?: number}).hours ?? 0), 0);
      totalCostCents = parsed.total_cost_cents ?? shifts.reduce((s: number, sh: unknown) => s + ((sh as {cost_cents?: number}).cost_cents ?? 0), 0);
    }
  } catch (e) {
    // Fallback: simple roster with all staff Mon-Fri 9-5
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStarting);
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
    for (const s of (staff ?? [])) {
      for (const day of days.slice(0, 5)) { // Mon-Fri
        const rate = (s.hourly_rate_cents ?? 2500) / 100;
        shifts.push({ staff_id: s.id, staff_name: s.name, date: day, start_time: "09:00", end_time: "17:00", break_minutes: 30, role: s.role, hours: 7.5, cost_cents: Math.round(rate * 7.5 * 100) });
        totalHours += 7.5;
        totalCostCents += Math.round(rate * 7.5 * 100);
      }
    }
    reasoning = "Auto-generated fallback roster (Mon-Fri 9am-5pm). Configure AI for smarter scheduling.";
  }

  // Save to DB
  const { data: roster, error: rErr } = await supabase.from("pos_roster_templates").insert({
    business_id: bid,
    name: `Roster w/c ${weekStarting}`,
    week_starting: weekStarting,
    status: "draft",
    shifts,
    total_hours: totalHours,
    total_cost_cents: totalCostCents,
    aria_reasoning: reasoning,
  }).select().single();

  if (rErr?.code === "42P01") return NextResponse.json({ error: "Run migration 20260508000000_complete_features.sql in Supabase first" }, { status: 500 });
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({ roster, shifts, reasoning, total_hours: totalHours, total_cost_cents: totalCostCents });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) {
    allowed.status = body.status;
    if (body.status === "approved") allowed.approved_at = new Date().toISOString();
    if (body.status === "published") allowed.published_at = new Date().toISOString();
  }
  if (body.shifts !== undefined) allowed.shifts = body.shifts;
  if (body.name !== undefined) allowed.name = body.name;

  const { data, error } = await supabase.from("pos_roster_templates").update(allowed).eq("id", id).eq("business_id", bid).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roster: data });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("pos_roster_templates").delete().eq("id", id).eq("business_id", bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('aria/roster', _GET)
export const POST = withErrorCapture('aria/roster', _POST)
export const PATCH = withErrorCapture('aria/roster', _PATCH)
export const DELETE = withErrorCapture('aria/roster', _DELETE)
