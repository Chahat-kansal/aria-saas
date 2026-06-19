export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'
import { sendEmail } from '@/lib/external-apis'
import { encryptCustomerPII } from '@/lib/aria/customer-pii'
import {
  genOtp, hashOtp, hashPin, verifyPin, isValidPin, normaliseEmail,
  setLoyaltySession, clearLoyaltySession, getLoyaltyCustomer,
} from '@/lib/loyalty/auth'

// LOY-P1-IDENTITY — passwordless email + 6-digit-PIN auth for loyalty customers.
// HARD RULES enforced here: pin_hash bcrypt only & never returned/logged; every public
// action rate-limited fail-closed; responses are generic so account existence never leaks
// (no enumeration); a session resolves to exactly one customer's own row.

const GENERIC_AUTH_FAIL = 'Incorrect email or PIN — or too many attempts. Please try again shortly.'
const OTP_TTL_MS = 10 * 60 * 1000
const VERIFIED_TTL_MS = 10 * 60 * 1000
const MAX_PIN_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5

interface AuthRow {
  id: string; customer_id: string | null; business_id: string; email: string
  pin_hash: string | null; failed_pin_attempts: number | null; locked_until: string | null
  otp_hash: string | null; otp_expires_at: string | null; otp_attempts: number | null
  verified_until: string | null
}

const AUTH_COLS = 'id, customer_id, business_id, email, pin_hash, failed_pin_attempts, locked_until, otp_hash, otp_expires_at, otp_attempts, verified_until'

async function businessName(businessId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('businesses').select('name').eq('id', businessId).maybeSingle()
  return (data?.name as string) ?? 'Your rewards'
}

function codeEmailHtml(bizName: string, code: string): string {
  return `<div style="font-family:Inter,system-ui,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#0a0a0a">
    <h2 style="font-family:Georgia,serif;font-style:italic;margin:0 0 8px">${bizName} Rewards</h2>
    <p style="font-size:15px;color:#555;margin:0 0 16px">Here is your one-time code to set up or recover your loyalty PIN:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px;border:1.5px solid #0a0a0a;border-radius:14px;background:#fafafa">${code}</div>
    <p style="font-size:12px;color:#888;margin:16px 0 0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
  </div>`
}

