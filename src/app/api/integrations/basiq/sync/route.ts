export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture, setSentryContext } from '@/lib/api/with-error-capture';
import { listAccounts, listTransactions, isConfigured } from '@/lib/integrations/basiq';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isConfigured()) return NextResponse.json({ error: 'BASIQ_API_KEY not configured' }, { status: 500 });

  const business_id = new URL(req.url).searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses')
    .select('id, basiq_user_id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz?.basiq_user_id) return NextResponse.json({ error: 'No Basiq user — connect bank first' }, { status: 400 });
  setSentryContext({ businessId: business_id, userId: user.id, operation: 'basiq_sync', route: 'integrations/basiq/sync' });

  // Rate limit: max one sync every 4 hours
  const { data: recent } = await supabaseAdmin.from('bank_accounts')
    .select('last_synced_at').eq('business_id', business_id).order('last_synced_at', { ascending: false }).limit(1).maybeSingle();
  const lastTs = recent?.last_synced_at ? new Date(recent.last_synced_at as string).getTime() : 0;
  const minAge = 4 * 3600_000;
  if (Date.now() - lastTs < minAge) {
    return NextResponse.json({ ok: true, cached: true, next_sync_in_minutes: Math.round((minAge - (Date.now() - lastTs)) / 60_000) });
  }

  const userId = biz.basiq_user_id as string;

  let accountsSynced = 0, txnsSynced = 0;
  try {
    const accounts = await listAccounts(userId);

    // Map basiq_account_id → our internal id
    const idMap: Record<string, string> = {};
    for (const a of accounts) {
      const { data: row } = await supabaseAdmin.from('bank_accounts').upsert({
        business_id, basiq_account_id: a.id, account_name: a.name,
        account_type: a.class?.type ?? null, institution_name: a.institution,
        balance: Number(a.balance ?? 0), available_balance: Number(a.availableFunds ?? 0),
        currency: a.currency ?? 'AUD', last_synced_at: new Date().toISOString(), is_active: true,
      }, { onConflict: 'basiq_account_id' }).select('id, basiq_account_id').single();
      if (row?.id) idMap[a.id] = row.id as string;
      accountsSynced++;
    }

    const txns = await listTransactions(userId, 90);
    for (const t of txns) {
      const internal = idMap[t.account];
      try {
        await supabaseAdmin.from('bank_transactions').upsert({
          business_id, account_id: internal ?? null,
          basiq_transaction_id: t.id,
          description: t.description, amount: Number(t.amount ?? 0),
          balance: Number(t.balance ?? 0),
          transaction_date: t.postDate ?? t.transactionDate ?? null,
          category: t.subClass?.title ?? t.class ?? null,
        }, { onConflict: 'basiq_transaction_id' });
        txnsSynced++;
      } catch { /* dedup conflict — skip */ }
    }
  } catch (syncErr) {
    console.error('[basiq/sync] Basiq API unreachable — serving cached data:', syncErr);
    return NextResponse.json({
      ok: true,
      cached: true,
      degraded: true,
      message: "Couldn't refresh from Basiq — showing last synced data",
    });
  }

  return NextResponse.json({ ok: true, accounts: accountsSynced, transactions: txnsSynced });
}

export const GET = withErrorCapture('integrations/basiq/sync', _GET);
