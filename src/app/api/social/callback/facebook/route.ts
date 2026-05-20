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

    // Exchange code for short-lived token
    const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: `${appUrl}/api/social/callback/facebook`,
        code,
      }),
    });
    const { access_token: shortToken } = await tokenRes.json();
    if (!shortToken) throw new Error('No short-lived token');

    // Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${shortToken}`
    );
    const { access_token: longToken, expires_in } = await longRes.json();
    if (!longToken) throw new Error('No long-lived token');

    // Get pages
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`);
    const { data: pages } = await pagesRes.json();
    const page = pages?.[0];
    if (!page) throw new Error('No Facebook Pages found. Create a Facebook Page first.');

    // Get Instagram account linked to page
    const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
    const igData = await igRes.json();
    const igAccountId: string | null = igData.instagram_business_account?.id ?? null;

    let igUsername: string | null = null;
    if (igAccountId) {
      const igUserRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}?fields=username&access_token=${page.access_token}`);
      const igUser = await igUserRes.json();
      igUsername = igUser.username ?? null;
    }

    const expiresAt = new Date(Date.now() + (expires_in || 5184000) * 1000).toISOString();

    // Save Facebook connection
    await supabase.from('social_connections').upsert({
      business_id: biz.id,
      platform: 'facebook',
      platform_page_id: page.id,
      platform_account_name: page.name,
      access_token: page.access_token,
      token_expires_at: expiresAt,
      is_active: true,
    }, { onConflict: 'business_id,platform' });

    // Save Instagram connection
    if (igAccountId) {
      await supabase.from('social_connections').upsert({
        business_id: biz.id,
        platform: 'instagram',
        platform_account_id: igAccountId,
        instagram_account_id: igAccountId,
        platform_account_name: igUsername,
        platform_page_id: page.id,
        access_token: page.access_token,
        token_expires_at: expiresAt,
        is_active: true,
      }, { onConflict: 'business_id,platform' });
    }

    const state = searchParams.get('state') ?? 'dashboard';
    const destination = state === 'onboarding'
      ? `${appUrl}/onboarding/connect?connected=facebook`
      : `${appUrl}/dashboard/social?connected=facebook`;
    return NextResponse.redirect(destination);
  } catch (err: any) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=${encodeURIComponent(err.message)}`);
  }
}

export const GET = withErrorCapture('social/callback/facebook', _GET)
