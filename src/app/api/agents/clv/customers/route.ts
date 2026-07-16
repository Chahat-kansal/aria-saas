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
  const tier = searchParams.get('tier');
  const priority = searchParams.get('priority');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0'), 0);

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq(business_id ? 'id' : 'user_id', business_id ?? user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

  let query = supabaseAdmin
    .from('customer_clv_scores')
    .select('id,customer_id,clv_tier,visit_trend,spend_trend,intervention_priority,predicted_annual_revenue,predicted_3yr_clv,avg_basket_size,visit_frequency_per_month,days_since_last_visit,recommended_offer_type,recommended_offer_value,recommended_message,intervention_rationale,intervention_sent_at,intervention_responded,scored_at,pos_customers(name,email,phone,marketing_consent)')
    .eq('business_id', biz.id)
    .order('scored_at', { ascending: false });

  if (tier) query = query.eq('clv_tier', tier);
  if (priority) query = query.eq('intervention_priority', priority);

  const { data: allScores, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate by customer (most recent score per customer)
  const seen = new Set<string>();
  const deduped = (allScores ?? []).filter(r => {
    if (seen.has(r.customer_id)) return false;
    seen.add(r.customer_id);
    return true;
  });

  // Sort: urgent first, then by predicted_annual_revenue DESC
  const sorted = deduped.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.intervention_priority] ?? 4;
    const pb = PRIORITY_ORDER[b.intervention_priority] ?? 4;
    if (pa !== pb) return pa - pb;
    return b.predicted_annual_revenue - a.predicted_annual_revenue;
  });

  const page = sorted.slice(offset, offset + limit);

  return NextResponse.json({
    customers: page,
    total: sorted.length,
    offset,
    limit,
    // INTEL-TRUTH-1 — every predicted_*/p_alive figure on each customer row is a forecast, not a
    // database fact. See CLV_PREDICTION_GROUNDING in clv-agent.ts.
    figure_grounding: CLV_PREDICTION_GROUNDING,
  });
}

export const GET = withErrorCapture('agents/clv/customers', _GET);