export async function GET() {
  const c = await getLoyaltyCustomer()
  return NextResponse.json({ customer: c ? { name: c.name, email: c.email } : null })
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action ?? '')

  if (action === 'logout') {
    await clearLoyaltySession()
    return NextResponse.json({ ok: true })
  }

  // ── Cashier-invite acceptance: the token (sent to the customer) pre-identifies them ──
  if (action === 'accept-invite') {
    const rl = await rateLimit(`loy-invite:${ip}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const token = String(body.token ?? '')
    const pin = body.pin
    if (!token || !isValidPin(pin)) {
      return NextResponse.json({ error: 'Enter a valid 6-digit PIN (avoid 000000 / 123456).' }, { status: 400 })
    }
    const { data: row } = await supabaseAdmin.from('pos_customer_auth')
      .select(AUTH_COLS).eq('invite_token', token).maybeSingle()
    const auth = row as AuthRow | null
    if (!auth || !auth.customer_id) {
      return NextResponse.json({ error: 'This invite link is invalid or has already been used.' }, { status: 400 })
    }
    await supabaseAdmin.from('pos_customer_auth').update({
      pin_hash: await hashPin(pin), pin_set_at: new Date().toISOString(),
      email_verified: true, invite_token: null, failed_pin_attempts: 0, locked_until: null,
      updated_at: new Date().toISOString(),
    }).eq('id', auth.id)
    await setLoyaltySession(auth.id)
    const name = await customerName(auth.customer_id, auth.business_id)
    return NextResponse.json({ ok: true, name })
  }

  // ── All remaining actions are business-scoped ──
  const realId = body.business_id ? await resolveBusinessId(supabaseAdmin, String(body.business_id)) : null
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const email = normaliseEmail(body.email)
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })

  // send-code: used by BOTH self-signup ("Join") and forgot-PIN. Always identical response.
  if (action === 'send-code') {
    const rl = await rateLimit(`loy-code:${realId}:${email}`, 5, 600, { failClosed: true })
    const rlIp = await rateLimit(`loy-code-ip:${ip}`, 20, 600, { failClosed: true })
    if (!rl.allowed || !rlIp.allowed) return tooManyRequests(Math.max(rl.retryAfter, rlIp.retryAfter))

    const auth = await ensureAuthRow(realId, email)
    const code = genOtp()
    await supabaseAdmin.from('pos_customer_auth').update({
      otp_hash: hashOtp(code), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0, updated_at: new Date().toISOString(),
    }).eq('id', auth.id)
    // Fire-and-forget; never block on the mail provider and never reveal send outcome.
    void sendEmail(
      { to: email, subject: `Your ${await businessName(realId)} loyalty code`, html: codeEmailHtml(await businessName(realId), code), from_name: await businessName(realId) },
      { category: 'transactional', businessId: realId },
    )
    return NextResponse.json({ ok: true }) // identical regardless of account existence
  }

  // verify: validate the emailed code. Proves email ownership → opens the set-PIN window.
  if (action === 'verify') {
    const rl = await rateLimit(`loy-verify:${realId}:${email}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const code = String(body.code ?? '')
    const { data: row } = await supabaseAdmin.from('pos_customer_auth')
      .select(AUTH_COLS).eq('business_id', realId).ilike('email', email).maybeSingle()
    const auth = row as AuthRow | null

    const expired = !auth?.otp_expires_at || new Date(auth.otp_expires_at).getTime() < Date.now()
    const tooMany = (auth?.otp_attempts ?? 0) >= MAX_OTP_ATTEMPTS
    const match = !!auth?.otp_hash && auth.otp_hash === hashOtp(code)
    if (!auth || expired || tooMany || !match) {
      if (auth) await supabaseAdmin.from('pos_customer_auth').update({ otp_attempts: (auth.otp_attempts ?? 0) + 1 }).eq('id', auth.id)
      return NextResponse.json({ error: 'That code is incorrect or has expired.' }, { status: 400 })
    }

    // Email ownership proven. The pos_customers row (for brand-new emails) is created once at
    // set-pin, where the chosen display name is known — avoids a null-name insert here.
    await supabaseAdmin.from('pos_customer_auth').update({
      email_verified: true, otp_hash: null, otp_expires_at: null,
      verified_until: new Date(Date.now() + VERIFIED_TTL_MS).toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', auth.id)

    return NextResponse.json({ ok: true, has_pin: !!auth.pin_hash })
  }

  // set-pin: requires a fresh verified window (email proven). Used for signup + recovery.
  if (action === 'set-pin') {
    const rl = await rateLimit(`loy-setpin:${realId}:${email}`, 10, 600, { failClosed: true })
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)
    const pin = body.pin
    if (!isValidPin(pin)) return NextResponse.json({ error: 'Choose a 6-digit PIN (avoid 000000 / 123456).' }, { status: 400 })
    const { data: row } = await supabaseAdmin.from('pos_customer_auth')
      .select(AUTH_COLS).eq('business_id', realId).ilike('email', email).maybeSingle()
    const auth = row as AuthRow | null
    const verified = !!auth?.verified_until && new Date(auth.verified_until).getTime() > Date.now()
    if (!auth || !verified) return NextResponse.json({ error: 'Please verify your email again.' }, { status: 400 })

    const providedName = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    let customerId = auth.customer_id
    if (!customerId) customerId = await createSelfSignupCustomer(realId, email, providedName)
    else if (providedName) await maybeSetName(customerId, realId, providedName)

    await supabaseAdmin.from('pos_customer_auth').update({
      customer_id: customerId, pin_hash: await hashPin(pin), pin_set_at: new Date().toISOString(),
      verified_until: null, failed_pin_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    }).eq('id', auth.id)
    await setLoyaltySession(auth.id)
    return NextResponse.json({ ok: true, name: await customerName(customerId, realId) })
  }

  // login: email + PIN. No OTP. Generic failures + per-email lockout (no enumeration).
  if (action === 'login') {
    const rlEmail = await rateLimit(`loy-login:${realId}:${email}`, 10, 600, { failClosed: true })
    const rlIp = await rateLimit(`loy-login-ip:${ip}`, 40, 600, { failClosed: true })
    if (!rlEmail.allowed || !rlIp.allowed) return tooManyRequests(Math.max(rlEmail.retryAfter, rlIp.retryAfter))
    const pin = String(body.pin ?? '')
    const { data: row } = await supabaseAdmin.from('pos_customer_auth')
      .select(AUTH_COLS).eq('business_id', realId).ilike('email', email).maybeSingle()
    const auth = row as AuthRow | null

    const locked = !!auth?.locked_until && new Date(auth.locked_until).getTime() > Date.now()
    const ok = !!auth?.pin_hash && !locked && await verifyPin(pin, auth.pin_hash)
    if (!ok) {
      if (auth?.pin_hash && !locked) {
        const fails = (auth.failed_pin_attempts ?? 0) + 1
        await supabaseAdmin.from('pos_customer_auth').update({
          failed_pin_attempts: fails,
          locked_until: fails >= MAX_PIN_FAILS ? new Date(Date.now() + LOCK_MS).toISOString() : null,
        }).eq('id', auth.id)
      }
      return NextResponse.json({ error: GENERIC_AUTH_FAIL }, { status: 401 })
    }
    await supabaseAdmin.from('pos_customer_auth').update({
      failed_pin_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    }).eq('id', auth!.id)
    await setLoyaltySession(auth!.id)
    return NextResponse.json({ ok: true, name: await customerName(auth!.customer_id, realId) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── helpers ──
async function ensureAuthRow(businessId: string, email: string): Promise<{ id: string }> {
  const { data: existing } = await supabaseAdmin.from('pos_customer_auth')
    .select('id, customer_id').eq('business_id', businessId).ilike('email', email).maybeSingle()
  if (existing) {
    // Silently link an existing customer with this email (claim points; never reveal to caller).
    if (!existing.customer_id) {
      const { data: cust } = await supabaseAdmin.from('pos_customers')
        .select('id').eq('business_id', businessId).ilike('email', email).maybeSingle()
      if (cust) await supabaseAdmin.from('pos_customer_auth').update({ customer_id: cust.id }).eq('id', existing.id)
    }
    return { id: existing.id as string }
  }
  const { data: cust } = await supabaseAdmin.from('pos_customers')
    .select('id').eq('business_id', businessId).ilike('email', email).maybeSingle()
  const { data: created } = await supabaseAdmin.from('pos_customer_auth')
    .insert({ business_id: businessId, email, customer_id: cust?.id ?? null })
    .select('id').single()
  return { id: created!.id as string }
}

async function createSelfSignupCustomer(businessId: string, email: string, name?: string): Promise<string> {
  // Re-check for an existing customer first (race / case-variant) before creating — never duplicate.
  const { data: existing } = await supabaseAdmin.from('pos_customers')
    .select('id').eq('business_id', businessId).ilike('email', email).maybeSingle()
  if (existing) return existing.id as string
  // pos_customers.name is NOT NULL — fall back to the email's local part when no name is given.
  const displayName = (name && name.trim()) || email.split('@')[0] || 'Member'
  const { data: created } = await supabaseAdmin.from('pos_customers').insert({
    business_id: businessId, name: displayName, email,
    ...encryptCustomerPII({ name: displayName, email }, businessId),
    marketing_consent: true, email_consent: true, consent_captured_at: new Date().toISOString(),
    consent_source: 'online', source: 'loyalty_signup',
    points_balance: 0, stamps_count: 0, loyalty_points: 0,
  }).select('id').single()
  return created!.id as string
}

async function maybeSetName(customerId: string, businessId: string, name: string): Promise<void> {
  const { data: cust } = await supabaseAdmin.from('pos_customers').select('name').eq('id', customerId).maybeSingle()
  if (cust && !cust.name) {
    await supabaseAdmin.from('pos_customers')
      .update({ name, ...encryptCustomerPII({ name }, businessId) }).eq('id', customerId)
  }
}

async function customerName(customerId: string | null, businessId: string): Promise<string | null> {
  if (!customerId) return null
  const { data } = await supabaseAdmin.from('pos_customers').select('id, name, name_enc').eq('id', customerId).maybeSingle()
  if (!data) return null
  const { decryptCustomerPII } = await import('@/lib/aria/customer-pii')
  try { return decryptCustomerPII(data as Record<string, unknown>, businessId).name ?? ((data.name as string) ?? null) } catch { return (data.name as string) ?? null }
}
