export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (error) return NextResponse.redirect(`${appUrl}/dashboard/social?error=${encodeURIComponent(error)}`);
  if (!code) return NextResponse.redirect(`${appUrl}/dashboard/social?error=missing_code`);

  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${appUrl}/dashboard/social?error=not_authenticated`);

    const { data: biz } = await supabase.from('businesses').select('id')
      .eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!biz) return NextResponse.redirect(`${appUrl}/dashboard/social?error=no_business`);

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? '',
        redirect_uri: `${appUrl}/api/social/callback/google`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error(tokens.error_description || 'No access token');

    // Get GMB accounts
    const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const accountsData = await accountsRes.json();
    console.log('[google/callback] accounts response:', JSON.stringify(accountsData))
    const account = accountsData.accounts?.[0] ?? null;
    // Don't crash — save connection even without account data
    // The user can retry fetching account info later

    // Get first location (only if we have an account)
    let location: any = null;
    if (account) {
      try {
        const locRes = await fetch(
          `https://mybusiness.googleapis.com/v4/${account.name}/locations`,
          { headers: { 'Authorization': `Bearer ${tokens.access_token}` } }
        );
        const locData = await locRes.json();
        location = locData.locations?.[0] ?? null;
      } catch { /* non-fatal */ }
    }

    await supabase.from('social_connections').upsert({
      business_id: biz.id,
      platform: 'google_business',
      platform_account_id: account?.name ?? null,
      platform_account_name: account?.accountName ?? account?.name ?? null,
      platform_page_id: location?.name ?? null,
      access_token: tokens.refresh_token ?? tokens.access_token,
      token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      is_active: true,
    }, { onConflict: 'business_id,platform' });

    const msg = account
      ? 'connected=google'
      : 'connected=google&warning=no_gmb_account_found'
    return NextResponse.redirect(`${appUrl}/dashboard/social?${msg}`);
  } catch (err: any) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=${encodeURIComponent(err.message)}`);
  }
}

export const GET = withErrorCapture('social/callback/google', _GET)
