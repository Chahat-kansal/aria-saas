export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Measures actual revenue lift 2h after each flash intervention and updates
// success rates in agent_settings so future interventions are better chosen.
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  // Find interventions that:
  // - Were executed 2–3 hours ago (measurement window)
  // - Have not been measured yet (revenue_in_2h_after = 0 and revenue_lift_pct IS NULL)
  // - Have not been cancelled
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
  const threeHoursAgo = new Date(Date.now() - 10800000).toISOString();

  const { data: pending, error } = await supabaseAdmin
    .from('flash_interventions')
    .select('id,business_id,executed_at,revenue_in_2h_before,intervention_type,triggered_by')
    .gte('executed_at', threeHoursAgo)
    .lte('executed_at', twoHoursAgo)
    .is('cancelled_at', null)
    .is('revenue_lift_pct', null);

  if (error) {
    console.error('[flash-outcomes cron]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pending?.length) {
    return NextResponse.json({ ok: true, measured: 0 });
  }

  const measured: Array<{ id: string; lift_pct: number | null }> = [];

  for (const intervention of pending) {
    try {
      const windowStart = intervention.executed_at;
      const windowEnd = new Date(new Date(intervention.executed_at).getTime() + 7200000).toISOString();

      const { data: afterSales } = await supabaseAdmin
        .from('pos_sales')
        .select('total_amount')
        .eq('business_id', intervention.business_id)
        .neq('status', 'voided')
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd);

      const { count: txCount } = await supabaseAdmin
        .from('pos_sales')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', intervention.business_id)
        .neq('status', 'voided')
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd);

      const revenueAfter = (afterSales ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const revenueBefore = Number(intervention.revenue_in_2h_before) || 0;

      let liftPct: number | null = null;
      if (revenueBefore > 0) {
        liftPct = Math.round(((revenueAfter - revenueBefore) / revenueBefore) * 100 * 10) / 10;
      }

      await supabaseAdmin
        .from('flash_interventions')
        .update({
          revenue_in_2h_after: revenueAfter,
          transactions_in_2h_after: txCount ?? 0,
          revenue_lift_pct: liftPct,
        })
        .eq('id', intervention.id);

      measured.push({ id: intervention.id, lift_pct: liftPct });

      // Update agent_settings learning: intervention_success_rates per intervention_type
      await updateSuccessRates(intervention.business_id, intervention.intervention_type, liftPct);
    } catch (err) {
      console.error('[flash-outcomes] error measuring', intervention.id, err);
    }
  }

  console.log('[flash-outcomes cron] measured', measured.length, 'interventions');
  return NextResponse.json({ ok: true, measured: measured.length, results: measured });
}

async function updateSuccessRates(business_id: string, interventionType: string, liftPct: number | null) {
  if (liftPct === null) return;

  const { data: settings } = await supabaseAdmin
    .from('agent_settings')
    .select('config')
    .eq('business_id', business_id)
    .eq('agent_type', 'flash_revenue')
    .maybeSingle();

  const config = (settings?.config as Record<string, unknown>) ?? {};
  const rates = (config.intervention_success_rates as Record<string, number>) ?? {};
  const best = (config.best_interventions as string[]) ?? [];
  const failed = (config.failed_interventions as string[]) ?? [];

  // Exponential moving average (alpha=0.3) so recent data weighs more
  const prev = rates[interventionType];
  rates[interventionType] = prev === undefined
    ? liftPct
    : Math.round((0.7 * prev + 0.3 * liftPct) * 10) / 10;

  // Rebuild best/failed lists from rates
  const sortedEntries = Object.entries(rates).sort((a, b) => b[1] - a[1]);
  const newBest = sortedEntries.filter(([, v]) => v > 5).slice(0, 3).map(([k]) => k);
  const newFailed = sortedEntries.filter(([, v]) => v < -5).map(([k]) => k);

  await supabaseAdmin
    .from('agent_settings')
    .upsert({
      business_id,
      agent_type: 'flash_revenue',
      config: {
        ...config,
        intervention_success_rates: rates,
        best_interventions: newBest.length ? newBest : best,
        failed_interventions: newFailed.length ? newFailed : failed,
      },
    }, { onConflict: 'business_id,agent_type' });
}
