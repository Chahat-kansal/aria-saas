export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { generateInsight } from '@/lib/aria-insights';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ segments: [] });

  const { data: customers } = await supabase.from('customers').select('id,customer_segment,total_spent,churn_risk').eq('business_id', bid).limit(10000);

  const segMap = new Map<string, { count: number; ltv: number }>();
  for (const c of (customers ?? [])) {
    const seg = (c.customer_segment as string) ?? 'New';
    const e = segMap.get(seg) ?? { count: 0, ltv: 0 };
    e.count++;
    e.ltv += (c.total_spent as number ?? 0);
    segMap.set(seg, e);
  }

  const ORDER = ['Champions','Loyal','Promising','At Risk','New','Lost'];
  const segments = ORDER.filter(s => segMap.has(s)).map(s => {
    const e = segMap.get(s)!;
    return { segment: s, count: e.count, ltv: e.ltv, avg_spend: e.count > 0 ? e.ltv / e.count : 0, top_product: null };
  });

  const champions = segments.find(s => s.segment === 'Champions');
  const atRisk = segments.find(s => s.segment === 'At Risk');
  let insight = null;
  if (bid) {
    const res = await generateInsight({ business_id: bid, context: 'customer_segments rfm', data: { champions: champions ? { count: champions.count, ltv: champions.ltv } : null, atRisk: atRisk ? { count: atRisk.count, ltv: atRisk.ltv } : null, total: customers?.length ?? 0 }, maxBullets: 2 });
    insight = { bullets: res.bullets };
  }

  return NextResponse.json({ segments, insight });
}

export const GET = withErrorCapture('pos/customers/segments', _GET)
