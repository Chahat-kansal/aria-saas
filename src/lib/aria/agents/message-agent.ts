import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

export type MessageDraft = {
  customer_id: string
  customer_name: string
  channel: 'sms' | 'email'
  subject?: string
  body: string
  tone: 'warm' | 'urgent' | 'promotional'
  risk_level: 'low' | 'medium' | 'high'
  reason: string
}

export type MessageAgentResult = {
  drafts: MessageDraft[]
  action_id: string
  needs_approval: boolean
}

type CustomerRow = { id: string; name: string | null; phone: string | null; email: string | null; last_visit: string | null; total_spent: number | null }
type BizRow = { name: string; industry: string; city: string | null }

async function draftMessage(
  client: Anthropic,
  customer: CustomerRow,
  business: BizRow,
  intent: string,
  channel: 'sms' | 'email',
): Promise<string> {
  const daysSince = customer.last_visit
    ? Math.floor((Date.now() - new Date(customer.last_visit).getTime()) / 86400000)
    : null
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    temperature: 0.7,
    system: `You are writing on behalf of a business owner. Sound like a human business owner, not an AI. Maximum 2 sentences for SMS, 4 paragraphs for email. Never mention Aria or AI. Never use placeholder text.`,
    messages: [{
      role: 'user',
      content: `Write a ${channel} message for: ${customer.name ?? 'Customer'}, last visited ${daysSince != null ? daysSince + ' days ago' : 'unknown'}, total spend $${(((Number(customer.total_spent) || 0)) / 100).toFixed(2)}. Business: ${business.name} (${business.industry}, ${business.city ?? 'AU'}). Intent: ${intent}.`,
    }],
  })
  return res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim()
}

async function sendSms(phone: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return false
  const normalized = phone.replace(/\s/g, '').replace(/^0/, '+61')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: normalized, From: from, Body: body }).toString(),
  })
  return res.ok
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Aria <aria@ariaos.site>', to, subject, html: body }),
  })
  return res.ok
}

export async function messageAgent(
  intent: string,
  businessId: string,
  customerIds?: string[],
): Promise<MessageAgentResult> {
  try {
    const { data: biz } = await supabaseAdmin.from('businesses')
      .select('name, industry, city').eq('id', businessId).single()
    const business: BizRow = { name: biz?.name ?? 'this business', industry: biz?.industry ?? 'retail', city: biz?.city ?? 'Melbourne' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let customerQuery: any = supabaseAdmin.from('customers')
      .select('id, name, phone, email, last_visit, total_spent')
      .eq('business_id', businessId)

    if (customerIds && customerIds.length > 0) {
      customerQuery = customerQuery.in('id', customerIds)
    } else {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      customerQuery = customerQuery.lt('last_visit', thirtyDaysAgo)
    }
    const { data: customers } = await customerQuery.limit(20) as { data: CustomerRow[] | null }

    if (!customers || customers.length === 0) {
      const { data: row } = await supabaseAdmin.from('aria_agent_actions').insert({
        business_id: businessId, agent_name: 'message_agent', action_type: 'draft_message',
        action_input: { intent, customer_count: 0 }, action_output: { drafts: [] },
        risk_level: 'low', approved: true, executed: true, executed_at: new Date().toISOString(),
      }).select('id').single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { drafts: [], action_id: (row as any)?.id ?? '', needs_approval: false }
    }

    const channel: 'sms' | 'email' = /email/i.test(intent) ? 'email' : 'sms'
    const tone: 'warm' | 'urgent' | 'promotional' = /urgent|overdue/i.test(intent) ? 'urgent' : /promo|discount|offer/i.test(intent) ? 'promotional' : 'warm'
    const count = customers.length
    const riskLevel: 'low' | 'medium' | 'high' = count > 15 ? 'high' : count >= 5 ? 'medium' : 'low'

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
    const drafts: MessageDraft[] = []

    for (const c of customers) {
      const body = await draftMessage(client, c, business, intent, channel)
        .catch(() => `Hi ${c.name ?? 'there'}, we miss you! Come back and see us soon.`)
      drafts.push({
        customer_id: c.id,
        customer_name: c.name ?? 'Customer',
        channel,
        subject: channel === 'email' ? `We miss you, ${c.name ?? 'there'}` : undefined,
        body,
        tone,
        risk_level: riskLevel,
        reason: intent,
      })
    }

    const { data: actionRow } = await supabaseAdmin.from('aria_agent_actions').insert({
      business_id: businessId, agent_name: 'message_agent', action_type: 'draft_message',
      action_input: { intent, customer_count: customers.length },
      action_output: { drafts },
      risk_level: riskLevel,
      approved: riskLevel === 'low' ? true : null,
      executed: false,
    }).select('id').single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionId = (actionRow as any)?.id ?? ''
    const needsApproval = riskLevel !== 'low'

    if (!needsApproval) {
      let sent = 0
      for (const d of drafts) {
        const c = customers.find(x => x.id === d.customer_id)
        if (!c) continue
        let ok = false
        if (channel === 'sms' && c.phone) ok = await sendSms(c.phone, d.body)
        else if (channel === 'email' && c.email) ok = await sendEmail(c.email, d.subject ?? 'Hello', d.body)
        if (ok) sent++
      }
      void sent
      await supabaseAdmin.from('aria_agent_actions').update({ executed: true, executed_at: new Date().toISOString() }).eq('id', actionId)
    }

    return { drafts, action_id: actionId, needs_approval: needsApproval }
  } catch (e) {
    console.error('[message-agent] failed:', (e as Error).message)
    let errActionId = ''
    try {
      const { data: row } = await supabaseAdmin.from('aria_agent_actions').insert({
        business_id: businessId, agent_name: 'message_agent', action_type: 'draft_message',
        action_input: { intent, customer_count: 0 }, action_output: { error: (e as Error).message },
        risk_level: 'low', approved: false, executed: false, error_detail: (e as Error).message,
      }).select('id').single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      errActionId = (row as any)?.id ?? ''
    } catch { /* non-fatal */ }
    return { drafts: [], action_id: errActionId, needs_approval: false }
  }
}
