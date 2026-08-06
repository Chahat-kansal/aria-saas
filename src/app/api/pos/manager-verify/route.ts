export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { signManagerToken } from '@/lib/pos/manager-token'
import { rateLimit, tooManyRequests } from '@/lib/security/rate-limit'
import { verifyStaffPin, upgradeStaffPin } from '@/lib/pos/staff-pin'
import { pickMatchingManager, MAX_MANAGER_CANDIDATES, type ManagerRow } from '@/lib/pos/pick-manager'

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
  // SEC-MGR-1 — was .maybeSingle() over a set that can hold many rows. Fetch the SET; the PIN
  // cannot go in the WHERE clause because bcrypt hashes are not searchable, so verifying against
  // each candidate is the only correct shape. Deliberately NOT .limit(1) — see pick-manager.ts.
  const { data: staffRows } = await supabase
    .from('pos_users')
    .select('id, name, role, pin, pin_hash')
    .eq('business_id', bid)
    .eq('is_active', true)
    .in('role', ['manager', 'owner', 'admin'])

  const candidates = (staffRows ?? []) as ManagerRow[]
  if (candidates.length > MAX_MANAGER_CANDIDATES) {
    // Reported, not silently truncated: bcrypt is ~100ms per check, so an unbounded set behind an
    // authorisation endpoint is a latency and cost surface. No café hits this.
    console.warn('[manager-verify] business ' + bid + ' has ' + candidates.length
      + ' eligible managers; only the first ' + MAX_MANAGER_CANDIDATES + ' are checked.')
  }

  // SEC-PIN-1/2 + SEC-MGR-1 — verify against EVERY eligible manager, not one arbitrary row.
  // The comparison itself is the shared verifyStaffPin, injected rather than reimplemented:
  // SEC-PIN-2 exists because this file diverged from verify-pin once already.
  const staff = await pickMatchingManager(candidates, String(pin), verifyStaffPin)

  if (!staff) {
    // Same 401 whether zero managers exist, one, or twenty and none matched — never leak how many
    // there are or which was closest.
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  }
  if (!staff.pin_hash) {
    await upgradeStaffPin(supabase, 'pos_users', staff.id, bid, String(pin))
  }

  // Token and name are BOTH the matched person's. Previously staff_name came from whichever row
  // was grabbed, so the name shown to the cashier could belong to someone who did not authorise it.
  const token = signManagerToken(staff.id)
  return NextResponse.json({ ok: true, token, staff_name: staff.name, expires_in: 60 })
}

export const POST = withErrorCapture('pos/manager-verify', _POST)