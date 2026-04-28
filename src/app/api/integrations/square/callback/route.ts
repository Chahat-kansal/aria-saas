import { createServerSupabaseClient } from '@/lib/supabase-server';
import { encryptField } from '@/lib/encryption';
import { NextResponse } from 'next/server';

// Token exchange uses the environment-specific API base
const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=missing_params`);
  }

  // Decode state
  let bid: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    bid = decoded.bid;
    if (!bid) throw new Error('No business_id in state');
    // Reject stale states older than 10 minutes
    if (Date.now() - decoded.ts > 600_000) throw new Error('State expired');
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=invalid_state`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch(`${SQUARE_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${appUrl}/api/integrations/square/callback`,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Square token exchange failed:', err);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_at, merchant_id } = tokens;

  // Encrypt tokens before storing
  const encryptedAccess = encryptField(access_token, bid);
  const encryptedRefresh = encryptField(refresh_token ?? '', bid);

  const supabase = createServerSupabaseClient();

  // Upsert the Square connection
  const { error: upsertErr } = await supabase.from('square_connections').upsert({
    business_id: bid,
    square_merchant_id: merchant_id,
    access_token: encryptedAccess,
    refresh_token: encryptedRefresh,
    token_expires_at: expires_at ?? null,
    sync_status: 'pending',
    connected_at: new Date().toISOString(),
  }, { onConflict: 'business_id' });

  if (upsertErr) {
    console.error('Failed to save Square connection:', upsertErr.message);
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?error=db_error`);
  }

  // Mark business as Square-connected
  await supabase.from('businesses').update({
    data_source: 'square',
    square_connected: true,
  }).eq('id', bid);

  // Trigger initial sync (fire-and-forget — don't await)
  fetch(`${appUrl}/api/integrations/square/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: bid }),
  }).catch(console.error);

  return NextResponse.redirect(`${appUrl}/dashboard/integrations?connected=square`);
}
