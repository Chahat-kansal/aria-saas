export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { rateLimit, tooManyRequests } from '@/lib/security/rate-limit'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { signCanopySessionToken } from '@/lib/pos/canopy-session'

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

  const match = (staff ?? [])[0]
  if (!match) return NextResponse.json({ valid: false })

  await supabase.from('pos_users').update({ last_login_at: new Date().toISOString() }).eq('id', match.id)

  // Binary scope, matching the design spec exactly: only 'owner' reaches the full view; every other
  // role (manager, staff, cashier, ...) gets the same scoped staff view. Not a permissions system —
  // Canopy has exactly two views.
  const scope: 'owner' | 'staff' = match.role === 'owner' ? 'owner' : 'staff'
  const token = signCanopySessionToken(business_id, match.id, scope)

  return NextResponse.json({
    valid: true,
    scope,
    staff_id: match.id,
    name: match.display_name ?? match.name,
    token,
  })
}

export const POST = withErrorCapture('pos/canopy-pin', _POST)
