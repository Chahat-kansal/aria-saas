export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=Google+Business+not+configured.+Add+GOOGLE_BUSINESS_CLIENT_ID+to+Vercel+env+vars`);
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${appUrl}/api/social/callback/google`);
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/business.manage');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(url.toString());
}

export const GET = withErrorCapture('social/connect/google', _GET)
