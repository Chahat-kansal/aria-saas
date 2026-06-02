export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { FlashRevenueAgent } from '@/lib/agents/flash-revenue-agent';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq(business_id ? 'id' : 'user_id', business_id ?? user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const bid = biz.id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: recentInterventions }, { data: settings }, { data: activeIntervention }] = await Promise.all([
    supabaseAdmin
      .from('flash_interventions')
      .select('id,triggered_by,intervention_type,channel,target_count,revenue_in_2h_before,revenue_in_2h_after,revenue_lift_pct,executed_at,expires_at,cancelled_at,message_text,target_segment')
      .eq('business_id', bid)
      .gte('executed_at', sevenDaysAgo)
      .is('cancelled_at', null)
      .order('executed_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('agent_settings')
      .select('config,enabled')
      .eq('business_id', bid)
      .eq('agent_type', 'flash_revenue')
      .maybeSingle(),
    // Active = executed in last 2h, not cancelled, not expired
    supabaseAdmin
      .from('flash_interventions')
      .select('id,intervention_type,channel,message_text,target_count,executed_at,expires_at,triggered_by')
      .eq('business_id', bid)
      .gte('executed_at', new Date(Date.now() - 7200000).toISOString())
      .is('cancelled_at', null)
      .order('executed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const interventions = recentInterventions ?? [];

  // Compute 7-day stats
  const measured = interventions.filter(i => i.revenue_lift_pct !== null);
  const avgLiftPct = measured.length
    ? Math.round(measured.reduce((s, i) => s + (Number(i.revenue_lift_pct) || 0), 0) / measured.length * 10) / 10
    : null;

  const byTrigger: Record<string, number> = {};
  for (const i of interventions) {
    byTrigger[i.triggered_by] = (byTrigger[i.triggered_by] ?? 0) + 1;
  }

  const config = (settings?.config as Record<string, unknown>) ?? {};
  const successRates = (config.intervention_success_rates as Record<string, number>) ?? {};

  return NextResponse.json({
    stats_7d: {
      total_interventions: interventions.length,
      measured_count: measured.length,
      avg_lift_pct: avgLiftPct,
      by_trigger: byTrigger,
    },
    active_intervention: activeIntervention ?? null,
    interventions,
    success_rates: successRates,
    agent_enabled: settings?.enabled ?? false,
    mode: (config.mode as string) ?? 'suggest',
  });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('id', body.business_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 403 });

  const agent = new FlashRevenueAgent();
  const result = await agent.run(biz.id);

  return NextResponse.json({
    ok: true,
    decisions: result.decisions.length,
    duration_ms: result.duration_ms,
    errors: result.errors.map(e => e.message),
  });
}

export const GET = withErrorCapture('agents/flash-revenue', _GET);
export const POST = withErrorCapture('agents/flash-revenue', _POST);
