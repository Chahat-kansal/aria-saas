import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/clicksend'
import { sendEmail } from '@/lib/external-apis'

// LOY-LIFECYCLE — shared helpers for the birthday + winback daily crons. Idempotency is enforced by
// loyalty_lifecycle_log (unique on customer+kind+period_key): a claim is an INSERT, so exactly one run
// ever proceeds. Points are credited through the EXISTING ledger; messages go via the EXISTING ClickSend
// (SMS) + Resend (email) senders. No AI here — this is pure rules, logged to the lifecycle table.

export type LifecycleKind = 'birthday' | 'winback'

/** Today in Australia/Sydney (AEST/AEDT) — birthdays + lapse windows are evaluated in local time. */
export function aestDateParts(d: Date = new Date()): { mmdd: string; year: string; ymd: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value])) as Record<string, string>
  return { mmdd: `${parts.month}-${parts.day}`, year: parts.year, ymd: `${parts.year}-${parts.month}-${parts.day}` }
}

/**
 * Atomic idempotency claim. Inserts the sent-marker row; if the unique (customer,kind,period_key) index
 * rejects it, this period was already handled → returns null (caller skips). Returns the row id on a
 * fresh claim. The claim happens BEFORE any award/send, so a double cron run can never double-reward.
 */
export async function claimLifecycle(businessId: string, customerId: string, kind: LifecycleKind, periodKey: string, rewardPoints: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('loyalty_lifecycle_log')
    .insert({ business_id: businessId, customer_id: customerId, kind, period_key: periodKey, reward_points: rewardPoints, message_status: null })
    .select('id').maybeSingle()
  if (error) return null // unique violation (already claimed) or insert failure → skip
  return data?.id ?? null
}

/** True if this member was winback'd within the cooldown window (so we don't message them daily). */
export async function winbackOnCooldown(businessId: string, customerId: string, cooldownDays: number): Promise<boolean> {
  const since = new Date(Date.now() - Math.max(1, cooldownDays) * 86400000).toISOString()
  const { count } = await supabaseAdmin.from('loyalty_lifecycle_log')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('customer_id', customerId).eq('kind', 'winback').gte('sent_at', since)
  return (count ?? 0) > 0
}

/** Credit points through the EXISTING ledger and record the lifecycle transaction (type birthday/winback). */
export async function awardLifecyclePoints(customerId: string, businessId: string, points: number, kind: LifecycleKind, rewardText: string | null): Promise<void> {
  if (points > 0) {
    await supabaseAdmin.rpc('increment_loyalty_points', { customer_id: customerId, points })
    await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customerId, p_column: 'points_balance', p_amount: points })
  }
  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id: businessId, customer_id: customerId, sale_id: null, type: kind,
    points_delta: points, stamps_delta: 0, reward_redeemed: rewardText, created_at: new Date().toISOString(),
  })
}

export interface Contactable { id: string; name: string | null; phone: string | null; email: string | null; business_id: string }

/** Deliver via WhatsApp (when opted in + a provider is configured), then SMS, then email; all are
 * marketing-category (consent/suppression handled by each sender). WhatsApp is additive — when it isn't
 * available the message falls back to SMS/email exactly as before. */
export async function deliverLifecycleMessage(c: Contactable, smsBody: string, emailSubject: string, emailHtml: string): Promise<{ channel: string; status: string }> {
  // LOY-WHATSAPP — prefer WhatsApp first; returns 'skipped' (no external send) when unconfigured / not opted in.
  if (c.phone) {
    try {
      const { sendWhatsApp } = await import('@/lib/whatsapp')
      const r = await sendWhatsApp(c.phone, smsBody, { category: 'marketing', businessId: c.business_id, customerId: c.id, template: 'lifecycle' })
      if (r.ok) return { channel: 'whatsapp', status: 'sent' }
    } catch (e) { console.error('[lifecycle] whatsapp failed:', (e as Error).message) }
  }
  if (c.phone) {
    try {
      const r = await sendSMS(c.phone, smsBody, { category: 'marketing', businessId: c.business_id, customerId: c.id })
      if (r.ok) return { channel: 'sms', status: 'sent' }
    } catch (e) { console.error('[lifecycle] sms failed:', (e as Error).message) }
  }
  if (c.email) {
    try {
      const ok = await sendEmail({ to: c.email, subject: emailSubject, html: emailHtml }, { category: 'marketing', businessId: c.business_id, customerId: c.id })
      if (ok) return { channel: 'email', status: 'sent' }
    } catch (e) { console.error('[lifecycle] email failed:', (e as Error).message) }
  }
  return { channel: c.phone || c.email ? (c.phone ? 'sms' : 'email') : 'none', status: c.phone || c.email ? 'failed' : 'no_channel' }
}

/** Finalise the lifecycle log row with the delivery outcome. */
export async function finaliseLifecycle(logId: string, channel: string, status: string): Promise<void> {
  await supabaseAdmin.from('loyalty_lifecycle_log').update({ channel, message_status: status }).eq('id', logId)
}
