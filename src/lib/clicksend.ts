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

/** Normalise an AU number to +61 E.164-ish form (shared by send + suppression so they match). */
export function normalisePhone(to: string): string {
  let phone = (to ?? '').trim()
  if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
  if (!phone.startsWith('+')) phone = '+61' + phone
  return phone
}

/** Add a number to the opt-out list (used by STOP handling in MSG-COMPLIANCE-2 + manual/admin). */
export async function suppressNumber(
  businessId: string | null,
  phone: string,
  reason: 'stop' | 'manual' | 'bounce' = 'manual',
): Promise<void> {
  try {
    await supabaseAdmin
      .from('sms_suppression')
      .upsert(
        { business_id: businessId, phone: normalisePhone(phone), reason },
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

export async function sendSMS(to: string, body: string, opts: SendSMSOptions = {}): Promise<ClickSendResult> {
  const category: SmsCategory = opts.category ?? 'transactional'
  const businessId = opts.businessId ?? null
  const phone = normalisePhone(to)

  // MARKETING only: append the STOP notice if the body doesn't already carry one.
  let finalBody = body
  if (category === 'marketing' && !/reply\s+stop/i.test(body)) {
    finalBody = body.trimEnd() + '\n\n' + STOP_NOTICE
  }

  // MARKETING only: opt-out (suppression) + marketing_consent gating. Transactional skips both.
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
        if (opts.customerId && businessId) {
          const { data: c } = await supabaseAdmin
            .from('pos_customers').select('marketing_consent')
            .eq('id', opts.customerId).eq('business_id', businessId).maybeSingle()
          if (c) consentOk = !!c.marketing_consent
        } else if (businessId) {
          // Best-effort consent resolution by phone when no customerId was supplied.
          const { data: c } = await supabaseAdmin
            .from('pos_customers').select('marketing_consent')
            .eq('business_id', businessId).eq('phone', to).maybeSingle()
          if (c) consentOk = !!c.marketing_consent
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

  const auth = Buffer.from(`${username}:${apiKey}`).toString('base64')

  try {
    const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        messages: [{
          source: 'aria_os',
          from: 'AriaOS',  // alphanumeric sender — shows as "AriaOS" on recipient phone
          body: finalBody,
          to: phone,
        }],
      }),
    })

    const data = await res.json() as {
      data?: { messages?: Array<{ message_id: string; status: string }> }
      response_code?: string
    }

    if (!res.ok || data.response_code !== 'SUCCESS') {
      console.error('[clicksend] Send failed:', JSON.stringify(data))
      await logSend({
        business_id: businessId, to_number: phone, body: finalBody, category,
        consent_ok: consentOk, suppressed, clicksend_message_id: null, status: 'failed',
        error: `ClickSend error: ${data.response_code}`,
      })
      return { ok: false, error: `ClickSend error: ${data.response_code}` }
    }

    const msg = data.data?.messages?.[0]
    await logSend({
      business_id: businessId, to_number: phone, body: finalBody, category,
      consent_ok: consentOk, suppressed, clicksend_message_id: msg?.message_id ?? null, status: 'sent', error: null,
    })
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
