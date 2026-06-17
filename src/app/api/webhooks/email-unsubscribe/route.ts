export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { suppressEmail } from '@/lib/external-apis'
import { verifyUnsubToken } from '@/lib/unsubscribe-token'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

// MSG-COMPLIANCE-2 — email List-Unsubscribe One-Click endpoint. The token (minted by sendEmail) is
// HMAC-signed and carries business + customer/email, so it can't be forged to suppress an arbitrary
// address. POST handles the RFC 8058 one-click unsubscribe; GET handles a human clicking the footer link.

async function handle(token: string | null): Promise<{ status: number; ok: boolean; error?: string }> {
  if (!token) return { status: 400, ok: false, error: 'missing token' }
  const p = verifyUnsubToken(token)
  if (!p) return { status: 400, ok: false, error: 'invalid token' }

  let email = p.e ?? null
  if (!email && p.c) {
    const { data: c } = await supabaseAdmin.from('pos_customers').select('email').eq('id', p.c).maybeSingle()
    email = (c?.email as string | null) ?? null
  }
  if (!email) return { status: 400, ok: false, error: 'unresolvable recipient' }

  await suppressEmail(p.b ?? null, email, 'unsubscribe') // idempotent (unique constraint)
  return { status: 200, ok: true }
}

export async function POST(req: Request) {
  const rl = await rateLimit(`wh:unsub:${clientIp(req)}`, 60, 60)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const url = new URL(req.url)
  let token = url.searchParams.get('token')
  if (!token) {
    const f = await req.formData().catch(() => null)
    if (f) token = String(f.get('token') ?? '') || null
  }
  const r = await handle(token)
  return NextResponse.json(r.ok ? { ok: true, unsubscribed: true } : { error: r.error }, { status: r.status })
}

export async function GET(req: Request) {
  const rl = await rateLimit(`wh:unsub:${clientIp(req)}`, 60, 60)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const token = new URL(req.url).searchParams.get('token')
  const r = await handle(token)
  if (r.ok) {
    return new NextResponse(
      '<!doctype html><html><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#1A1D23"><h2>You&rsquo;re unsubscribed</h2><p style="color:#4A5568">You will no longer receive marketing emails. You may still receive transactional messages (receipts, bookings).</p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
  return NextResponse.json({ error: r.error }, { status: r.status })
}
