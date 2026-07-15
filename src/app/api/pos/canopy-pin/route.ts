export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { rateLimit, tooManyRequests } from '@/lib/security/rate-limit'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { signCanopySessionToken } from '@/lib/pos/canopy-session'
import { getActiveClockIn } from '@/lib/staff/timesheets'

// SHELL-1 — the Canopy desktop shell's PIN lock. NEW route, additive only — does not modify
// verify-pin (checks one already-known staff member) or manager-verify (manager/owner/admin only,
// 60-second override token). This generalizes manager-verify's "find the staff member whose PIN
// matches" lookup to EVERY role, and issues a persistent Canopy-session token instead of a
// short-lived override — the PIN determines which of two views (owner vs. everyone else) the same
// already-authenticated machine session shows, it is not a replacement for that session. Requires
// the owner's real Supabase Auth session first (the machine must already be logged into the web app
// once) — Canopy falls through to the existing web sign-in flow before this route is ever reachable.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(`pin:canopy:${user.id}`, 15, 60, { failClosed: true })
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const body = await req.json().catch(() => ({}))
  const { business_id, pin } = body as { business_id?: string; pin?: string }
  if (!business_id || !pin) return NextResponse.json({ error: 'business_id and pin required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const { data: staff } = await supabase
    .from('pos_users')
    .select('id, name, display_name, role')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .eq('pin', pin)

  let match = (staff ?? [])[0] as { id: string; name: string; display_name: string | null; role: string } | undefined
  let source: 'pos_users' | 'pos_staff' = 'pos_users'

  // CANOPY-STAFF-CLOCK-1 — pos_users (checked above) has no real staff-role rows for any live
  // business today, only the owner; real staff actually clock in/out against pos_staff, the exact
  // table /api/staff/timesheets/clock-in|clock-out already authenticate against (confirmed live:
  // Sip Café has 5 real pos_staff + 134 real approved pos_timesheets rows, and 0 non-owner
  // pos_users rows). Fall back to it so Canopy's PIN unlock can resolve real staff, not just the
  // owner — without touching pos_users' own existing behavior above at all.
  if (!match) {
    const { data: posStaff } = await supabase
      .from('pos_staff')
      .select('id, name, role')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .eq('pin', pin)
    const posStaffMatch = (posStaff ?? [])[0]
    if (posStaffMatch) {
      match = { id: posStaffMatch.id, name: posStaffMatch.name, display_name: null, role: posStaffMatch.role }
      source = 'pos_staff'
    }
  }

  if (!match) return NextResponse.json({ valid: false })

  if (source === 'pos_users') {
    await supabase.from('pos_users').update({ last_login_at: new Date().toISOString() }).eq('id', match.id)
  }
  // pos_staff has no last_login_at column — nothing to stamp for that source.

  // Binary scope, matching the design spec exactly: only 'owner' reaches the full view; every other
  // role (manager, staff, cashier, ...) gets the same scoped staff view. Not a permissions system —
  // Canopy has exactly two views.
  const scope: 'owner' | 'staff' = match.role === 'owner' ? 'owner' : 'staff'
  const token = signCanopySessionToken(business_id, match.id, scope)

  // Only pos_staff-sourced identities can clock in/out (that's the table those routes check) — a
  // non-mutating status read so the renderer can decide whether to prompt at all (never silently
  // auto-clock-in) and skip the prompt if a shift is already open (once per shift, not every unlock).
  const already_clocked_in = source === 'pos_staff' ? Boolean(await getActiveClockIn(business_id, match.id)) : undefined

  return NextResponse.json({
    valid: true,
    scope,
    staff_id: match.id,
    name: match.display_name ?? match.name,
    token,
    source,
    already_clocked_in,
  })
}

export const POST = withErrorCapture('pos/canopy-pin', _POST)
