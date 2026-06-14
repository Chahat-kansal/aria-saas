export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Measures 30-day revenue response per CLV intervention.
// Also refreshes clv_portfolio_summary intervention stats.
// Schedule externally: Monday 7am AEST "0 19 * * 1" UTC
// Not added to vercel.json (already at function/cron limit).
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Find interventions sent 30+ days ago that haven't been measured yet
  const { data: pending, error } = await supabaseAdmin
    .from('customer_clv_scores')
    .select('id,business_id,customer_id,intervention_sent_at,predicted_monthly_revenue')
    .not('intervention_sent_at', 'is', null)
    .is('revenue_in_30d_after', null)
    .lte('intervention_sent_at', thirtyDaysAgo);

  if (error) {
    console.error('[clv-outcomes cron]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let measured = 0;
  for (const score of (pending ?? [])) {
    try {
      const windowEnd = new Date(new Date(score.intervention_sent_at).getTime() + 30 * 86400000).toISOString();

      const [{ data: salesData }, { count: visitCount }] = await Promise.all([
        supabaseAdmin
          .from('pos_sales')
          .select('total_amount')
          .eq('business_id', score.business_id)
          .eq('customer_id', score.customer_id)
          .neq('status', 'voided')
          .gte('created_at', score.intervention_sent_at)
          .lte('created_at', windowEnd),
        supabaseAdmin
          .from('pos_sales')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', score.business_id)
          .eq('customer_id', score.customer_id)
          .neq('status', 'voided')
          .gte('created_at', score.intervention_sent_at)
          .lte('created_at', windowEnd),
      ]);

      const revenueAfter = (salesData ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const responded = revenueAfter > (Number(score.predicted_monthly_revenue) || 0) * 0.5;

      await supabaseAdmin
        .from('customer_clv_scores')
        .update({
          revenue_in_30d_after: revenueAfter,
          visit_count_in_30d_after: visitCount ?? 0,
          intervention_responded: responded,
        })
        .eq('id', score.id);

      measured++;
    } catch (err) {
      console.error('[clv-outcomes] error measuring score', score.id, err);
    }
  }

  // Refresh portfolio summary intervention stats for affected businesses
  const affectedBizIds = [...new Set((pending ?? []).map(p => p.business_id))];
  for (const bizId of affectedBizIds) {
    try {
      const { data: allSent } = await supabaseAdmin
        .from('customer_clv_scores')
        .select('intervention_responded,revenue_in_30d_after')
        .eq('business_id', bizId)
        .not('intervention_sent_at', 'is', null);

      const sent = (allSent ?? []).length;
      const responded = (allSent ?? []).filter(s => s.intervention_responded).length;
      const attributed = (allSent ?? []).filter(s => s.intervention_responded).reduce((sum, s) => sum + (Number(s.revenue_in_30d_after) || 0), 0);

      await supabaseAdmin
        .from('clv_portfolio_summary')
        .upsert({
          business_id: bizId,
          interventions_sent: sent,
          interventions_responded: responded,
          response_rate_pct: sent > 0 ? Math.round(responded / sent * 1000) / 10 : 0,
          revenue_attributed_to_interventions: Math.round(attributed * 100) / 100,
        }, { onConflict: 'business_id' });
    } catch (err) {
      console.error('[clv-outcomes] portfolio update error', bizId, err);
    }
  }

  console.log('[clv-outcomes cron] measured', measured, 'interventions,', affectedBizIds.length, 'businesses updated');
  return NextResponse.json({ ok: true, measured, businesses_updated: affectedBizIds.length });
}
