export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { staffPinColumns, isDuplicatePinError } from '@/lib/pos/staff-pin'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase
    .from('pos_users')
    // Never return PIN
    .select('id, business_id, name, role, permissions, manager_pin, is_active, last_login_at, created_at')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('name');

  return NextResponse.json({ users: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { business_id, name, pin, role = 'cashier', permissions } = body;

  if (!business_id || !name || !pin) {
    return NextResponse.json({ error: 'business_id, name, pin required' }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { ROLE_PERMISSION_DEFAULTS } = await import('@/lib/pos/check-permission')
  const defaultPermissions = ROLE_PERMISSION_DEFAULTS[role] ?? ROLE_PERMISSION_DEFAULTS.cashier

  const { data, error } = await supabase.from('pos_users').insert({
    // SEC-PIN-2 — NOT in the brief's two sites; found by the grep-before-done sweep. Creating a user
    // wrote plaintext only, so every new account started with no hash and depended on the legacy
    // fallback to log in at all. Harmless today (the fallback works and lazily upgrades), but it is
    // exactly what would stop SEC-PIN-3 from being able to drop that fallback.
    // SEC-PIN-3 §1 — `pin` is gone and pin_lookup is added, both via the one shared helper. The
    // lookup was missing here: a user created through this route could log in (verify-pin knows
    // their id) but could never authorise an override, because verify-override finds people by
    // pin_lookup and fell back to the plaintext column when it was absent.
    business_id, name: name.trim(), role,
    ...(await staffPinColumns(String(business_id), String(pin))),
    permissions: permissions ?? defaultPermissions,
  }).select('id, business_id, name, role, permissions, is_active, created_at').single();

  if (isDuplicatePinError(error)) {
    return NextResponse.json({ error: 'That PIN is already used by someone else here. Pick another.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data }, { status: 201 });
}

export const GET = withErrorCapture('pos/users', _GET)
export const POST = withErrorCapture('pos/users', _POST)
