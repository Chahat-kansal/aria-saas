export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'
import { requireTurnstile } from '@/lib/security/turnstile'
import { sendEmail, sendSMS } from '@/lib/external-apis'
import { normalisePhone } from '@/lib/clicksend'
import {
  genOtp, hashOtp, hashPin, verifyPin, isValidPin, normaliseEmail,
  setLoyaltySession, clearLoyaltySession, getLoyaltyIdentity, getLoyaltyMembership,
} from '@/lib/loyalty/auth'
import { linkOrCreateMembership, membershipName } from '@/lib/loyalty/membership'

// LOY-NETWORK + LOY-PHONE — GLOBAL identity auth, business-agnostic. Sign in with EITHER email OR phone.
//   • Email: 6-digit code (email-OTP) → set a bcrypt PIN → fast re-login with PIN. (Unchanged.)
//   • Phone: SMS 6-digit code (ClickSend) → signed in. OTP-ONLY (no PIN) — lower-risk, matches AU in-store.
// Security parity: both identifiers get the SAME OTP TTL/attempt cap, fail-closed rate limits, generic
// non-enumerating responses, and single-use codes. Email additionally has the bcrypt-PIN + 5-fail lockout.

const GENERIC_AUTH_FAIL = 'Incorrect email or PIN — or too many attempts. Please try again shortly.'
const OTP_TTL_MS = 10 * 60 * 1000
const VERIFIED_TTL_MS = 10 * 60 * 1000
const MAX_PIN_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5

interface IdentityRow {
  id: string; email: string | null; phone: string | null; pin_hash: string | null
  failed_pin_attempts: number | null; locked_until: string | null
  otp_hash: string | null; otp_expires_at: string | null; otp_attempts: number | null
  verified_until: string | null
}
const ID_COLS = 'id, email, phone, pin_hash, failed_pin_attempts, locked_until, otp_hash, otp_expires_at, otp_attempts, verified_until'

type Idf = { kind: 'email'; value: string } | { kind: 'phone'; value: string }

// Phone wins if supplied; else email. AU mobile → E.164 (+614xxxxxxxx) via the shared normaliser.
function resolveIdentifier(body: Record<string, unknown>): { idf: Idf } | { error: string } {
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : ''
  if (rawPhone) {
    // ARIA-PHONE-NORMALISE-1 — null is now the explicit "unresolvable" signal; the regex below
    // still enforces MOBILE specifically (a valid landline must not be accepted for OTP).
    const phone = normalisePhone(rawPhone)
    if (!phone || !/^\+614\d{8}$/.test(phone)) return { error: 'Enter a valid Australian mobile number.' }
    return { idf: { kind: 'phone', value: phone } }
  }
  const email = normaliseEmail(body.email)
  if (!email || !email.includes('@')) return { error: 'Enter a valid email or mobile number.' }
  return { idf: { kind: 'email', value: email } }
}

async function findIdentityBy(idf: Idf): Promise<IdentityRow | null> {
  const base = supabaseAdmin.from('loyalty_identity').select(ID_COLS)
  const { data } = idf.kind === 'phone'
    ? await base.eq('phone', idf.value).maybeSingle()
    : await base.ilike('email', idf.value).maybeSingle()
  return (data as IdentityRow | null) ?? null
}
async function ensureIdentityBy(idf: Idf): Promise<IdentityRow> {
  const existing = await findIdentityBy(idf)
  if (existing) return existing
  const insert = idf.kind === 'phone' ? { phone: idf.value } : { email: idf.value }
  const { data } = await supabaseAdmin.from('loyalty_identity').insert(insert).select(ID_COLS).single()
  return data as IdentityRow
}

async function ensureIdentityByEmail(email: string): Promise<IdentityRow> {
  return ensureIdentityBy({ kind: 'email', value: email })
}

function codeEmailHtml(code: string): string {
  return `<div style="font-family:Outfit,system-ui,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#0a0a0a">
    <h2 style="font-family:Cormorant,Georgia,serif;font-style:italic;margin:0 0 8px">Aria Rewards</h2>
    <p style="font-size:15px;color:#555;margin:0 0 16px">Here is your one-time code to sign in to your rewards:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px;border:1.5px solid #0a0a0a;border-radius:14px;background:#fafafa">${code}</div>
    <p style="font-size:12px;color:#888;margin:16px 0 0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
  </div>`
}

