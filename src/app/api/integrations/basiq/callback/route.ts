export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { listAccounts } from '@/lib/integrations/basiq';

async function syncForBusiness(businessId: string, basiqUserId: string) {
  const accounts = await listAccounts(basiqUserId);
  for (const a of accounts) {
    await supabaseAdmin.from('bank_accounts').upsert({
      business_id: businessId,
      basiq_account_id: a.id,
      account_name: a.name,
      account_type: a.class?.type ?? null,
      institution_name: a.institution,
      balance: Number(a.balance ?? 0),
      available_balance: Number(a.availableFunds ?? 0),
      currency: a.currency ?? 'AUD',
      last_synced_at: new Date().toISOString(),
      is_active: true,
    }, { onConflict: 'basiq_account_id' });
  }
  await supabaseAdmin.from('businesses').update({
    basiq_connected: true,
    basiq_connected_at: new Date().toISOString(),
  }).eq('id', businessId);
}

// Basiq calls this with ?userId=…&business_id=…  (use redirect_uri set in Basiq dashboard)
async function _GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get('business_id') ?? url.searchParams.get('state');
  const userId = url.searchParams.get('userId');
  if (!businessId) return NextResponse.redirect(new URL('/dashboard/integrations?bank=missing_business', req.url));

  // Resolve basiq user from the businesses row if not provided
  let basiqUserId = userId;
  if (!basiqUserId) {
    const { data: biz } = await supabaseAdmin.from('businesses').select('basiq_user_id').eq('id', businessId).maybeSingle();
    basiqUserId = (biz?.basiq_user_id as string | null) ?? null;
  }
  if (!basiqUserId) return NextResponse.redirect(new URL('/dashboard/integrations?bank=no_basiq_user', req.url));

  try {
    await syncForBusiness(businessId, basiqUserId);
    return NextResponse.redirect(new URL('/dashboard/integrations?bank=connected', req.url));
  } catch (e) {
    console.error('[basiq/callback] sync failed:', (e as Error).message);
    return NextResponse.redirect(new URL('/dashboard/integrations?bank=sync_failed', req.url));
  }
}

export const GET = withErrorCapture('integrations/basiq/callback', _GET);
