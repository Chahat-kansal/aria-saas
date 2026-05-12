export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const OAUTH_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

const SCOPES = [
  'MERCHANT_PROFILE_READ',
  'ITEMS_READ',
  'INVENTORY_READ',
  'ORDERS_READ',
  'CUSTOMERS_READ',
  'CUSTOMERS_WRITE',
].join(' ');

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.SQUARE_APPLICATION_ID) {
    return NextResponse.json({ error: 'SQUARE_APPLICATION_ID not configured' }, { status: 500 });
  }

  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
  const bid = active?.business_id
    ?? (await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;

  if (!bid) {
    return NextResponse.json({ error: 'No business found. Complete onboarding first.' }, { status: 400 });
  }

  // Derive origin from the incoming request — guaranteed to match what Square sees
  const reqUrl = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    ?? `${reqUrl.protocol}//${reqUrl.host}`;

  const redirectUri = `${origin}/api/integrations/square/callback`;

  const state = Buffer.from(JSON.stringify({ bid, uid: user.id, ts: Date.now() })).toString('base64url');

  const params = new URLSearchParams({
    client_id: process.env.SQUARE_APPLICATION_ID,
    scope: SCOPES,
    state,
    redirect_uri: redirectUri,
  });

  const authorizeUrl = `${OAUTH_BASE}/oauth2/authorize?${params.toString()}`;

  // Log so you can verify the exact redirect_uri being sent
  console.log('[Square connect] redirect_uri:', redirectUri);

  return NextResponse.redirect(authorizeUrl);
}

export const GET = withErrorCapture('integrations/square/connect', _GET)
