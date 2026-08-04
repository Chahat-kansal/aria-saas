export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { setStaffCookie } from '@/lib/inventory/staff-session'
import { limit } from '@/lib/rate-limit'
import { verifyStaffPin, upgradeStaffPin } from '@/lib/pos/staff-pin'

// INV-STAFF-APP-1 — per-staff PIN login. The PIN is checked SERVER-SIDE against pos_staff.pin (never sent
// to the client) for the resolved business only. On success, an HMAC-signed acting-staff cookie is set.

type Params = { params: Promise<{ slug: string }> }

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { staff_id?: string; pin?: string }
  if (!body.staff_id || !body.pin) return NextResponse.json({ error: 'Pick your name and enter your PIN' }, { status: 400 })

  // SECURITY-P1 (H-11) — PINs are 4-6 numeric digits with no throttle: unlimited guesses were
  // previously allowed. 5 attempts / 15 min per staff_id (matches staff-portal/verify's rate).
  const rl = await limit('inv-login:' + body.staff_id, { requests: 5, window: '15 m' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const { data: staff } = await supabaseAdmin.from('pos_staff')
    .select('id, name, role, color, pin, pin_hash').eq('id', body.staff_id).eq('business_id', bid).eq('is_active', true).maybeSingle()

  // SEC-PIN-1 — was `String(staff.pin ?? '') !== String(body.pin)`: plaintext, and a `!==` on
  // strings short-circuits on the first differing character, so it leaked PIN prefixes by timing.
  // bcrypt.compare does neither. The plaintext branch is a LEGACY FALLBACK for rows not yet
  // backfilled and must be deleted in SEC-PIN-2 — until it is, #16 is not closed.
  const ok = staff?.pin_hash
    ? await verifyStaffPin(String(body.pin), staff.pin_hash as string)
    : !!staff && String(staff.pin ?? '') === String(body.pin)
  if (!staff || !ok) {
    return NextResponse.json({ ok: false, error: 'Incorrect PIN' }, { status: 401 })
  }
  // Upgrade on the way past: a correct legacy login is the only moment we hold the plaintext PIN.
  if (!staff.pin_hash) {
    await upgradeStaffPin(supabaseAdmin, 'pos_staff', staff.id as string, bid, String(body.pin))
  }

  await setStaffCookie(bid, staff.id as string, (staff.name as string) ?? 'Staff')
  return NextResponse.json({ ok: true, staff: { id: staff.id, name: staff.name, role: staff.role, color: staff.color } })
}

export const POST = withErrorCapture('inventory/app/login', _POST)
