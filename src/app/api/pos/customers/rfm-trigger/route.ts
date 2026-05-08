export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

function rfmSegment(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return 'Champions';
  if (r >= 3 && f >= 3) return 'Loyal';
  if (r >= 4 && f <= 2 && m <= 2) return 'Promising';
  if (r <= 2 && f >= 3) return 'At Risk';
  if (r === 5 && f === 1) return 'New';
  if (r === 1) return 'Lost';
  return 'Promising';
}

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

// Authenticated RFM trigger — runs RFM for the current user's business only.
// No CRON_SECRET needed; uses session auth instead.
export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const { data: customers } = await supabase.from('customers').select('id').eq('business_id', bid).limit(2000);
  if (!customers?.length) return NextResponse.json({ processed: 0, segments: {} });

  const { data: salesRaw } = await supabase.from('pos_sales')
    .select('customer_id,total_amount,created_at')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', twelveMonthsAgo.toISOString())
    .not('customer_id', 'is', null)
    .limit(20000);

  const salesByCustomer = new Map<string, Array<{ total_amount: number; created_at: string }>>();
  for (const s of (salesRaw ?? [])) {
    if (!s.customer_id) continue;
    if (!salesByCustomer.has(s.customer_id)) salesByCustomer.set(s.customer_id, []);
    salesByCustomer.get(s.customer_id)!.push(s);
  }

  // Monetary quintiles for this business
  const allSpends = Array.from(salesByCustomer.values())
    .map(ss => ss.reduce((t, s) => t + (s.total_amount ?? 0), 0))
    .sort((a, b) => a - b);
  const q = (p: number) => allSpends[Math.floor(allSpends.length * p)] ?? 0;
  const [q20, q40, q60, q80] = [q(0.2), q(0.4), q(0.6), q(0.8)];

  function mScore(spend: number) {
    if (spend >= q80) return 5;
    if (spend >= q60) return 4;
    if (spend >= q40) return 3;
    if (spend >= q20) return 2;
    return 1;
  }

  const updates: Array<Record<string, unknown>> = [];
  for (const cust of customers) {
    const ss = salesByCustomer.get(cust.id) ?? [];
    if (ss.length === 0) {
      updates.push({ id: cust.id, rfm_score: '111', rfm_score_numeric: 111, customer_segment: 'Lost', churn_risk: 95, predicted_next_visit: null });
      continue;
    }
    const sorted = [...ss].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastDays = Math.floor((now.getTime() - new Date(sorted[0].created_at).getTime()) / 86400000);
    const freq = ss.length;
    const spend = ss.reduce((t, s) => t + (s.total_amount ?? 0), 0);
    const r = lastDays <= 30 ? 5 : lastDays <= 60 ? 4 : lastDays <= 90 ? 3 : lastDays <= 180 ? 2 : 1;
    const f = freq >= 12 ? 5 : freq >= 6 ? 4 : freq >= 3 ? 3 : freq >= 2 ? 2 : 1;
    const m = mScore(spend);
    const seg = rfmSegment(r, f, m);
    const churn = Math.max(0, Math.min(100, Math.round((5 - r) * 20 + (5 - f) * 4)));
    const intervals = sorted.slice(0, -1).map((s, i) => (new Date(s.created_at).getTime() - new Date(sorted[i + 1].created_at).getTime()) / 86400000);
    const avgGap = intervals.length > 0 ? intervals.reduce((t, v) => t + v, 0) / intervals.length : null;
    const predictedNext = avgGap ? new Date(new Date(sorted[0].created_at).getTime() + avgGap * 1.1 * 86400000).toISOString() : null;
    updates.push({ id: cust.id, rfm_score: `${r}${f}${m}`, rfm_score_numeric: r * 100 + f * 10 + m, customer_segment: seg, churn_risk: churn, predicted_next_visit: predictedNext });
  }

  // Batch upsert in groups of 500
  for (let i = 0; i < updates.length; i += 500) {
    const { error: upsertErr } = await supabase.from('customers').upsert(updates.slice(i, i + 500) as any[], { onConflict: 'id' });
    if (upsertErr) console.error('[rfm-trigger] upsert failed:', upsertErr.message);
  }

  const segCounts = updates.reduce((acc: Record<string, number>, u) => {
    const s = u.customer_segment as string;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ processed: updates.length, segments: segCounts });
}
