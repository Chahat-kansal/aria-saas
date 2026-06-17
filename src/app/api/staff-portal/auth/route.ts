export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

async function _POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  // SEC-H1: throttle OTP issuance per IP and per email (fail-closed — limits OTP-email cost abuse
  // and brute-force; the generic 429 + the existing always-{ok:true} response avoid enumeration).
  const rlIp = await rateLimit(`otp:ip:${clientIp(req)}`, 10, 300, { failClosed: true })
  if (!rlIp.allowed) return tooManyRequests(rlIp.retryAfter)
  const rlEmail = await rateLimit(`otp:email:${email}`, 5, 300, { failClosed: true })
  if (!rlEmail.allowed) return tooManyRequests(rlEmail.retryAfter)

  const { data: member } = await supabaseAdmin
    .from('staff_members')
    .select('id, first_name, portal_enabled, personal_email, work_email')
    .or('personal_email.eq.' + email + ',work_email.eq.' + email)
    .eq('status', 'active')
    .maybeSingle()

  if (!member || !member.portal_enabled) {
    return NextResponse.json({ ok: true })
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

  await supabaseAdmin.from('staff_members').update({
    portal_token: code,
    portal_token_expires_at: expiresAt,
  }).eq('id', member.id)

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_DOMAIN
          ? 'Aria Staff Portal <noreply@' + process.env.RESEND_FROM_DOMAIN + '>'
          : 'Aria Staff Portal <onboarding@resend.dev>',
        to: email,
        subject: 'Your Aria Staff Portal code: ' + code,
        html: '<p style="font-family:Arial,sans-serif;">Hi ' + String(member.first_name) + ',</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">' + code + '</p><p style="color:#888;font-size:13px;">This code expires in 24 hours. Do not share it.</p>',
      }),
    }).catch(() => null)
    if (!emailRes?.ok) {
      const errText = await emailRes?.text().catch(() => 'unknown') ?? 'Email service unavailable'
      console.error('[staff-portal/auth] Resend failed:', errText)
      return NextResponse.json({ error: 'Could not send login code — please try again' }, { status: 502 })
    }
  }

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('staff-portal/auth', _POST)