// GET ?business_id=… → the global identity + (if a business is given) the membership there.
export async function GET(req: Request) {
  const identity = await getLoyaltyIdentity()
  if (!identity) return NextResponse.json({ identity: null, membership: null })
  const bidParam = new URL(req.url).searchParams.get('business_id')
  let membership: { name: string | null } | null = null
  if (bidParam) {
    const realId = await resolveBusinessId(supabaseAdmin, bidParam)
    if (realId) {
      const m = await getLoyaltyMembership(realId)
      if (m) membership = { name: m.name }
    }
  }
  return NextResponse.json({ identity: { email: identity.email, phone: identity.phone }, membership })
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action ?? '')

  if (action === 'logout') {
    await clearLoyaltySession()
    return NextResponse.json({ ok: true })
  }

  // ── Cashier-invite acceptance (email-based): the token (on a membership row) pre-identifies them ──
  if (action === 'accept-invite') {
    const rl = await rateLimit(`loy-invite:${ip}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const token = String(body.token ?? '')
    const pin = body.pin
    if (!token || !isValidPin(pin)) {
      return NextResponse.json({ error: 'Enter a valid 6-digit PIN (avoid 000000 / 123456).' }, { status: 400 })
    }
    const { data: membershipRow } = await supabaseAdmin.from('pos_customers')
      .select('id, business_id, email, name, name_enc').eq('loyalty_invite_token', token).maybeSingle()
    if (!membershipRow) {
      return NextResponse.json({ error: 'This invite link is invalid or has already been used.' }, { status: 400 })
    }
    const email = normaliseEmail(membershipRow.email)
    if (!email) return NextResponse.json({ error: 'This invite is missing an email.' }, { status: 400 })
    const identity = await ensureIdentityByEmail(email)
    await supabaseAdmin.from('loyalty_identity').update({
      pin_hash: await hashPin(pin), pin_set_at: new Date().toISOString(),
      email_verified: true, failed_pin_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    }).eq('id', identity.id)
    await supabaseAdmin.from('pos_customers')
      .update({ loyalty_identity_id: identity.id, loyalty_invite_token: null }).eq('id', membershipRow.id)
    await setLoyaltySession(identity.id)
    return NextResponse.json({ ok: true, name: await membershipName(membershipRow.id as string, membershipRow.business_id as string), business_id: membershipRow.business_id })
  }

  // ── Remaining actions key off EITHER email OR phone ──
  const r = resolveIdentifier(body)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  const idf = r.idf
  const key = `${idf.kind}:${idf.value}`

  // send-code: sign in / sign up. Always identical response (no enumeration). Email → email OTP; phone → SMS OTP.
  if (action === 'send-code') {
    const rl = await rateLimit(`loy-code:${key}`, 5, 600, { failClosed: true })
    const rlIp = await rateLimit(`loy-code-ip:${ip}`, 20, 600, { failClosed: true })
    if (!rl.allowed || !rlIp.allowed) return tooManyRequests(Math.max(rl.retryAfter, rlIp.retryAfter))
    // SECURITY-P4 — rate-limited but had zero bot-check, unlike sibling public forms. Real SMS/email
    // cost per send; gate it the same way booking/loyalty-enrol already do.
    const turnstileDenied = await requireTurnstile(body.turnstile_token as string | undefined, ip)
    if (turnstileDenied) return turnstileDenied
    const identity = await ensureIdentityBy(idf)
    const code = genOtp()
    await supabaseAdmin.from('loyalty_identity').update({
      otp_hash: hashOtp(code), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0, updated_at: new Date().toISOString(),
    }).eq('id', identity.id)
    // Await the send so a provider failure surfaces; it's a SYSTEM error for ANY identifier (no enumeration).
    const sent = idf.kind === 'phone'
      ? await sendSMS(idf.value, `Your Aria Rewards code is ${code}. Expires in 10 minutes.`)
      : await sendEmail({ to: idf.value, subject: 'Your Aria Rewards code', html: codeEmailHtml(code), from_name: 'Aria Rewards' }, { category: 'transactional' })
    if (!sent) return NextResponse.json({ error: 'We couldn’t send your code right now. Please try again in a moment.' }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  // verify: validate the code. Phone → signed in (OTP-only). Email → opens the set-PIN window.
  if (action === 'verify') {
    const rl = await rateLimit(`loy-verify:${key}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const code = String(body.code ?? '')
    const identity = await findIdentityBy(idf)
    const expired = !identity?.otp_expires_at || new Date(identity.otp_expires_at).getTime() < Date.now()
    const tooMany = (identity?.otp_attempts ?? 0) >= MAX_OTP_ATTEMPTS
    const match = !!identity?.otp_hash && identity.otp_hash === hashOtp(code)
    if (!identity || expired || tooMany || !match) {
      if (identity) await supabaseAdmin.from('loyalty_identity').update({ otp_attempts: (identity.otp_attempts ?? 0) + 1 }).eq('id', identity.id)
      return NextResponse.json({ error: 'That code is incorrect or has expired.' }, { status: 400 })
    }

    if (idf.kind === 'phone') {
      // Phone is OTP-only: consume the code and sign them in immediately (no PIN).
      await supabaseAdmin.from('loyalty_identity').update({
        otp_hash: null, otp_expires_at: null, otp_attempts: 0, updated_at: new Date().toISOString(),
      }).eq('id', identity.id)
      await setLoyaltySession(identity.id)
      return NextResponse.json({ ok: true, signed_in: true })
    }

    // Email: open the set-PIN window (next step sets a PIN, or the user already has one).
    await supabaseAdmin.from('loyalty_identity').update({
      email_verified: true, otp_hash: null, otp_expires_at: null,
      verified_until: new Date(Date.now() + VERIFIED_TTL_MS).toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', identity.id)
    return NextResponse.json({ ok: true, signed_in: false, has_pin: !!identity.pin_hash })
  }

  // set-pin: EMAIL only (phone has no PIN). Requires a fresh verified window.
  if (action === 'set-pin') {
    if (idf.kind === 'phone') return NextResponse.json({ error: 'Phone sign-in uses a code each time — no PIN needed.' }, { status: 400 })
    const rl = await rateLimit(`loy-setpin:${key}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const pin = body.pin
    if (!isValidPin(pin)) return NextResponse.json({ error: 'Choose a 6-digit PIN (avoid 000000 / 123456).' }, { status: 400 })
    const identity = await findIdentityBy(idf)
    const verified = !!identity?.verified_until && new Date(identity.verified_until).getTime() > Date.now()
    if (!identity || !verified) return NextResponse.json({ error: 'Please verify your email again.' }, { status: 400 })
    await supabaseAdmin.from('loyalty_identity').update({
      pin_hash: await hashPin(pin), pin_set_at: new Date().toISOString(),
      verified_until: null, failed_pin_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    }).eq('id', identity.id)
    await setLoyaltySession(identity.id)

    let name: string | null = null
    const realId = body.business_id ? await resolveBusinessId(supabaseAdmin, String(body.business_id)) : null
    if (realId) {
      const providedName = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
      const m = await linkOrCreateMembership(identity.id, realId, { email: idf.value }, providedName)
      name = m.name
    }
    return NextResponse.json({ ok: true, name, business_id: realId })
  }

  // login: EMAIL + PIN only. Generic failures + 5-fail lockout (no enumeration). Phone never logs in by PIN.
  if (action === 'login') {
    const rlId = await rateLimit(`loy-login:${key}`, 10, 600, { failClosed: true })
    const rlIp = await rateLimit(`loy-login-ip:${ip}`, 40, 600, { failClosed: true })
    if (!rlId.allowed || !rlIp.allowed) return tooManyRequests(Math.max(rlId.retryAfter, rlIp.retryAfter))
    if (idf.kind === 'phone') return NextResponse.json({ error: GENERIC_AUTH_FAIL }, { status: 401 })
    const pin = String(body.pin ?? '')
    const identity = await findIdentityBy(idf)
    const locked = !!identity?.locked_until && new Date(identity.locked_until).getTime() > Date.now()
    const ok = !!identity?.pin_hash && !locked && await verifyPin(pin, identity.pin_hash)
    if (!ok) {
      if (identity?.pin_hash && !locked) {
        const fails = (identity.failed_pin_attempts ?? 0) + 1
        await supabaseAdmin.from('loyalty_identity').update({
          failed_pin_attempts: fails,
          locked_until: fails >= MAX_PIN_FAILS ? new Date(Date.now() + LOCK_MS).toISOString() : null,
        }).eq('id', identity.id)
      }
      return NextResponse.json({ error: GENERIC_AUTH_FAIL }, { status: 401 })
    }
    await supabaseAdmin.from('loyalty_identity').update({
      failed_pin_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    }).eq('id', identity!.id)
    await setLoyaltySession(identity!.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
