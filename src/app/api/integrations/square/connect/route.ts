import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com';

const SCOPES = [
  'MERCHANT_PROFILE_READ',
  'ITEMS_READ',
  'INVENTORY_READ',
  'ORDERS_READ',
  'CUSTOMERS_READ',
  'CUSTOMERS_WRITE',
].join('+');

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.SQUARE_APPLICATION_ID) {
    return NextResponse.json({ error: 'SQUARE_APPLICATION_ID not configured' }, { status: 500 });
  }

  // Get the active business_id to attach to state
  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
  const bid = active?.business_id
    ?? (await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;

  if (!bid) {
    return NextResponse.json({ error: 'No business found. Complete onboarding first.' }, { status: 400 });
  }

  // Encode business_id in state for verification in callback
  const state = Buffer.from(JSON.stringify({ bid, uid: user.id, ts: Date.now() })).toString('base64url');

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/square/callback`;

  const url = `${SQUARE_BASE}/oauth2/authorize?client_id=${process.env.SQUARE_APPLICATION_ID}&scope=${SCOPES}&session=false&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(url);
}
