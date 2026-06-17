export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

export async function POST(req: Request) {
  // SEC-H1: per-IP throttle on the public contact form (spam guard).
  const rl = await rateLimit(`contact:${clientIp(req)}`, 5, 60)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  let body: { name?: string; email?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

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

  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px;color:#111">New contact form submission</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#555;width:80px"><strong>Name</strong></td><td style="padding:6px 0">${name.replace(/</g, '&lt;')}</td></tr>
    <tr><td style="padding:6px 0;color:#555"><strong>Email</strong></td><td style="padding:6px 0"><a href="mailto:${email}">${email.replace(/</g, '&lt;')}</a></td></tr>
  </table>
  <hr style="margin:16px 0;border:none;border-top:1px solid #eee"/>
  <p style="white-space:pre-wrap;color:#333">${message.replace(/</g, '&lt;')}</p>
  <hr style="margin:16px 0;border:none;border-top:1px solid #eee"/>
  <p style="font-size:12px;color:#999">Sent via ariaos.site/contact</p>
</div>`

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