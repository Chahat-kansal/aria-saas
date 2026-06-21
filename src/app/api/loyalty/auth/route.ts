export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'
import { sendEmail } from '@/lib/external-apis'
import {
  genOtp, hashOtp, hashPin, verifyPin, isValidPin, normaliseEmail,
  setLoyaltySession, clearLoyaltySession, getLoyaltyIdentity, getLoyaltyMembership,
} from '@/lib/loyalty/auth'
import { linkOrCreateMembership, membershipName } from '@/lib/loyalty/membership'

// LOY-NETWORK — GLOBAL identity auth (email + 6-digit PIN), business-agnostic. All LOY-P1 security
// preserved: bcrypt PIN, fail-closed rate limits, generic non-enumerating responses, 5-fail lockout,
// hashed OTP. Memberships (per-business pos_customers rows) are linked separately.

const GENERIC_AUTH_FAIL = 'Incorrect email or PIN — or too many attempts. Please try again shortly.'
const OTP_TTL_MS = 10 * 60 * 1000
const VERIFIED_TTL_MS = 10 * 60 * 1000
const MAX_PIN_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5

interface IdentityRow {
  id: string; email: string; pin_hash: string | null
  failed_pin_attempts: number | null; locked_until: string | null
  otp_hash: string | null; otp_expires_at: string | null; otp_attempts: number | null
  verified_until: string | null
}
const ID_COLS = 'id, email, pin_hash, failed_pin_attempts, locked_until, otp_hash, otp_expires_at, otp_attempts, verified_until'

function codeEmailHtml(code: string): string {
  return `<div style="font-family:Outfit,system-ui,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#0a0a0a">
    <h2 style="font-family:Cormorant,Georgia,serif;font-style:italic;margin:0 0 8px">Aria Rewards</h2>
    <p style="font-size:15px;color:#555;margin:0 0 16px">Here is your one-time code to set up or recover your loyalty PIN:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px;border:1.5px solid #0a0a0a;border-radius:14px;background:#fafafa">${code}</div>
    <p style="font-size:12px;color:#888;margin:16px 0 0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
  </div>`
}

async function findIdentity(email: string): Promise<IdentityRow | null> {
  const { data } = await supabaseAdmin.from('loyalty_identity').select(ID_COLS).ilike('email', email).maybeSingle()
  return (data as IdentityRow | null) ?? null
}
async function ensureIdentity(email: string): Promise<IdentityRow> {
  const existing = await findIdentity(email)
  if (existing) return existing
  const { data } = await supabaseAdmin.from('loyalty_identity').insert({ email }).select(ID_COLS).single()
  return data as IdentityRow
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
  return NextResponse.json({ identity: { email: identity.email }, membership })
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action ?? '')

  if (action === 'logout') {
    await clearLoyaltySession()
    return NextResponse.json({ ok: true })
  }

  // ── Cashier-invite acceptance: the token (on a membership row) pre-identifies the customer ──
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
    const identity = await ensureIdentity(email)
    await supabaseAdmin.from('loyalty_identity').update({
      pin_hash: await hashPin(pin), pin_set_at: new Date().toISOString(),
      email_verified: true, failed_pin_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    }).eq('id', identity.id)
    // Link this membership to the identity + consume the invite token.
    await supabaseAdmin.from('pos_customers')
      .update({ loyalty_identity_id: identity.id, loyalty_invite_token: null }).eq('id', membershipRow.id)
    await setLoyaltySession(identity.id)
    return NextResponse.json({ ok: true, name: await membershipName(membershipRow.id as string, membershipRow.business_id as string), business_id: membershipRow.business_id })
  }

  // ── Remaining actions key off the global email identity ──
  const email = normaliseEmail(body.email)
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })

  // send-code: self-signup ("Join") + forgot-PIN. Always identical response (no enumeration).
  if (action === 'send-code') {
    const rl = await rateLimit(`loy-code:${email}`, 5, 600, { failClosed: true })
    const rlIp = await rateLimit(`loy-code-ip:${ip}`, 20, 600, { failClosed: true })
    if (!rl.allowed || !rlIp.allowed) return tooManyRequests(Math.max(rl.retryAfter, rlIp.retryAfter))
    const identity = await ensureIdentity(email)
    const code = genOtp()
    await supabaseAdmin.from('loyalty_identity').update({
      otp_hash: hashOtp(code), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0, updated_at: new Date().toISOString(),
    }).eq('id', identity.id)
    void sendEmail(
      { to: email, subject: 'Your Aria Rewards code', html: codeEmailHtml(code), from_name: 'Aria Rewards' },
      { category: 'transactional' },
    )
    return NextResponse.json({ ok: true })
  }

  // verify: validate the emailed code → opens the set-PIN window.
  if (action === 'verify') {
    const rl = await rateLimit(`loy-verify:${email}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const code = String(body.code ?? '')
    const identity = await findIdentity(email)
    const expired = !identity?.otp_expires_at || new Date(identity.otp_expires_at).getTime() < Date.now()
    const tooMany = (identity?.otp_attempts ?? 0) >= MAX_OTP_ATTEMPTS
    const match = !!identity?.otp_hash && identity.otp_hash === hashOtp(code)
    if (!identity || expired || tooMany || !match) {
      if (identity) await supabaseAdmin.from('loyalty_identity').update({ otp_attempts: (identity.otp_attempts ?? 0) + 1 }).eq('id', identity.id)
      return NextResponse.json({ error: 'That code is incorrect or has expired.' }, { status: 400 })
    }
    await supabaseAdmin.from('loyalty_identity').update({
      email_verified: true, otp_hash: null, otp_expires_at: null,
      verified_until: new Date(Date.now() + VERIFIED_TTL_MS).toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', identity.id)
    return NextResponse.json({ ok: true, has_pin: !!identity.pin_hash })
  }

  // set-pin: requires a fresh verified window. Sets the global PIN; if a business is supplied,
  // also creates/links the membership there (smooth /loyalty/[business_id] signup).
  if (action === 'set-pin') {
    const rl = await rateLimit(`loy-setpin:${email}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const pin = body.pin
    if (!isValidPin(pin)) return NextResponse.json({ error: 'Choose a 6-digit PIN (avoid 000000 / 123456).' }, { status: 400 })
    const identity = await findIdentity(email)
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
      const m = await linkOrCreateMembership(identity.id, realId, email, providedName)
      name = m.name
    }
    return NextResponse.json({ ok: true, name, business_id: realId })
  }

  // login: email + PIN. No OTP. Generic failures + lockout (no enumeration).
  if (action === 'login') {
    const rlEmail = await rateLimit(`loy-login:${email}`, 10, 600, { failClosed: true })
    const rlIp = await rateLimit(`loy-login-ip:${ip}`, 40, 600, { failClosed: true })
    if (!rlEmail.allowed || !rlIp.allowed) return tooManyRequests(Math.max(rlEmail.retryAfter, rlIp.retryAfter))
    const pin = String(body.pin ?? '')
    const identity = await findIdentity(email)
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
