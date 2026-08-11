/**
 * ClickSend SMS utility — the single SMS chokepoint for Aria.
 * Docs: https://developers.clicksend.com/docs/rest/v3/#send-sms
 * Auth: Basic auth with username:api_key base64 encoded
 * Sender: "AriaOS" (alphanumeric sender ID — no number needed in AU)
 *
 * MSG-COMPLIANCE-1 — every send funnels through here, so the Spam Act guardrails live here:
 *  - sender ID is always set (AriaOS)
 *  - MARKETING sends: append "Reply STOP to opt out", honour the sms_suppression opt-out list,
 *    and require pos_customers.marketing_consent when the customer is resolvable
 *  - TRANSACTIONAL sends (the default): exempt from consent/suppression (receipts, reminders,
 *    OTP, owner/staff alerts must always go) but still get the sender ID + an audit log row
 *  - EVERY attempt (sent / skipped / failed) is written to sms_send_log (5-year audit record)
 *
 * Inbound STOP capture (auto-feeding the suppression list from customer replies) is a separate
 * sprint, MSG-COMPLIANCE-2 (needs a ClickSend inbound webhook). suppressNumber() below already
 * lets STOP handling / manual admin add opt-outs today.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { USD_PER_AUD } from '@/lib/fx-rate'

interface ClickSendResult {
  ok: boolean
  message_id?: string
  error?: string
}

export type SmsCategory = 'marketing' | 'transactional'

export interface SendSMSOptions {
  /** 'marketing' triggers consent + suppression + STOP-append. Default 'transactional'. */
  category?: SmsCategory
  /** Scopes the suppression + consent lookups and the audit log row. */
  businessId?: string | null
  /** When provided, marketing consent is read from pos_customers.marketing_consent. */
  customerId?: string | null
}

const STOP_NOTICE = 'Reply STOP to opt out.'

// CUSTOMER-PHONE-1 — normalisePhone MOVED to '@/lib/phone' so pos_customers can share the exact
// same function instead of growing a second copy. Re-exported here unchanged, so every existing
// importer of '@/lib/clicksend' keeps working and the SMS paths are untouched.
export { normalisePhone } from '@/lib/phone'
// Re-export alone does not bind the name locally; suppressNumber() below calls it directly.
import { normalisePhone, toE164AU } from '@/lib/phone'

/** Add a number to the opt-out list (used by STOP handling in MSG-COMPLIANCE-2 + manual/admin). */
export async function suppressNumber(
  businessId: string | null,
  phone: string,
  reason: 'stop' | 'manual' | 'bounce' = 'manual',
): Promise<void> {
  try {
    // ARIA-PHONE-NORMALISE-1 — suppression is keyed on the SAME canonical form sendSMS uses, so an
    // unresolvable number cannot be suppressed (there is nothing to key on) and equally can never
    // be sent to. Storing a fabricated key here would have created a suppression row that no
    // future send would ever match.
    const key = normalisePhone(phone)
    if (!key) { console.warn('[sms] suppressNumber: unusable phone, nothing to suppress'); return }
    await supabaseAdmin
      .from('sms_suppression')
      .upsert(
        { business_id: businessId, phone: key, reason },
        { onConflict: 'business_id,phone' },
      )
  } catch (err) {
    console.error('[sms] suppressNumber failed:', err instanceof Error ? err.message : String(err))
  }
}

async function logSend(row: {
  business_id: string | null
  to_number: string
  body: string
  category: SmsCategory
  consent_ok: boolean | null
  suppressed: boolean
  clicksend_message_id: string | null
  status: 'sent' | 'failed' | 'skipped'
  error: string | null
}): Promise<void> {
  // Best-effort: a logging failure must never block a send (esp. transactional).
  try {
    await supabaseAdmin.from('sms_send_log').insert(row)
  } catch (err) {
    console.error('[sms] sms_send_log insert failed:', err instanceof Error ? err.message : String(err))
  }
}

// COST-LEDGER-1 — ClickSend's send-sms response (parsed above) does not carry a per-message price
// field on this account/plan, so cost is computed from a flat rate rather than read from the API.
// AUD is ClickSend's billing currency for AU numbers; USD_PER_AUD is a fixed, deliberately simple
// conversion (not a live FX rate) — both the AUD and USD figures are recorded in metadata so a more
// precise rate can be back-applied later without re-deriving from nothing.
const CLICKSEND_RATE_AUD_CENTS = 8 // AUD $0.08/SMS — ClickSend's standard AU alphanumeric-sender rate as of this sprint; update if the account's actual negotiated rate differs.

