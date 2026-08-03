export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { listAccounts } from '@/lib/integrations/basiq';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access';

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

// Basiq calls this with ?business_id=… (redirect_uri set in Basiq dashboard).
// NOTE: ?userId= is now IGNORED — see SEC-BASIQ-1 below. Still outstanding: real OAuth state
// (issueOAuthState/redeemOAuthState), which needs the Basiq Dashboard -> Customise UI redirect
// changed to ...?state={state} and therefore cannot ship from code alone. The exfiltration path is
// closed by the ownership check regardless; state adds CSRF-binding on top.
async function _GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get('business_id') ?? url.searchParams.get('state');
  if (!businessId) return NextResponse.redirect(new URL('/dashboard/integrations?bank=missing_business', req.url));

  // SEC-BASIQ-1 — this callback previously trusted BOTH ids from the query string and had no
  // authentication at all. Because `userId` was also taken from the URL, a crafted link synced
  // ANOTHER Basiq user's real bank accounts — names, institutions, balances — into a business the
  // attacker controls, where the dashboard then renders them. That is data EXFILTRATION, not just
  // pollution, which is why the session check below is not optional.
  //
  // Basiq redirects the owner's own browser here, so the session cookie is present on every
  // legitimate arrival: require it, confirm the session actually owns this business, and take
  // basiq_user_id from the businesses row so the URL can no longer name whose accounts get pulled.
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/dashboard/integrations', req.url));

  const denied = await verifyBusinessAccess(user.id, businessId);   // non-null == DENIED
  if (denied) return NextResponse.redirect(new URL('/dashboard/integrations?bank=forbidden', req.url));

  // NEVER from the query string.
  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('basiq_user_id').eq('id', businessId).maybeSingle();
  const basiqUserId = (biz?.basiq_user_id as string | null) ?? null;
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
