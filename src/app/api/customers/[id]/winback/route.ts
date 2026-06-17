export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { sendEmail } from '@/lib/external-apis'
import { sendSMS } from '@/lib/clicksend'

const MODEL = 'claude-haiku-4-5-20251001'
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('id, business_id, name, phone, email, visit_count, total_spent, total_spend, last_visit, customer_segment')
    .eq('id', params.id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  let message = String(body.message ?? '').trim()

  // Generate AI message if not provided
  if (!message) {
    const daysSince = customer.last_visit
      ? Math.floor((Date.now() - new Date(customer.last_visit).getTime()) / 86400000)
      : null
    const spend = Number(customer.total_spent ?? customer.total_spend ?? 0)
    const context = customer.name + ' last visited ' + (daysSince != null ? daysSince + ' days ago' : 'unknown') +
      ', spent $' + spend.toFixed(0) + ' total, ' + (customer.visit_count ?? 0) + ' visits. ' +
      'Business: ' + biz.name + ' (' + (biz.industry ?? 'retail') + ').'

    const res = await trackAICall(
      { route: 'customers/[id]/winback', model: MODEL, businessId: customer.business_id, purpose: 'winback' },
      () => anthropic.messages.create({
        model: MODEL, max_tokens: 160, temperature: 0.7,
        system: 'Write a friendly, personalised winback message under 160 chars. Include the customer name and a specific offer. No preamble.',
        messages: [{ role: 'user', content: context }],
      })
    )
    message = res.content.filter((b: { type: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim()
  }

  if (!message) return NextResponse.json({ error: 'Could not generate message' }, { status: 500 })

  let smsSent = false, emailSent = false, channel = 'queued'

  // Try SMS first if phone exists (ClickSend — the app's SMS channel)
  if (customer.phone) {
    const r = await sendSMS(customer.phone, message, { category: 'marketing', businessId: customer.business_id, customerId: params.id })
    smsSent = r.ok
    channel = r.ok ? 'sms' : 'sms_failed'
    await supabaseAdmin.from('campaigns').insert({
      business_id: customer.business_id, customer_id: params.id,
      type: 'winback', message, sms_sent: r.ok,
      twilio_sid: r.message_id ?? null, error: r.error ?? null,
      status: r.ok ? 'sent' : 'failed',
      sent_at: r.ok ? new Date().toISOString() : null,
      failed_at: !r.ok ? new Date().toISOString() : null,
    }).then(() => null, () => null)
  }

  // Email fallback if no SMS or no phone
  if (!smsSent && customer.email) {
    emailSent = await sendEmail({
      to: customer.email,
      subject: 'We miss you, ' + customer.name + '!',
      html: '<p>' + message + '</p>',
      from_name: biz.name,
    }, { category: 'marketing', businessId: customer.business_id, customerId: params.id })
    channel = emailSent ? 'email' : 'email_failed'
  }

  // Queue if nothing sent (no phone + no email, or both channels failed)
  if (!smsSent && !emailSent) {
    await supabaseAdmin.from('campaigns').insert({
      business_id: customer.business_id, customer_id: params.id,
      type: 'winback', message, status: 'pending_twilio', sms_sent: false,
    }).then(() => null, () => null)
    channel = 'queued'
  }

  // Log to aria_autopilot_actions
  await supabaseAdmin.from('aria_autopilot_actions').insert({
    business_id: customer.business_id,
    category: 'winback',
    priority: 'routine',
    title: 'Winback: ' + customer.name,
    description: message,
    action_data: { customer_id: params.id, channel, sms_sent: smsSent, email_sent: emailSent },
    estimated_impact: 'Re-engage ' + customer.name,
    status: (smsSent || emailSent) ? 'executed' : 'pending',
  }).then(() => null, () => null)

  return NextResponse.json({ ok: smsSent || emailSent, message, sms_sent: smsSent, email_sent: emailSent, channel })
}

export const POST = withErrorCapture('customers/[id]/winback', _POST)
