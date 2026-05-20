export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const appId  = process.env.FACEBOOK_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!appId) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=Facebook+app+not+configured.+Add+FACEBOOK_APP_ID+to+Vercel+env+vars`);
  }

  const scope = ['pages_manage_posts','pages_read_engagement','instagram_basic','instagram_content_publish','pages_show_list'].join(',');
  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', `${appUrl}/api/social/callback/facebook`);
  url.searchParams.set('scope', scope);
  url.searchParams.set('response_type', 'code');
  // Pass return destination through OAuth state param
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get('return_to') ?? 'dashboard';
  url.searchParams.set('state', returnTo);

  return NextResponse.redirect(url.toString());
}

export const GET = withErrorCapture('social/connect/facebook', _GET)
