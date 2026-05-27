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

interface TxnRow { customer_id: string | null; type: string; points_delta: number | null; created_at: string }

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ flags: [] });

  // Detect: >3 redemptions/week per customer + sudden balance spike
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: txns } = await supabase.from('loyalty_transactions')
    .select('customer_id, type, points_delta, created_at')
    .eq('business_id', bid)
    .gte('created_at', weekAgo)
    .limit(2000);

  const perCustomer: Record<string, { redeems: number; earned: number }> = {};
  for (const t of (txns ?? []) as TxnRow[]) {
    const cid = t.customer_id;
    if (!cid) continue;
    if (!perCustomer[cid]) perCustomer[cid] = { redeems: 0, earned: 0 };
    if (t.type === 'redeem') perCustomer[cid].redeems++;
    if ((t.points_delta ?? 0) > 0) perCustomer[cid].earned += Number(t.points_delta ?? 0);
  }

  const ruleFlags: Array<{ customer_id: string; flag_type: string; details: Record<string, unknown> }> = [];
  for (const [cid, v] of Object.entries(perCustomer)) {
    if (v.redeems > 3) ruleFlags.push({ customer_id: cid, flag_type: 'frequent_redeem', details: { redeems_this_week: v.redeems } });
    if (v.earned > 5000) ruleFlags.push({ customer_id: cid, flag_type: 'balance_spike', details: { points_earned_this_week: v.earned } });
  }

  const ids = Array.from(new Set(ruleFlags.map(f => f.customer_id)));
  const { data: customers } = ids.length > 0
    ? await supabase.from('pos_customers').select('id, name').in('id', ids)
    : { data: [] };
  const nameMap = new Map((customers ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  const flagsWithNames = ruleFlags.map(f => ({ ...f, customer_name: nameMap.get(f.customer_id) ?? 'Unknown' }));

  // Persist new flags (best-effort)
  if (flagsWithNames.length > 0) {
    try {
      await supabase.from('loyalty_fraud_flags').insert(
        ruleFlags.map(f => ({ business_id: bid, customer_id: f.customer_id, flag_type: f.flag_type, details: f.details }))
      );
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ flags: flagsWithNames });
}

export const GET = withErrorCapture('loyalty/fraud', _GET);
