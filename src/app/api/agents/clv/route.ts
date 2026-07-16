export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { CLV_PREDICTION_GROUNDING } from '@/lib/agents/clv-agent';

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

  const [{ data: portfolio }, { data: topOpportunities }] = await Promise.all([
    supabaseAdmin
      .from('clv_portfolio_summary')
      .select('*')
      .eq('business_id', biz.id)
      .maybeSingle(),
    supabaseAdmin
      .from('customer_clv_scores')
      .select('id,customer_id,clv_tier,intervention_priority,predicted_annual_revenue,predicted_3yr_clv,recommended_offer_type,recommended_offer_value,recommended_message,days_since_last_visit,scored_at,pos_customers(name,email,phone)')
      .eq('business_id', biz.id)
      .in('intervention_priority', ['urgent', 'high'])
      .is('intervention_sent_at', null)
      .order('scored_at', { ascending: false })
      .limit(10),
  ]);

  // Deduplicate top opportunities by customer (latest score per customer)
  const seen = new Set<string>();
  const dedupedOpportunities = (topOpportunities ?? []).filter(r => {
    if (seen.has(r.customer_id)) return false;
    seen.add(r.customer_id);
    return true;
  });

  return NextResponse.json({
    portfolio: portfolio ?? null,
    top_opportunities: dedupedOpportunities,
    // INTEL-TRUTH-1 — every predicted_*/at_risk_annual_revenue/avg_clv_* figure in `portfolio` and
    // `top_opportunities` is a forecast, not a database fact. See CLV_PREDICTION_GROUNDING.
    figure_grounding: CLV_PREDICTION_GROUNDING,
  });
}

export const GET = withErrorCapture('agents/clv', _GET);
