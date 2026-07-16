export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { startOfWeekAEST } from '@/lib/date-au';
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseLLMJsonOr } from '@/lib/ai-json';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'
import { logAICallSafe } from '@/lib/aria/log-ai-call'

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
  // WEEK-1: default week_starting = this week's Monday in AEST (was server-TZ Monday)
  const weekStarting: string = body.week_starting ?? startOfWeekAEST().toISOString().slice(0, 10);

  // Load the management team from staff_members (NOT pos_users — that's only the
  // in-POS register logins, which is usually just the owner). Availability lives
  // in staff_availability, joined in below.
  const [{ data: staffRows }, { data: availRows }, { data: biz }, { data: recentSales }, { data: firstSaleRows }] = await Promise.all([
    supabase.from("staff_members").select("id,first_name,last_name,position,employment_type,hourly_rate,base_rate_cents,pay_rate_cents").eq("business_id", bid).eq("status", "active"),
    supabase.from("staff_availability").select("staff_member_id,day_of_week,specific_date,unavailable_from,unavailable_until,reason,is_recurring").eq("business_id", bid),
    supabase.from("businesses").select("name,industry").eq("id", bid).single(),
    supabase.from("pos_sales").select("total_amount,created_at").eq("business_id", bid).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(500),
    supabase.from("pos_sales").select("created_at").eq("business_id", bid).order("created_at", { ascending: true }).limit(1),
  ]);

  // Confidence gate: closure/quiet-day recommendations require at least 4 weeks of
  // trading history. Below that, low revenue is just "new business", not a quiet day.
  const firstSaleAt = (firstSaleRows ?? [])[0]?.created_at as string | undefined;
  const hasFourWeeksData = !!firstSaleAt && (Date.now() - new Date(firstSaleAt).getTime()) >= 28 * 86400000;

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const availByStaff = new Map<string, string[]>();
  for (const a of availRows ?? []) {
    const arr = availByStaff.get(a.staff_member_id as string) ?? [];
    const day = a.day_of_week != null ? DOW[a.day_of_week as number] : (a.specific_date ?? "a date");
    const window = a.unavailable_from && a.unavailable_until ? `${a.unavailable_from}–${a.unavailable_until}` : "all day";
    arr.push(`${day} unavailable ${window}${a.reason ? ` (${a.reason})` : ""}`);
    availByStaff.set(a.staff_member_id as string, arr);
  }

  // Normalise to a stable shape for the prompt + fallback.
  const staff = (staffRows ?? []).map(s => {
    const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || "Staff";
    // INTEL-COMPUTE-2 — was checking hourly_rate FIRST: that column defaults to 25 and nothing in
    // the app ever writes to it, so this always resolved $25/hr for any business that only
    // configured the real pay_rate_cents column. pay_rate_cents (cents, correctly populated) now
    // takes priority; hourly_rate is only used if neither real cents column is set.
    const rateCents = s.pay_rate_cents ?? s.base_rate_cents ?? (s.hourly_rate ? Math.round(Number(s.hourly_rate) * 100) : 2500);
    return { id: s.id as string, name, role: (s.position as string) ?? "Staff", employment_type: (s.employment_type as string) ?? "casual", rate_cents: rateCents, availability: availByStaff.get(s.id as string) ?? [] };
  });

  if (!staff.length) {
    return NextResponse.json({ error: "No staff found. Add your team in Dashboard > Staff first." }, { status: 400 });
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

Staff available (schedule ALL of these unless availability/compliance prevents it):
${staff.map(s => `- ${s.name} (${s.role}, ${s.employment_type}), $${(s.rate_cents / 100).toFixed(2)}/hr${s.availability.length ? `; unavailable: ${s.availability.join("; ")}` : "; no availability constraints recorded"}`).join("\n")}

Recent daily revenue averages (0=Sun,1=Mon,...6=Sat):
${Object.entries(dayTotals).map(([d, t]) => `Day ${d}: A$${(t / 4).toFixed(0)} avg`).join(", ")}
`;

  const systemPrompt = `You are Aria, AI business manager. Generate a 7-day work roster for the week.

Rules (Australian Fair Work):
- Max 10 hours per shift
- Break of 30 min required for shifts > 5 hours
- Respect each person's recorded unavailability
- Minimum 2 staff when open (Mon-Sat: 8am-6pm, Sun: 9am-5pm)
- Busier days (Fri/Sat) need more staff
- Schedule the WHOLE team across the week — don't leave staff unscheduled without saying why
- NEVER recommend closing more than 2 days per week. Real businesses cannot shut 3+ days a week — that scares owners away from the feature.
- If revenue is genuinely too low to staff every open day, REDUCE HOURS on the quiet days (e.g. open 10am–3pm with minimal cover), do NOT close the day.
- If you do close a day (max 2), state it explicitly in BOTH "reasoning" and "warnings", e.g. "Aria recommends closing Mon — near-zero revenue last 4 weeks". Closed days must be a visible decision, never an accident.${hasFourWeeksData ? '' : `
- IMPORTANT: this business has LESS THAN 4 WEEKS of trading history, so low revenue does NOT mean a day is quiet — there simply isn't enough data. Do NOT close any days and do NOT cut hours based on revenue. Schedule the team across all 7 open days evenly.`}

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
  let warnings: string[] = [];

  try {
    const resp = await trackAICall({ route: 'aria/roster', model: 'claude-sonnet-4-5-20250929', businessId: undefined, purpose: 'roster-optimization' }, () => anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: "user", content: `Generate the roster for this business:\n${context}` }],
      system: systemPrompt,
    }));
    const text = ((resp.content[0] as { type: string; text: string }).text ?? "").trim();
    const parsed = parseLLMJsonOr<{ shifts?: unknown[]; reasoning?: string; warnings?: string[]; total_hours?: number; total_cost_cents?: number }>(
      text, {}, 'roster'
    );
    shifts = parsed.shifts ?? [];
    reasoning = parsed.reasoning ?? reasoning;
    warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    totalHours = parsed.total_hours ?? shifts.reduce((s: number, sh: unknown) => s + ((sh as {hours?: number}).hours ?? 0), 0);
    totalCostCents = parsed.total_cost_cents ?? shifts.reduce((s: number, sh: unknown) => s + ((sh as {cost_cents?: number}).cost_cents ?? 0), 0);
  } catch (e) {
    // Fallback: simple roster with all staff Mon-Fri 9-5
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStarting);
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
    for (const s of staff) {
      for (const day of days.slice(0, 5)) { // Mon-Fri
        const costCents = Math.round((s.rate_cents / 100) * 7.5 * 100);
        shifts.push({ staff_id: s.id, staff_name: s.name, date: day, start_time: "09:00", end_time: "17:00", break_minutes: 30, role: s.role, hours: 7.5, cost_cents: costCents });
        totalHours += 7.5;
        totalCostCents += costCents;
      }
    }
    reasoning = "Auto-generated fallback roster (Mon-Fri 9am-5pm). Configure AI for smarter scheduling.";
  }

  // ── Guard rail: never close more than 2 days/week (0 if <4wk data). ──────────
  // If the AI (or fallback) left more days empty than allowed, reopen the excess
  // on REDUCED HOURS (10am–3pm, minimal cover) instead of closing them.
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStarting); d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const dowOf = (dateStr: string) => new Date(dateStr + "T12:00:00").getDay();
  const availableOn = (s: typeof staff[number], dateStr: string) => {
    const dl = DOW[dowOf(dateStr)];
    return !s.availability.some(a => a.startsWith(dl) && a.includes("all day"));
  };
  const scheduledDates = new Set((shifts as Array<{ date?: string }>).map(sh => sh.date).filter(Boolean));
  const closedDays = weekDates.filter(d => !scheduledDates.has(d));
  const maxClosed = hasFourWeeksData ? 2 : 0;

  if (closedDays.length > maxClosed) {
    // Keep the lowest-revenue days closed (up to the cap); reopen the rest.
    const revOf = (d: string) => dayTotals[dowOf(d)] ?? 0;
    const keepClosed = new Set([...closedDays].sort((a, b) => revOf(a) - revOf(b)).slice(0, maxClosed));
    const toReopen = closedDays.filter(d => !keepClosed.has(d));
    const RH = { start: "10:00", end: "15:00", hours: 5, break_minutes: 0 };
    for (const day of toReopen) {
      const avail = staff.filter(s => availableOn(s, day));
      const pick = (avail.length ? avail : staff).slice(0, 2);
      for (const s of pick) {
        const costCents = Math.round((s.rate_cents / 100) * RH.hours * 100);
        shifts.push({ staff_id: s.id, staff_name: s.name, date: day, start_time: RH.start, end_time: RH.end, break_minutes: RH.break_minutes, role: s.role, hours: RH.hours, cost_cents: costCents });
        totalHours += RH.hours;
        totalCostCents += costCents;
      }
    }
    const note = hasFourWeeksData
      ? `Aria limits closures to 2 days/week — reopened ${toReopen.length} day(s) on reduced hours (10am–3pm) instead of closing them.`
      : `Less than 4 weeks of trading history — too early to call any day "quiet", so all 7 days are staffed (reduced hours on ${toReopen.length} day(s)).`;
    warnings = [...warnings, note];
    reasoning = `${reasoning} ${note}`.trim();
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

  // WIRE-3 — log the AI roster generation so it surfaces in aria_ai_calls (cost in DOLLARS, never raw cents).
  await logAICallSafe({
    business_id: bid,
    agent_key: "roster",
    role: "rostering",
    provider: "anthropic",
    success: true,
    request_summary: JSON.stringify({ week_starting: weekStarting, shifts: shifts.length, total_hours: totalHours, total_cost_dollars: Math.round(totalCostCents) / 100 }),
  });

  return NextResponse.json({ roster, shifts, reasoning, warnings, total_hours: totalHours, total_cost_cents: totalCostCents });
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
