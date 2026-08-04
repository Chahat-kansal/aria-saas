export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { rateLimit, tooManyRequests } from '@/lib/security/rate-limit'
import { verifyStaffPin, upgradeStaffPin } from '@/lib/pos/staff-pin'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // SEC-H1: throttle cashier-PIN attempts per session (fail-closed — brute-force guard).
  const rl = await rateLimit(`pin:verify:${user.id}`, 15, 60, { failClosed: true });
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => ({}));
  const { business_id, user_id, pin } = body;
  if (!business_id || !user_id || !pin) {
    return NextResponse.json({ error: 'business_id, user_id, pin required' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: posUser } = await supabase
    .from('pos_users')
    .select('id, name, role, permissions, pin, pin_hash')
    .eq('id', user_id)
    .eq('business_id', business_id)
    .eq('is_active', true)
    .single();

  if (!posUser) return NextResponse.json({ valid: false, user: null });

  // SEC-PIN-1 — was `posUser.pin === pin`: plaintext and non-constant-time. Legacy branch is a
  // fallback for un-backfilled rows only; remove in SEC-PIN-2.
  const valid = posUser.pin_hash
    ? await verifyStaffPin(String(pin), posUser.pin_hash as string)
    : posUser.pin === pin;
  if (valid && !posUser.pin_hash) {
    await upgradeStaffPin(supabase, 'pos_users', posUser.id as string, String(business_id), String(pin));
  }

  if (valid) {
    await supabase.from('pos_users').update({ last_login_at: new Date().toISOString() }).eq('id', user_id);
    // Return user without PIN
    const { pin: _pin, ...safeUser } = posUser;
    return NextResponse.json({ valid: true, user: safeUser });
  }

  return NextResponse.json({ valid: false, user: null });
}

export const POST = withErrorCapture('pos/users/verify-pin', _POST)
