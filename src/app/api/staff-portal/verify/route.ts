export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { limit } from '@/lib/rate-limit'
import { verifyOtpAndCreateSession } from '@/lib/staff-portal/session'

async function _POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').toLowerCase().trim()
  const code = String(body.code ?? '').trim()
  if (!email || !code) return NextResponse.json({ error: 'email and code required' }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
  const rl = await limit('staff-verify:email-ip:' + email + ':' + ip, { requests: 5, window: '15 m' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const { data: member } = await supabaseAdmin
    .from('staff_members')
    .select('id, business_id, first_name, last_name, position, portal_enabled')
    .or('personal_email.eq.' + email + ',work_email.eq.' + email)
    .eq('status', 'active')
    .maybeSingle()

  if (!member || !member.portal_enabled) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  }

  // SECURITY-P1 (C-08) — verifies against the hashed OTP (timing-safe compare) and, only on
  // success, issues a brand-new random session token — this is what's returned as `token`, never
  // the OTP itself. See src/lib/staff-portal/session.ts for the full design rationale.
  const sessionToken = await verifyOtpAndCreateSession(String(member.id), String(member.business_id), code)
  if (!sessionToken) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  return NextResponse.json({
    token: sessionToken,
    staff_member_id: String(member.id),
    business_id: String(member.business_id),
    name: String(member.first_name) + ' ' + String(member.last_name),
    first_name: String(member.first_name),
    position: String(member.position ?? ''),
  })
}

export const POST = withErrorCapture('staff-portal/verify', _POST)
