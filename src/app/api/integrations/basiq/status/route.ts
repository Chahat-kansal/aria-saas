export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface TxnRow { amount: number | null; transaction_date: string | null; category: string | null; description: string | null }

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const business_id = new URL(req.url).searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses')
    .select('id, basiq_connected, basiq_connected_at').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ data: accounts }, { data: recentTxns }] = await Promise.all([
    supabaseAdmin.from('bank_accounts')
      .select('id, basiq_account_id, account_name, institution_name, account_type, balance, available_balance, currency, last_synced_at')
      .eq('business_id', business_id).eq('is_active', true).order('balance', { ascending: false }),
    supabaseAdmin.from('bank_transactions')
      .select('amount, transaction_date, category, description')
      .eq('business_id', business_id).order('transaction_date', { ascending: false }).limit(200),
  ]);

  const rows = (recentTxns ?? []) as TxnRow[];
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthRows = rows.filter(r => r.transaction_date && new Date(r.transaction_date).getTime() >= monthStart.getTime());
  const income = monthRows.filter(r => Number(r.amount ?? 0) > 0).reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const expenses = monthRows.filter(r => Number(r.amount ?? 0) < 0).reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const totalBalance = (accounts ?? []).reduce((a, x) => a + Number(x.balance ?? 0), 0);

  // Top categories (expenses)
  const cats: Record<string, number> = {};
  for (const r of monthRows) {
    const amt = Number(r.amount ?? 0);
    if (amt >= 0) continue;
    const c = r.category ?? 'Uncategorised';
    cats[c] = (cats[c] ?? 0) + Math.abs(amt);
  }
  const topCategories = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }));

  return NextResponse.json({
    connected: Boolean(biz.basiq_connected),
    connected_at: biz.basiq_connected_at,
    accounts: accounts ?? [],
    total_balance: Math.round(totalBalance * 100) / 100,
    month: {
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((income + expenses) * 100) / 100,
      top_categories: topCategories,
    },
    recent_transactions: rows.slice(0, 10),
  });
}

export const GET = withErrorCapture('integrations/basiq/status', _GET);
