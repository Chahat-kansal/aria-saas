export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { hasValidKioskSession } from '@/lib/kiosk/cookie'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { rateLimit, clientIp } from '@/lib/security/rate-limit'

function isValidEmail(s: string) {
  return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s)
}

export async function POST(req: Request) {
  try {
    const { business_id, email, name, conversation_id } = await req.json() as {
      business_id: string
      email: string
      name?: string
      conversation_id?: string
    }

    if (!business_id || !email) {
      return NextResponse.json({ error: 'business_id and email required' }, { status: 400 })
    }
    // SECURITY-P1 (C-03) — business_id used to be trusted straight from the body with no session
    // check at all: any caller could look up any customer by email for any business, and phantom
    // pos_customers rows could be injected into any business's data. Same ariakiosk_${bid} cookie
    // check src/app/api/public/scan-and-go/cart|finish already use — proves the caller actually
    // went through this specific business's kiosk session flow (src/app/api/public/instore/session)
    // rather than just claiming a business_id.
    if (!hasValidKioskSession(business_id)) {
      return NextResponse.json({ error: 'session_expired' }, { status: 401 })
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // WIDGET-PII-LEAK-FIX — a valid kiosk session proves physical presence at this business's
    // kiosk, not ownership of the typed email, so the lookup below must never surface whose email
    // it was matched against. Scope a lookup-specific limit on top of the endpoint itself, since a
    // kiosk session could otherwise be used to probe many emails in a row.
    const rl = await rateLimit('instore-loyalty:' + clientIp(req) + ':' + business_id, 15, 60)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
    }

    const { data: config } = await supabaseAdmin
      .from('instore_kiosk_configs')
      .select('loyalty_enabled, enabled')
      .eq('business_id', business_id)
      .maybeSingle()

    if (config && (config.enabled === false || config.loyalty_enabled === false)) {
      return NextResponse.json({ error: 'Loyalty signup disabled' }, { status: 403 })
    }

    // ── Find-or-create the customer row (still required for correct enrolment/dedup) ──
    // WIDGET-PII-LEAK-FIX: the response below deliberately does NOT depend on whether `existing`
    // was found — new and returning callers get the byte-identical response. Surfacing "found vs
    // not found" (let alone name/points/stamps) is itself an enumeration oracle for someone typing
    // emails at the kiosk that aren't their own — see the loyalty/[business_id]/balance route's
    // SECURITY-P1 (C-02) fix for the same principle applied to a verified-session endpoint.
    const { data: existing } = await supabaseAdmin
      .from('pos_customers')
      .select('id')
      .eq('business_id', business_id)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    let customerId = existing?.id ?? null

    if (!customerId) {
      const { data: created, error: insertErr } = await supabaseAdmin.from('pos_customers').insert({
        business_id,
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        loyalty_points: 0,
        points_balance: 0,
        stamps_count: 0,
        source: 'instore-kiosk',
        // CONSENT-COLLECTION-1: kiosk captures email for loyalty but asks no marketing opt-in —
        // record provenance only; channel consent stays false (DB default) until expressly given.
        consent_source: 'online',
      }).select('id').single()

      if (insertErr || !created) {
        return NextResponse.json({ error: 'Could not create customer' }, { status: 500 })
      }
      customerId = created.id
    }

    // Link conversation to customer + record email captured
    if (conversation_id) {
      await supabaseAdmin.from('instore_conversations').update({
        customer_id: customerId,
        email_captured: email.toLowerCase().trim(),
      }).eq('id', conversation_id).eq('business_id', business_id)
    }

    // Log the lookup/enrol attempt — non-blocking, per WIDGET-PII-LEAK-FIX's audit-trail requirement.
    void supabaseAdmin.from('activity_log').insert({
      business_id,
      action_type: 'instore_loyalty_lookup',
      description: '[instore/loyalty] kiosk lookup/enrol attempt',
      metadata: { email: email.toLowerCase().trim(), conversation_id: conversation_id ?? null },
      created_at: new Date().toISOString(),
    }).then(({ error }) => { if (error) console.error('[non-fatal] activity_log insert failed', error) })

    return NextResponse.json({
      success: true,
      welcome_message: "Thanks! You're all set — ask a team member if you'd like to check your rewards balance.",
    })
  } catch (err) {
    console.error('[instore/loyalty] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
