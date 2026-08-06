export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { signManagerToken } from '@/lib/pos/manager-token'
import { rateLimit, tooManyRequests } from '@/lib/security/rate-limit'
import { verifyStaffPin, upgradeStaffPin } from '@/lib/pos/staff-pin'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SEC-H1: throttle manager-PIN attempts per session (fail-closed — brute-force guard).
  const rl = await rateLimit(`pin:mgr:${user.id}`, 10, 60, { failClosed: true })
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const { pin } = await req.json()
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  const bid = active?.business_id ?? biz?.id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // Find staff member with matching PIN
  const { data: staff } = await supabase
    .from('pos_users')
    .select('id, name, role, pin, pin_hash')
    .eq('business_id', bid)
    .eq('is_active', true)
    .in('role', ['manager', 'owner', 'admin'])
    .maybeSingle()

  // SEC-PIN-1 (adopted in SEC-PIN-2) — was `staff.pin !== pin`: a plaintext, non-constant-time
  // compare on the MANAGER OVERRIDE gate, the check that authorises voids, discounts and price
  // overrides at the till. Six sibling routes adopted verifyStaffPin in SEC-PIN-1; this one and the
  // PIN-update route did not. Mirrors verify-pin exactly: hash wins when present, the plaintext
  // branch is a fallback for un-backfilled rows only, and a successful legacy match upgrades.
  const valid = staff?.pin_hash
    ? await verifyStaffPin(String(pin), staff.pin_hash as string)
    : !!staff && staff.pin === pin
  if (!staff || !valid) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  }
  if (!staff.pin_hash) {
    await upgradeStaffPin(supabase, 'pos_users', staff.id as string, bid, String(pin))
  }

  const token = signManagerToken(staff.id)
  return NextResponse.json({ ok: true, token, staff_name: staff.name, expires_in: 60 })
}

export const POST = withErrorCapture('pos/manager-verify', _POST)