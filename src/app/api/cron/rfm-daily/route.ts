export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

function rfmScore(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return 'Champions';
  if (r >= 3 && f >= 3) return 'Loyal';
  if (r >= 4 && f <= 2 && m <= 2) return 'Promising';
  if (r <= 2 && f >= 3) return 'At Risk';
  if (r === 5 && f === 1) return 'New';
  if (r === 1) return 'Lost';
  return 'Promising';
}

export async function GET(req: Request) {
  // Only allow Vercel cron or internal calls
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // Fetch all customers with their recent sales
  const { data: customers } = await supabase.from('customers').select('id,business_id').limit(5000);
  if (!customers?.length) return NextResponse.json({ processed: 0 });

  // Get all sales last 12 months grouped by customer
  const { data: salesRaw } = await supabase.from('pos_sales')
    .select('customer_id,total_amount,created_at')
    .neq('status', 'voided')
    .gte('created_at', twelveMonthsAgo.toISOString())
    .not('customer_id', 'is', null)
    .limit(50000);

  const salesByCustomer = new Map<string, Array<{ total_amount: number; created_at: string }>>();
  for (const s of (salesRaw ?? [])) {
    if (!s.customer_id) continue;
    if (!salesByCustomer.has(s.customer_id)) salesByCustomer.set(s.customer_id, []);
    salesByCustomer.get(s.customer_id)!.push(s);
  }

  // Compute monetary quintiles for M scoring
  const allSpends = Array.from(salesByCustomer.values()).map(ss => ss.reduce((t, s) => t + (s.total_amount ?? 0), 0)).sort((a, b) => a - b);
  const q = (p: number) => allSpends[Math.floor(allSpends.length * p)] ?? 0;
  const [q20, q40, q60, q80] = [q(0.2), q(0.4), q(0.6), q(0.8)];

  function mScore(spend: number) {
    if (spend >= q80) return 5;
    if (spend >= q60) return 4;
    if (spend >= q40) return 3;
    if (spend >= q20) return 2;
    return 1;
  }

  let processed = 0;
  const updates: Array<{ id: string; rfm_score: string; rfm_score_numeric: number; customer_segment: string; churn_risk: number }> = [];

  for (const cust of customers) {
    const ss = salesByCustomer.get(cust.id) ?? [];
    if (ss.length === 0) {
      updates.push({ id: cust.id, rfm_score: '111', rfm_score_numeric: 111, customer_segment: 'Lost', churn_risk: 95 });
      continue;
    }

    const sorted = [...ss].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastPurchaseDays = Math.floor((now.getTime() - new Date(sorted[0].created_at).getTime()) / 86400000);
    const freq = ss.length;
    const totalSpend = ss.reduce((t, s) => t + (s.total_amount ?? 0), 0);

    const r = lastPurchaseDays <= 30 ? 5 : lastPurchaseDays <= 60 ? 4 : lastPurchaseDays <= 90 ? 3 : lastPurchaseDays <= 180 ? 2 : 1;
    const f = freq >= 12 ? 5 : freq >= 6 ? 4 : freq >= 3 ? 3 : freq >= 2 ? 2 : 1;
    const m = mScore(totalSpend);

    const seg = rfmScore(r, f, m);
    const numeric = r * 100 + f * 10 + m;
    const churn = Math.max(0, Math.min(100, Math.round((5 - r) * 20 + (5 - f) * 4)));

    // Predict next visit: avg interval * 1.1
    const intervals = sorted.slice(0, -1).map((s, i) => (new Date(s.created_at).getTime() - new Date(sorted[i + 1].created_at).getTime()) / 86400000);
    const avgInterval = intervals.length > 0 ? intervals.reduce((t, v) => t + v, 0) / intervals.length : null;
    const predictedNext = avgInterval ? new Date(new Date(sorted[0].created_at).getTime() + avgInterval * 1.1 * 86400000).toISOString() : null;

    updates.push({ id: cust.id, rfm_score: `${r}${f}${m}`, rfm_score_numeric: numeric, customer_segment: seg, churn_risk: churn, ...(predictedNext ? { predicted_next_visit: predictedNext } : {}) } as any);
    processed++;
  }

  // Upsert in batches of 500 — individual updates at 5k scale would timeout
  for (let i = 0; i < updates.length; i += 500) {
    const batch = updates.slice(i, i + 500);
    const { error } = await supabase.from('customers').upsert(
      batch.map(u => ({
        id: u.id,
        rfm_score: u.rfm_score,
        rfm_score_numeric: u.rfm_score_numeric,
        customer_segment: u.customer_segment,
        churn_risk: u.churn_risk,
        predicted_next_visit: (u as any).predicted_next_visit ?? null,
      })),
      { onConflict: 'id' }
    );
    if (error) console.error(`[rfm-daily] batch upsert failed (offset ${i}):`, error.message);
  }

  return NextResponse.json({ processed, total: customers.length, segments: updates.reduce((acc: Record<string, number>, u) => { acc[u.customer_segment] = (acc[u.customer_segment] ?? 0) + 1; return acc; }, {}) });
}
