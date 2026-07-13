export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalisePhone, sendSMS } from '@/lib/clicksend'
import { linkOrCreateMembership } from '@/lib/loyalty/membership'
import { clearCxSessionCookie } from '@/lib/cx/get-cx-session'
import { limit } from '@/lib/rate-limit'

const COOKIE_NAME = 'cx_session'
const OTP_TTL_MS = 10 * 60 * 1000         // 10 min
const SESSION_DAYS = 90
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function mintSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function sessionCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 60 * 60
  return COOKIE_NAME + '=' + encodeURIComponent(token) +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge
}

function getIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const action = body.action as string
  if (action !== 'send' && action !== 'verify' && action !== 'logout') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Resolve business
  const { data: biz, error: bizErr } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('slug', params.slug)
    .maybeSingle()
  if (bizErr || !biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const bid = biz.id as string
  const bizName = (biz.name as string) ?? params.slug

  // ── SEND ────────────────────────────────────────────────────────────────
  if (action === 'send') {
    const rawPhone = ((body.phone as string) ?? '').trim()
    if (!rawPhone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })
    const phone = normalisePhone(rawPhone)

    // Rate limits (Upstash sliding window — shared across all instances, fail-closed in prod)
    const ip = getIp(req)
    const [phoneRl, ipRl] = await Promise.all([
      limit('cx-send:phone:' + phone + ':' + bid, { requests: 3, window: '15 m' }),
      limit('cx-send:ip:' + ip, { requests: 8, window: '1 h' }),
    ])
    if (!phoneRl.ok) {
      return NextResponse.json(
        { error: 'Too many codes sent. Please wait 15 minutes.' },
        { status: 429, headers: { 'Retry-After': String(phoneRl.retryAfter) } },
      )
    }
    if (!ipRl.ok) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter) } },
      )
    }

    // Generate code + hash
    const code = String(crypto.randomInt(100000, 1000000))
    const codeHash = hashCode(code)
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

    const { error: insertErr } = await supabaseAdmin.from('cx_otp_codes').insert({
      business_id: bid, phone, code_hash: codeHash, expires_at: expiresAt,
    })
    if (insertErr) {
      console.error('[cx-auth/send] insert error:', insertErr.message)
      return NextResponse.json({ error: 'Could not send code' }, { status: 500 })
    }

    const smsBody = 'Your ' + bizName + ' code: ' + code
    const smsResult = await sendSMS(phone, smsBody, { category: 'transactional', businessId: bid })
    if (!smsResult.ok) {
      // Clean up the code row so we don't leave a dangling unusable code
      const { error: delErr } = await supabaseAdmin.from('cx_otp_codes').delete().eq('phone', phone).eq('business_id', bid).eq('code_hash', codeHash)
      if (delErr) console.error('[cx-auth/send] cleanup delete failed:', delErr.message)
      console.error('[cx-auth/send] SMS failed to=' + phone + ' error=' + (smsResult.error ?? 'unknown'))
      return NextResponse.json({ error: 'Could not send SMS. Check your number.', code: 'sms_failed' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  }

  // ── VERIFY ──────────────────────────────────────────────────────────────
  if (action === 'verify') {
    const rawPhone = ((body.phone as string) ?? '').trim()
    const rawCode  = ((body.code  as string) ?? '').trim()
    if (!rawPhone || !rawCode) return NextResponse.json({ error: 'Phone and code required' }, { status: 400 })
    const phone = normalisePhone(rawPhone)
    const codeHash = hashCode(rawCode)

    // Rate limit before any DB lookup to avoid timing oracle on account existence
    const verifyRl = await limit('cx-verify:phone:' + phone + ':' + bid, { requests: 5, window: '15 m' })
    if (!verifyRl.ok) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please request a new code.' },
        { status: 429, headers: { 'Retry-After': String(verifyRl.retryAfter) } },
      )
    }

    // Find the most recent unexpired, unconsumed OTP for this phone+business
    const { data: otpRow, error: otpErr } = await supabaseAdmin
      .from('cx_otp_codes')
      .select('id, code_hash, attempts, expires_at')
      .eq('phone', phone)
      .eq('business_id', bid)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpErr) { console.error('[cx-auth/verify] otp query error:', otpErr.message); return NextResponse.json({ error: 'Verification error' }, { status: 500 }) }

    if (!otpRow) return NextResponse.json({ error: 'Code expired or not found. Please request a new code.' }, { status: 400 })

    const attempts = (otpRow.attempts as number) ?? 0
    if (attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many incorrect attempts. Please request a new code.' }, { status: 400 })
    }

    if ((otpRow.code_hash as string) !== codeHash) {
      // Increment attempt counter
      await supabaseAdmin.from('cx_otp_codes').update({ attempts: attempts + 1 }).eq('id', otpRow.id)
      const remaining = MAX_ATTEMPTS - attempts - 1
      return NextResponse.json({ error: 'Incorrect code. ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.' }, { status: 400 })
    }

    // Consume the OTP
    await supabaseAdmin.from('cx_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', otpRow.id)

    // Find-or-create loyalty_identity by phone
    const { data: existingIdentity } = await supabaseAdmin
      .from('loyalty_identity')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    let identityId: string
    if (existingIdentity?.id) {
      identityId = existingIdentity.id as string
    } else {
      const { data: newIdentity, error: idErr } = await supabaseAdmin
        .from('loyalty_identity')
        .insert({ phone })
        .select('id')
        .single()
      if (idErr || !newIdentity) {
        console.error('[cx-auth/verify] identity insert error:', idErr?.message)
        return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
      }
      identityId = newIdentity.id as string
    }

    // Link or create pos_customers membership
    const { customer_id, name } = await linkOrCreateMembership(identityId, bid, { phone })

    // Mint session token
    const rawToken = mintSessionToken()
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error: sessionErr } = await supabaseAdmin.from('cx_sessions').insert({
      loyalty_identity_id: identityId,
      business_id: bid,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    if (sessionErr) {
      console.error('[cx-auth/verify] session insert error:', sessionErr.message)
      return NextResponse.json({ error: 'Could not create session' }, { status: 500 })
    }

    const res = NextResponse.json({ ok: true, customer_id, name })
    res.headers.set('Set-Cookie', sessionCookie(rawToken))
    return res
  }

  // ── LOGOUT ──────────────────────────────────────────────────────────────
  // action === 'logout'
  const cookieHeader = req.headers.get('cookie') ?? ''
  const prefix = COOKIE_NAME + '='
  let rawToken: string | null = null
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      try { rawToken = decodeURIComponent(trimmed.slice(prefix.length)) } catch { rawToken = null }
      break
    }
  }

  if (rawToken) {
    const tokenHash = hashToken(rawToken)
    await supabaseAdmin
      .from('cx_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
  }

  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', clearCxSessionCookie())
  return res
}