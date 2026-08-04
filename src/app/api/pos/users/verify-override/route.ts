export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { pinLookup, verifyStaffPin, upgradeStaffPin } from '@/lib/pos/staff-pin'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { pin, business_id, action, required_flag } = body;
  if (!pin || !business_id) {
    return NextResponse.json({ error: 'pin and business_id required' }, { status: 400 });
  }

  // SECURITY: ownership verified
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // SEC-PIN-1 — SHAPE B: this route identifies a person FROM THE PIN ALONE (a manager typing over
  // someone else's screen — there is no name to pick first), and bcrypt is salted, so there is no
  // `where pin_hash = hash(input)`. pin_lookup is a deterministic HMAC index that NARROWS to a
  // candidate; pin_hash then AUTHENTICATES. Both steps — the lookup alone proves nothing, because
  // anyone who obtained the pepper could compute it.
  const lookup = pinLookup(String(business_id), String(pin))
  const baseSelect = () => supabase
    .from('pos_users')
    .select('id, name, role, permissions, pin, pin_hash')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .in('role', ['owner', 'admin', 'manager'])

  let manager: Record<string, unknown> | null = null
  if (lookup) {
    const { data } = await baseSelect().eq('pin_lookup', lookup).maybeSingle()
    if (data && await verifyStaffPin(String(pin), (data as Record<string, unknown>).pin_hash as string)) {
      manager = data as Record<string, unknown>
    }
  }
  // LEGACY FALLBACK — un-backfilled rows, or STAFF_PIN_PEPPER not yet set in this environment.
  // Remove in SEC-PIN-2, at which point an unset pepper must become a hard failure instead.
  if (!manager) {
    const { data } = await baseSelect().eq('pin', String(pin)).maybeSingle()
    if (data) {
      manager = data as Record<string, unknown>
      await upgradeStaffPin(supabase, 'pos_users', String(manager.id), String(business_id), String(pin))
    }
  }

  if (!manager) {
    return NextResponse.json({ authorized: false, error: 'Invalid manager PIN' }, { status: 403 });
  }

  // Write audit row for manager override
  try {
    const { writeAuditLog } = await import('@/lib/pos/check-permission')
    await writeAuditLog(supabase, {
      business_id,
      action: 'manager_override',
      manager_approved_by: String(manager.id),
      performed_by: user.id,
      metadata: { override_action: action ?? null, required_flag: required_flag ?? null },
    })
  } catch (e) { console.error('[non-fatal]', e) }

  return NextResponse.json({
    authorized: true,
    manager: { id: manager.id, name: manager.name, role: manager.role },
    action,
  });
}

export const POST = withErrorCapture('pos/users/verify-override', _POST)
