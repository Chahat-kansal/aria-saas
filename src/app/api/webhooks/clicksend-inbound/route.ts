export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { suppressNumber, normalisePhone } from '@/lib/clicksend'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

// MSG-COMPLIANCE-2 — inbound SMS handler. ClickSend POSTs replies here; a STOP-keyword reply auto-feeds
// sms_suppression (reason='stop'), START/UNSTOP removes it. PUBLIC endpoint (ClickSend calls it with no
// auth-user context) so it's gated by a shared secret in the URL/header — without it, anyone could
// suppress arbitrary numbers.

const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'optout', 'opt-out', 'opt out', 'end', 'quit', 'cancel'])
const START_WORDS = new Set(['start', 'unstop', 'yes', 'subscribe', 'resubscribe'])

function authorised(req: Request, url: URL): boolean {
  const secret = process.env.CLICKSEND_INBOUND_SECRET ?? process.env.CRON_SECRET
  if (!secret) return false // fail closed
  const provided = url.searchParams.get('secret') ?? req.headers.get('x-clicksend-secret') ?? ''
  return provided === secret
}

async function parseInbound(req: Request): Promise<{ from: string; body: string }> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return {
      from: String(j.from ?? j.sender ?? j.originalsenderid ?? j.original_sender ?? ''),
      body: String(j.body ?? j.message ?? j.sms ?? j.original_body ?? ''),
    }
  }
  const f = await req.formData().catch(() => null)
  if (!f) return { from: '', body: '' }
  return {
    from: String(f.get('from') ?? f.get('sender') ?? f.get('originalsenderid') ?? ''),
    body: String(f.get('body') ?? f.get('message') ?? f.get('sms') ?? f.get('original_body') ?? ''),
  }
}

export async function POST(req: Request) {
  // SEC-H1: per-IP throttle BEFORE the secret check, so secret-guessing/flooding is also limited.
  const rl = await rateLimit(`wh:clicksend:${clientIp(req)}`, 60, 60)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const url = new URL(req.url)
  if (!authorised(req, url)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { from, body } = await parseInbound(req)
  if (!from) return NextResponse.json({ ok: true, ignored: 'no_sender' })

  const phone = normalisePhone(from)
  const kw = body.trim().toLowerCase().replace(/[^a-z\- ]/g, '')
  const isStop = STOP_WORDS.has(kw)
  const isStart = START_WORDS.has(kw)
  if (!isStop && !isStart) return NextResponse.json({ ok: true, ignored: 'not_keyword' })

  // Resolve the business(es) this number belongs to (try normalised + raw stored formats).
  const bizIds = new Set<string>()
  for (const p of [phone, from]) {
    const { data } = await supabaseAdmin.from('pos_customers').select('business_id').eq('phone', p)
    for (const c of data ?? []) if (c.business_id) bizIds.add(c.business_id as string)
  }
  const targets: (string | null)[] = bizIds.size ? [...bizIds] : [null]

  if (isStop) {
    for (const b of targets) await suppressNumber(b, phone, 'stop') // idempotent (unique constraint)
    return NextResponse.json({ ok: true, action: 'suppressed', businesses: bizIds.size })
  }

  // START / UNSTOP → remove from suppression (re-subscribe).
  for (const b of targets) {
    let q = supabaseAdmin.from('sms_suppression').delete().eq('phone', phone)
    q = b ? q.eq('business_id', b) : q.is('business_id', null)
    await q
  }
  return NextResponse.json({ ok: true, action: 'resubscribed', businesses: bizIds.size })
}
