import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/clicksend'

export interface ReadyOrderSnap {
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  order_number: string | null
  customer_id: string | null
}

/** Valid phone: only digit-safe chars, 7–15 digit chars (covers AU local + E.164 international). */
function isValidPhone(p: string | null | undefined): boolean {
  if (!p) return false
  const t = p.trim()
  // Reject strings containing letters or any char not found in a real phone number
  if (!/^[0-9\s+\-().]+$/.test(t)) return false
  return t.replace(/\D/g, '').length >= 7
}

/** Minimal email sanity — catches obvious junk without pulling in a full RFC 5321 parser. */
function isValidEmail(e: string | null | undefined): boolean {
  if (!e) return false
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e.trim())
}

/**
 * Send the "your order is ready" notification for a single online order.
 * Strategy: valid phone → SMS (ClickSend transactional).
 *   SMS ok or consent-gated → done.
 *   SMS fails for a recoverable reason → fall through to email.
 * Valid email (and no successful SMS) → email via Resend.
 * Invalid phone/email → log to activity_log and skip gracefully — never throws.
 *
 * Called from BOTH paths that transition an order to 'ready':
 *   - api/pos/kds/[id]            (KDS bump)
 *   - api/pos/online-orders/[id]  (owner-queue button)
 *
 * Idempotency is the CALLER's responsibility: both callers guard on prevStatus !== 'ready'
 * before invoking this function, so duplicate sends from sequential double-clicks are blocked.
 */
export async function notifyReady(
  orderId: string,
  snap: ReadyOrderSnap,
  businessId: string,
  context: string,
): Promise<void> {
  try {
    // CX in-app feed — always fires when customer is known; not gated on phone/email
    if (snap.customer_id) {
      await supabaseAdmin.from('cx_notifications').insert({
        business_id: businessId,
        customer_id: snap.customer_id,
        type: 'order',
        title: 'Ready for pickup',
        body: 'Your order ' + (snap.order_number ?? '') + ' is ready! Come collect it.',
        action_url: null,
      })
    }

    const phone = snap.customer_phone
    const email = snap.customer_email
    const phoneOk = isValidPhone(phone)
    const emailOk = isValidEmail(email)

    if (!phoneOk && !emailOk) {
      // Log junk contact data — silent skip for legitimately absent contact info
      if (phone || email) {
        void supabaseAdmin.from('activity_log').insert({
          business_id: businessId,
          action_type: 'order_notify_skip',
          description: context + ' notifyReady skipped — invalid contact: phone=' + (phone ?? 'none') + ' email=' + (email ?? 'none'),
          metadata: { order_id: orderId, phone, email },
          created_at: new Date().toISOString(),
        })
      }
      return
    }

    const { data: biz } = await supabaseAdmin
      .from('businesses').select('name, slug').eq('id', businessId).maybeSingle()
    const bizName = (biz?.name as string | null) ?? 'the café'
    const bizSlug = (biz?.slug as string | null) ?? ''
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
    const trackingUrl = appUrl + '/menu/' + bizSlug + '/order/' + (snap.order_number ?? '')
    const firstName = (snap.customer_name ?? '').split(' ')[0] || 'there'
    const orderNum = snap.order_number ?? ''

    const smsBody = 'Hi ' + firstName + ', your order ' + orderNum + ' at ' + bizName + ' is ready for collection! Track: ' + trackingUrl
    const emailSubject = 'Your order ' + orderNum + ' is ready! 🎉'
    const emailHtml = '<p>Hi ' + firstName + ',</p><p>Your order <strong>' + orderNum + '</strong> at <strong>' + bizName + '</strong> is ready for collection!</p><p><a href="' + trackingUrl + '">Track your order &rarr;</a></p>'

    if (phoneOk) {
      const smsResult = await sendSMS(phone!, smsBody, {
        category: 'transactional',
        businessId,
        customerId: snap.customer_id ?? undefined,
      })
      // Sent ok, or correctly gated for consent/opt-out reasons — no email needed
      if (smsResult.ok || smsResult.error === 'no_consent' || smsResult.error === 'suppressed') return
      // SMS failed (e.g. ClickSend API error) — fall through to email if available
    }

    if (emailOk) {
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Aria <orders@ariaos.site>',
            to: [email!],
            subject: emailSubject,
            html: emailHtml,
          }),
        }).catch(() => null)
      }
    }
  } catch (e) {
    void supabaseAdmin.from('activity_log').insert({
      business_id: businessId,
      action_type: 'order_notify_error',
      description: context + ' notifyReady error: ' + String(e),
      metadata: { order_id: orderId, error: String(e) },
      created_at: new Date().toISOString(),
    })
  }
}