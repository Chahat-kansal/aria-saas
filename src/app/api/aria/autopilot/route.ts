export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { parseLLMJsonOr } from '@/lib/ai-json';
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
  const { data } = await supabase.from("businesses").select("id,name,industry").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ actions: [] });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";

  const { data, error } = await supabase.from("aria_autopilot_actions").select("*").eq("business_id", bid).eq("status", status).order("created_at", { ascending: false });
  if (error?.code === "42P01") return NextResponse.json({ actions: [] });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });

  const { data: biz } = await supabase.from("businesses").select("name,industry").eq("id", bid).single();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: sales }, { data: products }, { data: customers }] = await Promise.all([
    supabase.from("pos_sales").select("total_amount,created_at,payment_method").eq("business_id", bid).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(500),
    supabase.from("pos_products").select("id,name,price,stock_quantity,track_inventory").eq("business_id", bid).eq("is_active", true).limit(100),
    supabase.from("pos_customers").select("id,name,last_visit_at,total_spend").eq("business_id", bid).order("last_visit_at", { ascending: true }).limit(50),
  ]);

  const totalRevenue = (sales ?? []).reduce((s: number, r: {total_amount?: number}) => s + (r.total_amount ?? 0), 0);
  const lowStock = (products ?? []).filter(p => p.track_inventory && (p.stock_quantity ?? 0) < 5);
  const winbackCustomers = (customers ?? []).filter(c => {
    if (!c.last_visit_at) return true;
    return (Date.now() - new Date(c.last_visit_at).getTime()) > 30 * 86400000;
  });

  const context = `
Business: ${biz?.name} (${biz?.industry ?? "retail"})
30-day revenue: A$${totalRevenue.toFixed(2)} from ${(sales ?? []).length} transactions
Low stock items (${lowStock.length}): ${lowStock.slice(0, 5).map(p => p.name).join(", ")}
Customers needing winback (${winbackCustomers.length}): ${winbackCustomers.slice(0, 5).map(c => c.name).join(", ")}
`;

  const systemPrompt = `You are Aria, the AI business manager. Analyse this business data and generate specific, actionable recommendations for the owner to approve.

Categories: INVENTORY, STAFFING, CUSTOMERS, PROMOTIONS, SOCIAL, FINANCE
Priorities: urgent (needs action today), important (this week), routine (anytime)

Return a JSON array of actions:
[{
  "category": "INVENTORY",
  "priority": "urgent",
  "title": "Reorder Corona Extra — only 2 left",
  "description": "Corona Extra has sold 45 units this month but only 2 remain in stock. At current velocity you will sell out in 2 days.",
  "action_data": {"product_id": "...", "reorder_qty": 24},
  "estimated_impact": "Prevent A$340 in lost sales this weekend"
}]

Generate 5-10 realistic, specific actions based on the data provided. Return ONLY the JSON array.`;

  let actions: unknown[] = [];
  try {
    const resp = await trackAICall({ route: 'aria/autopilot', model: 'claude-sonnet-4-5-20250929', businessId: undefined, purpose: 'autopilot-analysis' }, () => anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 3000,
      messages: [{ role: "user", content: `Analyse this business and generate action recommendations:\n${context}` }],
      system: systemPrompt,
    }));
    const text = ((resp.content[0] as { type: string; text: string }).text ?? "").trim();
    actions = parseLLMJsonOr<any[]>(text, [], 'autopilot', 'array');
  } catch {
    actions = [
      { category: "INVENTORY", priority: "routine", title: "Review low stock items", description: `${lowStock.length} products are running low on stock.`, action_data: {}, estimated_impact: "Prevent stockouts" },
      { category: "CUSTOMERS", priority: "important", title: "Winback campaign", description: `${winbackCustomers.length} customers haven't visited in 30+ days.`, action_data: {}, estimated_impact: "Recover lost revenue" },
    ];
  }

  if (actions.length > 0) {
    const rows = (actions as Array<{category?: string; priority?: string; title?: string; description?: string; action_data?: unknown; estimated_impact?: string}>).map(a => ({
      business_id: bid,
      category: a.category ?? "GENERAL",
      priority: a.priority ?? "routine",
      title: a.title ?? "Action",
      description: a.description ?? "",
      action_data: a.action_data ?? {},
      estimated_impact: a.estimated_impact ?? null,
      status: "pending",
    }));
    await supabase.from("aria_autopilot_actions").insert(rows);
  }

  return NextResponse.json({ actions, count: actions.length });
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

  const { status } = await req.json().catch(() => ({ status: "approved" }));
  const update: Record<string, unknown> = { status };
  if (status === "approved") update.approved_at = new Date().toISOString();
  if (status === "executed") update.executed_at = new Date().toISOString();

  const { data, error } = await supabase.from("aria_autopilot_actions").update(update).eq("id", id).eq("business_id", bid).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
}

export const GET = withErrorCapture('aria/autopilot', _GET)
export const POST = withErrorCapture('aria/autopilot', _POST)
export const PATCH = withErrorCapture('aria/autopilot', _PATCH)