async function logSmsCostEvent(businessId: string | null, messageId: string | null): Promise<void> {
  try {
    const amountUsdCents = Math.round(CLICKSEND_RATE_AUD_CENTS * USD_PER_AUD)
    await supabaseAdmin.from('cost_events').insert({
      category: 'sms',
      provider: 'clicksend',
      business_id: businessId,
      reference_id: messageId,
      amount_usd_cents: amountUsdCents,
      quantity: 1,
      unit: 'message',
      metadata: { rate_aud_cents: CLICKSEND_RATE_AUD_CENTS, usd_per_aud: USD_PER_AUD },
    })
  } catch (err) {
    console.error('[sms] cost_events insert failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}

export async function sendSMS(to: string, body: string, opts: SendSMSOptions = {}): Promise<ClickSendResult> {
  const category: SmsCategory = opts.category ?? 'transactional'
  const businessId = opts.businessId ?? null

  // ARIA-PHONE-NORMALISE-1 — refuse locally instead of fabricating a number.
  //
  // normalisePhone used to blanket-prefix '+61' onto anything, so `234567u8io` became
  // `+61234567u8io` and was handed to ClickSend, which rejected it — a send that "happened",
  // failed at the provider, and cost a request. It now returns null for unresolvable input.
  //
  // Logged as a skipped send with an explicit reason rather than thrown: sendSMS is called from
  // OTP paths, cron jobs and campaign loops, and a throw here would take down the caller for one
  // bad row. Nothing that was ever deliverable becomes undeliverable — no stored number in any
  // audited table has the fabricated shape.
  const phone = normalisePhone(to)
  if (!phone) {
    await logSend({
      business_id: businessId, to_number: String(to ?? ''), body, category,
      consent_ok: null, suppressed: false, clicksend_message_id: null, status: 'skipped',
      error: 'unusable_phone',
    })
    return { ok: false, error: 'unusable_phone' }
  }

  // MARKETING only: append the STOP notice if the body doesn't already carry one.
  let finalBody = body
  if (category === 'marketing' && !/reply\s+stop/i.test(body)) {
    finalBody = body.trimEnd() + '\n\n' + STOP_NOTICE
  }

  // MARKETING only: opt-out (suppression) + per-channel SMS consent gating. Transactional skips both.
  let suppressed = false
  let consentOk: boolean | null = null
  if (category === 'marketing') {
    try {
      let supQuery = supabaseAdmin.from('sms_suppression').select('id').eq('phone', phone)
      supQuery = businessId ? supQuery.eq('business_id', businessId) : supQuery.is('business_id', null)
      const { data: sup } = await supQuery.limit(1).maybeSingle()
      if (sup) suppressed = true
    } catch (err) {
      // Fail-open on a transient suppression-table error (don't silently kill all marketing),
      // but record it. Normal operation: table present, this never throws.
      console.error('[sms] suppression check failed (fail-open):', err instanceof Error ? err.message : String(err))
    }

    if (!suppressed) {
      try {
        // CONSENT-COLLECTION-1: SMS marketing must check the per-channel sms_consent flag, NOT the
        // combined marketing_consent (which is true if EITHER channel opted in) — otherwise an
        // email-only opt-in would leak into SMS sends.
        if (opts.customerId && businessId) {
          const { data: c } = await supabaseAdmin
            .from('pos_customers').select('sms_consent')
            .eq('id', opts.customerId).eq('business_id', businessId).maybeSingle()
          if (c) consentOk = !!c.sms_consent
        } else if (businessId) {
          // Best-effort consent resolution by phone when no customerId was supplied.
          const { data: c } = await supabaseAdmin
            .from('pos_customers').select('sms_consent')
            // S-PHONE-E164 — consent lives on the normalised customer row; a raw match here failed
            // to find it and fell back to "no consent recorded".
            .eq('business_id', businessId).eq('phone', toE164AU(to) ?? to).maybeSingle()
          if (c) consentOk = !!c.sms_consent
        }
      } catch (err) {
        console.error('[sms] consent check failed:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  // Block marketing if opted-out OR an explicit no-consent (consentOk === false). Unknown (null)
  // — i.e. we couldn't resolve the customer — proceeds, since we can't prove a lack of consent.
  if (suppressed || consentOk === false) {
    await logSend({
      business_id: businessId, to_number: phone, body: finalBody, category,
      consent_ok: consentOk, suppressed, clicksend_message_id: null, status: 'skipped',
      error: suppressed ? 'suppressed' : 'no_consent',
    })
    return { ok: false, error: suppressed ? 'suppressed' : 'no_consent' }
  }

  const username = process.env.CLICKSEND_USERNAME
  const apiKey = process.env.CLICKSEND_API_KEY
  if (!username || !apiKey) {
    console.warn('[clicksend] Missing credentials — SMS not sent')
    await logSend({
      business_id: businessId, to_number: phone, body: finalBody, category,
      consent_ok: consentOk, suppressed, clicksend_message_id: null, status: 'failed', error: 'SMS not configured',
    })
    return { ok: false, error: 'SMS not configured' }
  }

  const auth = Buffer.from(username + ':' + apiKey).toString('base64')

  // CLICKSEND_SENDER_ID env var controls the 'from' field.
  // If unset, we omit 'from' entirely so ClickSend uses the account's default shared AU number.
  // A hardcoded alphanumeric like "AriaOS" will be accepted by the ClickSend API (response_code
  // SUCCESS, message_id assigned) but silently dropped at the carrier if it is not registered —
  // which is exactly the symptom of OTP rows persisting while SMS never arrives.
  const senderId: string | undefined = process.env.CLICKSEND_SENDER_ID || undefined
  const messagePayload: Record<string, string> = {
    source: 'aria_os',
    body: finalBody,
    to: phone,
  }
  if (senderId) messagePayload.from = senderId

  try {
    const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + auth,
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ messages: [messagePayload] }),
    })

    const data = await res.json() as {
      data?: { messages?: Array<{ message_id: string; status: string; status_code?: string }> }
      response_code?: string
      response_msg?: string
    }

    // Envelope-level check: ClickSend must report SUCCESS at the API level.
    if (!res.ok || data.response_code !== 'SUCCESS') {
      console.error('[clicksend] Envelope failure to=' + phone + ' http=' + res.status + ' body=' + JSON.stringify(data))
      await logSend({
        business_id: businessId, to_number: phone, body: finalBody, category,
        consent_ok: consentOk, suppressed, clicksend_message_id: null, status: 'failed',
        error: 'ClickSend envelope error: ' + (data.response_code ?? res.status),
      })
      return { ok: false, error: 'ClickSend envelope error: ' + (data.response_code ?? res.status) }
    }

    const msg = data.data?.messages?.[0]
    const msgStatus = (msg?.status ?? 'UNKNOWN').toUpperCase()

    // Always log the per-message status so Vercel logs show the carrier acceptance verdict.
    // SUCCESS / QUEUED / SENT = accepted for delivery. Anything else = rejected.
    console.log('[clicksend] message_id=' + (msg?.message_id ?? 'none') + ' status=' + msgStatus + ' to=' + phone + (senderId ? ' from=' + senderId : ' from=<account-default>'))

    const ACCEPTED = new Set(['SUCCESS', 'QUEUED', 'SENT'])
    if (!ACCEPTED.has(msgStatus)) {
      console.error('[clicksend] Per-message rejection to=' + phone + ' status=' + msgStatus + ' full=' + JSON.stringify(data))
      await logSend({
        business_id: businessId, to_number: phone, body: finalBody, category,
        consent_ok: consentOk, suppressed, clicksend_message_id: msg?.message_id ?? null, status: 'failed',
        error: 'ClickSend message status: ' + msgStatus,
      })
      return { ok: false, error: 'ClickSend message status: ' + msgStatus }
    }

    await logSend({
      business_id: businessId, to_number: phone, body: finalBody, category,
      consent_ok: consentOk, suppressed, clicksend_message_id: msg?.message_id ?? null, status: 'sent', error: null,
    })
    void logSmsCostEvent(businessId, msg?.message_id ?? null)
    return { ok: true, message_id: msg?.message_id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[clicksend] Exception:', error)
    await logSend({
      business_id: businessId, to_number: phone, body: finalBody, category,
      consent_ok: consentOk, suppressed, clicksend_message_id: null, status: 'failed', error,
    })
    return { ok: false, error }
  }
}
