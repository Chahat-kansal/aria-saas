export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import crypto from 'crypto';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get('signed_request');

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
    }

    const parts = signedRequest.split('.');
    if (parts.length !== 2) {
      return NextResponse.json({ error: 'Invalid signed_request format' }, { status: 400 });
    }

    const [encodedSig, payload] = parts;

    // M-06 — verify the HMAC-SHA256 signature before trusting anything in the payload. Facebook's
    // signed_request format: encoded_sig = base64url(HMAC-SHA256(encoded_payload, app_secret)).
    // Without this, anyone could POST an arbitrary user_id and delete someone else's
    // social_connections rows.
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appSecret) {
      console.error('[data-deletion] FACEBOOK_APP_SECRET not configured — rejecting');
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const expectedSig = crypto.createHmac('sha256', appSecret).update(payload).digest();
    const providedSig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedSig, expectedSig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Decode the payload (base64url → JSON)
    const decoded = Buffer.from(
      payload.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');

    let data: { user_id?: string; issued_at?: number; algorithm?: string };
    try {
      data = JSON.parse(decoded);
    } catch {
      return NextResponse.json({ error: 'Invalid payload JSON' }, { status: 400 });
    }

    const userId = data.user_id;
    if (!userId) {
      return NextResponse.json({ error: 'No user_id in payload' }, { status: 400 });
    }

    // Delete all social connections for this Facebook user
    // platform_account_id stores the Facebook user ID for facebook/instagram connections
    const supabase = createServerSupabaseClient();

    await supabase.from('social_connections')
      .delete()
      .eq('platform', 'facebook')
      .eq('platform_account_id', userId);

    await supabase.from('social_connections')
      .delete()
      .eq('platform', 'instagram')
      .eq('platform_account_id', userId);

    console.log(`[data-deletion] Processed Facebook deletion for user: ${userId}`);

    const confirmationCode = crypto.randomBytes(16).toString('hex');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://aria-saas-fot6.vercel.app';

    // Facebook requires this exact response shape
    return NextResponse.json({
      url: `${appUrl}/data-deletion?confirmation_code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (err: any) {
    console.error('[data-deletion] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('confirmation_code');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://aria-saas-fot6.vercel.app';

  if (code) {
    return NextResponse.json({
      status: 'completed',
      confirmation_code: code,
      message: 'Your Facebook data has been deleted from Aria OS.',
    });
  }

  return NextResponse.redirect(`${appUrl}/data-deletion`);
}

export const GET = withErrorCapture('social/data-deletion', _GET)
export const POST = withErrorCapture('social/data-deletion', _POST)
