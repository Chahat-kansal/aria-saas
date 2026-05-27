export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

interface AiCallRow { agent_key: string | null; model_id: string | null; input_tokens: number | null; output_tokens: number | null; created_at: string }
interface AutopilotRow { id: string; action_type: string | null; status: string | null; created_at: string; details?: unknown }
interface MemoryRow { id: string; kind: string | null; content: string | null; topic: string | null; importance: number | null }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const now = Date.now();
  const monthAgo = new Date(now - 30 * 86400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86400_000).toISOString();

  const [aiCalls, autopilot, memory, briefing, intel, compMon, custScore] = await Promise.all([
    supabase.from('aria_ai_calls').select('agent_key, model_id, input_tokens, output_tokens, created_at').eq('business_id', bid).gte('created_at', monthAgo).limit(2000),
    supabase.from('aria_autopilot_actions').select('id, action_type, status, created_at, details').eq('business_id', bid).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(50),
    supabase.from('aria_business_memory').select('id, kind, content, topic, importance').eq('business_id', bid).order('importance', { ascending: false }).limit(20),
    supabase.from('council_runs').select('mode, created_at').eq('business_id', bid).eq('mode', 'briefing').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('intelligence_events').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('acknowledged', false),
    supabase.from('competitor_snapshots').select('created_at').eq('business_id', bid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('aria_ai_calls').select('created_at').eq('business_id', bid).eq('agent_key', 'customer_scoring').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const calls = (aiCalls.data ?? []) as AiCallRow[];
  const totalCalls = calls.length;
  const totalTokens = calls.reduce((a, c) => a + Number(c.input_tokens ?? 0) + Number(c.output_tokens ?? 0), 0);
  // Rough cost @ Haiku rates: $0.25/M input, $1.25/M output ≈ avg $0.50/M
  const estCostUsd = (totalTokens / 1_000_000) * 0.5;

  const byAgent: Record<string, { calls: number; tokens: number }> = {};
  for (const c of calls) {
    const k = c.agent_key ?? 'unknown';
    if (!byAgent[k]) byAgent[k] = { calls: 0, tokens: 0 };
    byAgent[k].calls++;
    byAgent[k].tokens += Number(c.input_tokens ?? 0) + Number(c.output_tokens ?? 0);
  }
  const agentBreakdown = Object.entries(byAgent).map(([agent, v]) => ({ agent, ...v })).sort((a, b) => b.calls - a.calls);

  return NextResponse.json({
    brain_status: {
      daily_briefing_at: briefing.data?.created_at ?? null,
      intelligence_signals: intel.count ?? 0,
      competitor_check_at: compMon.data?.created_at ?? null,
      customer_scoring_at: custScore.data?.created_at ?? null,
    },
    ai_usage: { total_calls: totalCalls, total_tokens: totalTokens, est_cost_usd: Math.round(estCostUsd * 100) / 100, by_agent: agentBreakdown },
    autopilot_actions: (autopilot.data ?? []) as AutopilotRow[],
    memory: (memory.data ?? []) as MemoryRow[],
    recent_calls: calls.slice(-20).reverse(),
  });
}

export const GET = withErrorCapture('aria-os/status', _GET);
