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
      .eq('user_id', user.id).eq('is_active', true)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
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

    // Get Google profile info (always works — basic openid scope)
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = await profileRes.json();

    // Try to get GMB accounts — non-fatal if it fails
    let accountName = profile.name ?? 'Google Business';
    let accountId = profile.id ?? 'unknown';
    let locationName: string | null = null;

    try {
      const accountsRes = await fetch(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const accountsData = await accountsRes.json();
      console.log('[google/callback] accounts:', JSON.stringify(accountsData));

      const account = accountsData.accounts?.[0];
      if (account) {
        accountId = account.name;
        accountName = account.accountName || account.name;

        // Try to get location
        try {
          const locRes = await fetch(
            `https://mybusiness.googleapis.com/v4/${account.name}/locations`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          );
          const locData = await locRes.json();
          console.log('[google/callback] locations:', JSON.stringify(locData));
          locationName = locData.locations?.[0]?.name ?? null;
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      console.error('[google/callback] accounts API error:', e);
      // Continue — save token anyway so user doesn't have to re-auth
    }

    // Save connection — always save even without account data
    // Token is stored so we can retry API calls after app verification
    await supabase.from('social_connections').upsert({
      business_id: biz.id,
      platform: 'google_business',
      platform_account_id: accountId,
      platform_account_name: accountName,
      platform_page_id: locationName,
      account_handle: profile.email ?? null,
      profile_picture: profile.picture ?? null,
      access_token: tokens.refresh_token ?? tokens.access_token,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      is_active: true,
      connected_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'business_id,platform' });

    return NextResponse.redirect(`${appUrl}/dashboard/social?connected=google`);
  } catch (err: any) {
    console.error('[google/callback] fatal error:', err.message);
    return NextResponse.redirect(
      `${appUrl}/dashboard/social?error=${encodeURIComponent(err.message)}`
    );
  }
}

export const GET = withErrorCapture('social/callback/google', _GET)
