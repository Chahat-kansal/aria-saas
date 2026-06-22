import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalisePhone } from '@/lib/clicksend'

// LOY-WHATSAPP — the single WhatsApp chokepoint, mirroring the ClickSend SMS guardrails (consent,
// suppression, audit log). The actual send is GATED behind a provider env flag — when no provider is
// configured nothing is sent externally (and absolutely no Twilio). Opt-out reuses sms_suppression.

export type WaCategory = 'marketing' | 'transactional'
export interface SendWaOptions { category?: WaCategory; businessId?: string | null; customerId?: string | null; template?: string }
export interface WaResult { ok: boolean; status: 'sent' | 'skipped' | 'failed'; error?: string }

/** A WhatsApp provider is configured (e.g. ClickSend WhatsApp). No provider → no external send. */
export function whatsappConfigured(): boolean {
  const provider = process.env.WHATSAPP_PROVIDER
  if (provider === 'clicksend') return !!(process.env.CLICKSEND_USERNAME && process.env.CLICKSEND_API_KEY && process.env.CLICKSEND_WHATSAPP_FROM)
  return false
}

async function logWa(row: { business_id: string | null; customer_id: string | null; to_number: string; template: string; status: WaResult['status']; error: string | null }): Promise<void> {
  try { await supabaseAdmin.from('loyalty_whatsapp_log').insert(row) } catch (e) { console.error('[whatsapp] log insert failed:', (e as Error).message) }
}

async function providerSend(to: string, body: string): Promise<WaResult> {
  // Only ClickSend WhatsApp is wired today (no Twilio). Requires a registered WhatsApp number/template.
  if (process.env.WHATSAPP_PROVIDER !== 'clicksend') return { ok: false, status: 'skipped', error: 'provider_not_configured' }
  const auth = Buffer.from(`${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`).toString('base64')
  try {
    const res = await fetch('https://rest.clicksend.com/v3/whatsapp/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ messages: [{ from: process.env.CLICKSEND_WHATSAPP_FROM, to: normalisePhone(to), body }] }),
    })
    const data = await res.json().catch(() => ({})) as { response_code?: string }
    if (!res.ok || data.response_code !== 'SUCCESS') return { ok: false, status: 'failed', error: `clicksend_wa_${data.response_code ?? res.status}` }
    return { ok: true, status: 'sent' }
  } catch (e) { return { ok: false, status: 'failed', error: (e as Error).message } }
}

/**
 * Send a WhatsApp message. Marketing sends honour the suppression list + the per-member whatsapp_consent.
 * If no provider is configured the attempt is recorded as 'skipped' (no external call). Every attempt is
 * logged for audit.
 */
export async function sendWhatsApp(to: string, body: string, opts: SendWaOptions = {}): Promise<WaResult> {
  const category = opts.category ?? 'transactional'
  const businessId = opts.businessId ?? null
  const phone = normalisePhone(to)
  const template = opts.template ?? 'message'

  if (category === 'marketing') {
    // Opt-out (reuse sms_suppression by phone) + per-member WhatsApp consent.
    let supQuery = supabaseAdmin.from('sms_suppression').select('id').eq('phone', phone)
    supQuery = businessId ? supQuery.eq('business_id', businessId) : supQuery.is('business_id', null)
    const { data: sup } = await supQuery.limit(1).maybeSingle()
    if (sup) { await logWa({ business_id: businessId, customer_id: opts.customerId ?? null, to_number: phone, template, status: 'skipped', error: 'suppressed' }); return { ok: false, status: 'skipped', error: 'suppressed' } }

    if (opts.customerId && businessId) {
      const { data: c } = await supabaseAdmin.from('pos_customers').select('whatsapp_consent').eq('id', opts.customerId).eq('business_id', businessId).maybeSingle()
      if (c && !c.whatsapp_consent) { await logWa({ business_id: businessId, customer_id: opts.customerId, to_number: phone, template, status: 'skipped', error: 'no_consent' }); return { ok: false, status: 'skipped', error: 'no_consent' } }
    }
  }

  if (!whatsappConfigured()) {
    await logWa({ business_id: businessId, customer_id: opts.customerId ?? null, to_number: phone, template, status: 'skipped', error: 'provider_not_configured' })
    return { ok: false, status: 'skipped', error: 'provider_not_configured' }
  }

  const r = await providerSend(phone, body)
  await logWa({ business_id: businessId, customer_id: opts.customerId ?? null, to_number: phone, template, status: r.status, error: r.error ?? null })
  return r
}

// ── Templates for the existing loyalty messages (reused by lifecycle / offers) ──
export const waTemplates = {
  enrol: (name: string, biz: string) => `Hi ${name}! 🎉 You're now signed up to ${biz} rewards on WhatsApp. Reply BALANCE anytime to check your points. Reply STOP to opt out.`,
  balance: (name: string, points: number, dollars: number, preload: number | null) =>
    `Hi ${name}, you have ${points} points (worth $${dollars.toFixed(2)})${preload != null ? ` and a $${preload.toFixed(2)} preload balance` : ''}. See you soon! ☕`,
  birthday: (name: string, reward: string | null, points: number) => `Happy Birthday, ${name}! 🎂 ${points > 0 ? `We've added ${points} bonus points. ` : ''}${reward ?? ''} Reply STOP to opt out.`,
  winback: (name: string, reward: string | null, points: number) => `Hey ${name}, we miss you! ☕ ${points > 0 ? `Here's ${points} bonus points to welcome you back. ` : ''}${reward ?? ''} Reply STOP to opt out.`,
  offer: (name: string, offer: string) => `Hi ${name} — a treat from us: ${offer} Reply STOP to opt out.`,
}
