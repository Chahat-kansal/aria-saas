export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Message { role: 'user' | 'assistant'; content: string }

// ── Send SMS via Twilio ───────────────────────────────────────────────
async function sendSMS(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from || !to) return
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    })
  } catch { /* non-critical */ }
}

// ── Parse appointment details from AI response ────────────────────────
function parseAppointmentJSON(text: string): Record<string, string> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"booking_confirmed"[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[1] ?? match[0]) } catch { return null }
}

export async function POST(req: Request) {
  try {
    // ── Validate api_key ──────────────────────────────────────────────
    const { api_key, message, conversation_id, visitor_id, messages: history = [] } = await req.json() as {
      api_key: string
      message: string
      conversation_id?: string
      visitor_id?: string
      messages?: Message[]
    }

    if (!api_key || !message) {
      return NextResponse.json({ error: 'api_key and message required' }, { status: 400 })
    }

    // ── Load widget config by api_key ─────────────────────────────────
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('widget_configs')
      .select('*')
      .eq('api_key', api_key)
      .eq('enabled', true)
      .maybeSingle()

    if (cfgErr || !config) {
      return NextResponse.json({ error: 'Invalid or disabled widget' }, { status: 403 })
    }

    const businessId = config.business_id as string

    // ── Load business details ─────────────────────────────────────────
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name, industry, city, phone, email')
      .eq('id', businessId)
      .maybeSingle()

    // ── Load top products for context (if show_prices) ────────────────
    let productContext = ''
    if (config.show_prices) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('name, price, stock_quantity, is_active')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name')
        .limit(40)
      if (products?.length) {
        productContext = products.map(p => {
          const stock = config.stock_visibility === 'in_out'
            ? (p.stock_quantity > 0 ? ' (in stock)' : ' (out of stock)')
            : ''
          return p.name + ' — A$' + (Number(p.price) || 0).toFixed(2) + stock
        }).join('\n')
      }
    }

    // ── Build system prompt ───────────────────────────────────────────
    const now = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })
    const apptEnabled = config.appointments_enabled === true

    const systemPrompt = [
      `You are ${config.bot_name ?? 'Aria'}, the AI assistant for ${biz?.name ?? 'this business'} — an Australian ${biz?.industry ?? 'retail'} business${biz?.city ? ' in ' + biz.city : ''}.`,
      `Current time: ${now}.`,
      `Tone: ${config.tone ?? 'friendly'}. Answer length: ${config.answer_length ?? 'normal'}.`,
      config.assistant_role === 'sales'
        ? 'Your goal is to help visitors with questions, guide them to products, and encourage them to visit or book.'
        : 'Your goal is to answer questions accurately and helpfully.',
      '',
      config.opening_hours && Object.keys(config.opening_hours).length > 0
        ? 'Opening hours:
' + Object.entries(config.opening_hours).map(([d, h]) => d + ': ' + h).join('
')
        : '',
      config.services ? 'Services offered:
' + config.services : '',
      productContext ? 'Products available:
' + productContext : '',
      config.faqs?.length > 0
        ? 'FAQs:
' + config.faqs.map((f: {q:string;a:string}) => 'Q: ' + f.q + '
A: ' + f.a).join('
')
        : '',
      config.delivery_policy ? 'Delivery policy: ' + config.delivery_policy : '',
      config.returns_policy ? 'Returns policy: ' + config.returns_policy : '',
      config.age_restricted_policy ? 'Age restrictions: ' + config.age_restricted_policy : '',
      config.custom_rules ? 'Important rules:
' + config.custom_rules : '',
      config.guardrails ? 'Restrictions: ' + config.guardrails : '',
      '',
      apptEnabled
        ? `APPOINTMENT BOOKING: You CAN book appointments for this business. When a visitor wants to book, collect:
1. Their name
2. Their preferred date (within the next ${config.appointment_lead_days ?? 14} days)
3. Their preferred time
4. Service they want (if applicable): ${config.appointment_services ?? 'any service'}
5. Their phone number or email for confirmation

When you have ALL required details, confirm the booking and respond with ONLY this JSON block at the end of your message:
\`\`\`json
{"booking_confirmed": true, "visitor_name": "NAME", "booking_date": "YYYY-MM-DD", "booking_time": "HH:MM", "service": "SERVICE", "visitor_phone": "PHONE", "visitor_email": "EMAIL"}
\`\`\`
Do NOT include the JSON block unless you have all details confirmed.`
        : 'You cannot book appointments — direct visitors to call or email.',
      '',
      config.show_talk_to_staff && (config.escalation_phone || config.escalation_email)
        ? `If the visitor needs human help: "${config.escalation_message ?? 'Please contact us directly.'}". ${config.escalation_phone ? 'Phone: ' + config.escalation_phone : ''} ${config.escalation_email ? 'Email: ' + config.escalation_email : ''}`
        : '',
    ].filter(Boolean).join('
')

    // ── Build message history for Claude ──────────────────────────────
    const msgs: Message[] = [
      ...history.slice(-10), // last 10 messages for context
      { role: 'user', content: message },
    ]

    // ── Call Claude ───────────────────────────────────────────────────
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: msgs,
    })

    const replyText = response.content[0].type === 'text' ? response.content[0].text : ''

    // ── Detect and process appointment booking ────────────────────────
    let bookingId: string | null = null
    let convId = conversation_id ?? null
    const apptData = apptEnabled ? parseAppointmentJSON(replyText) : null

    if (apptData?.booking_confirmed) {
      // Create booking record
      const { data: booking } = await supabaseAdmin.from('bookings').insert({
        business_id: businessId,
        visitor_name: apptData.visitor_name,
        visitor_phone: apptData.visitor_phone || null,
        visitor_email: apptData.visitor_email || null,
        booking_date: apptData.booking_date,
        booking_time: apptData.booking_time,
        service: apptData.service || null,
        status: 'confirmed',
        source: 'widget',
        notes: 'Booked via website chat widget',
      }).select('id').single()

      bookingId = booking?.id ?? null

      // Send SMS notification to owner
      const ownerPhone = config.notification_phone || biz?.phone
      if (ownerPhone) {
        const smsBody = [
          '📅 New booking via website chat!',
          'Business: ' + (biz?.name ?? ''),
          'Customer: ' + apptData.visitor_name,
          'Date: ' + apptData.booking_date,
          'Time: ' + apptData.booking_time,
          apptData.service ? 'Service: ' + apptData.service : '',
          apptData.visitor_phone ? 'Phone: ' + apptData.visitor_phone : '',
          apptData.visitor_email ? 'Email: ' + apptData.visitor_email : '',
          'View at ariaos.site/dashboard/bookings',
        ].filter(Boolean).join('
')
        await sendSMS(ownerPhone, smsBody)
      }

      // Also notify via email if configured (write to aria_autopilot_actions)
      await supabaseAdmin.from('aria_autopilot_actions').insert({
        business_id: businessId,
        category: 'booking',
        priority: 'high',
        title: 'New website booking: ' + apptData.visitor_name,
        description: apptData.booking_date + ' at ' + apptData.booking_time + (apptData.service ? ' — ' + apptData.service : ''),
        suggested_action: 'Confirm appointment with customer',
        status: 'pending',
      }).catch(() => {})
    }

    // ── Save / update conversation ────────────────────────────────────
    const updatedMessages = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: replyText },
    ]

    if (convId) {
      await supabaseAdmin.from('widget_conversations').update({
        messages: updatedMessages,
        updated_at: new Date().toISOString(),
        ...(bookingId ? { booking_id: bookingId } : {}),
        ...(apptData?.visitor_name ? { visitor_name: apptData.visitor_name } : {}),
        ...(apptData?.visitor_phone ? { visitor_phone: apptData.visitor_phone } : {}),
        ...(apptData?.visitor_email ? { visitor_email: apptData.visitor_email } : {}),
      }).eq('id', convId)
    } else {
      const { data: newConv } = await supabaseAdmin.from('widget_conversations').insert({
        business_id: businessId,
        visitor_id: visitor_id ?? 'anonymous',
        messages: updatedMessages,
        ...(bookingId ? { booking_id: bookingId } : {}),
      }).select('id').single()
      convId = newConv?.id ?? null
    }

    // ── Strip JSON block from visible reply ───────────────────────────
    const visibleReply = replyText.replace(/```json[\s\S]*?```/g, '').trim()

    return NextResponse.json({
      reply: visibleReply,
      conversation_id: convId,
      booking_created: !!bookingId,
      booking_id: bookingId,
    })

  } catch (err) {
    console.error('Widget chat error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
