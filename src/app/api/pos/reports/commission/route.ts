export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = searchParams.get('to') ?? new Date().toISOString().split('T')[0];

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: commissions } = await supabase
    .from('pos_commissions')
    .select('*, pos_sales(total_amount, created_at, payment_method)')
    .eq('business_id', business_id)
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false });

  // Aggregate by cashier
  const staffMap: Record<string, {
    name: string; sales_count: number; total_sales_cents: number;
    commission_cents: number; pending: number; paid: number;
    commissions: typeof commissions;
  }> = {};

  for (const c of commissions ?? []) {
    const name = c.pos_user_name;
    if (!staffMap[name]) {
      staffMap[name] = { name, sales_count: 0, total_sales_cents: 0, commission_cents: 0, pending: 0, paid: 0, commissions: [] };
    }
    staffMap[name].sales_count++;
    staffMap[name].total_sales_cents += c.sale_total_cents ?? 0;
    staffMap[name].commission_cents += c.commission_cents ?? 0;
    if (c.status === 'pending') staffMap[name].pending += c.commission_cents ?? 0;
    if (c.status === 'paid') staffMap[name].paid += c.commission_cents ?? 0;
    (staffMap[name].commissions as typeof commissions)?.push(c);
  }

  const leaderboard = Object.values(staffMap).sort((a, b) => b.commission_cents - a.commission_cents);
  const totals = {
    total_commission_cents: leaderboard.reduce((s, r) => s + r.commission_cents, 0),
    total_sales_cents: leaderboard.reduce((s, r) => s + r.total_sales_cents, 0),
    pending_cents: leaderboard.reduce((s, r) => s + r.pending, 0),
  };

  return NextResponse.json({ leaderboard, totals, from, to });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, pos_user_name, status = 'paid' } = body;
  if (!business_id || !pos_user_name) return NextResponse.json({ error: 'business_id and pos_user_name required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.from('pos_commissions')
    .update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null })
    .eq('business_id', business_id)
    .eq('pos_user_name', pos_user_name)
    .eq('status', 'pending');

  return NextResponse.json({ ok: true });
}
