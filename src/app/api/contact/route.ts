export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { render } from '@react-email/render'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'
import { requireTurnstile } from '@/lib/security/turnstile'
import { ContactNotificationEmail } from '@/emails/ContactNotificationEmail'

export async function POST(req: Request) {
  // SEC-H1: per-IP throttle on the public contact form (spam guard).
  const rl = await rateLimit(`contact:${clientIp(req)}`, 5, 60)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  let body: { name?: string; email?: string; message?: string; turnstile_token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // SECURITY-P1 — fail-closed when TURNSTILE_SECRET_KEY is configured, fail-open (logged) when absent.
  const turnstileDenied = await requireTurnstile(body.turnstile_token, clientIp(req))
  if (turnstileDenied) return turnstileDenied

  const { name, email, message } = body
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('[contact] RESEND_API_KEY not set')
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })
  }

  const domain = process.env.RESEND_FROM_DOMAIN ?? 'ariaos.site'
  const to = 'hello@ariaos.site'

  // B28-REACT-EMAIL — body now a React Email component (React auto-escapes the user fields, replacing
  // the manual &lt; escaping). Transport (direct Resend), from, to, reply_to, subject unchanged.
  const html = await render(createElement(ContactNotificationEmail, { name, email, message }))

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Aria Contact <aria@${domain}>`,
        to,
        reply_to: email,
        subject: `Contact form: ${name}`,
        html,
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[contact] Resend error', res.status, detail)
      return NextResponse.json({ error: 'Failed to send' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contact] Unexpected error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}