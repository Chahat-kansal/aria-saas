export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { limit } from '@/lib/rate-limit'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Message { role: 'user' | 'assistant'; content: string }

// ── Parse appointment details from AI response ─────────────────────────────
function parseAppointmentJSON(text: string): Record<string, string> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"booking_confirmed"[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[1] ?? match[0]) } catch { return null }
}

export async function POST(req: Request) {
  try {
    // ── Validate chat_token (replaces api_key — which is burned) ──────────
    const { chat_token, message, conversation_id, visitor_id, messages: history = [] } = await req.json() as {
      chat_token: string
      message: string
      conversation_id?: string
      visitor_id?: string
      messages?: Message[]
    }

    if (!chat_token || !message) {
      return NextResponse.json({ error: 'chat_token and message required' }, { status: 400 })
    }

    // ── Load widget config by chat_token ──────────────────────────────────
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('widget_configs')
      .select('*')
      .eq('chat_token', chat_token)
      .eq('enabled', true)
      .maybeSingle()

    if (cfgErr || !config) {
      return NextResponse.json({ error: 'Invalid or disabled widget' }, { status: 403 })
    }

    // ── Origin / Referer allowlist check ──────────────────────────────────
    // If allowed_domain is configured, the request must come from that domain.
    // This is enforced by browsers for XHR/fetch — server-to-server callers without
    // a matching origin header are rejected when allowed_domain is set.
    const allowedDomain = config.allowed_domain as string | null
    if (allowedDomain) {
      const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? ''
      if (!origin.includes(allowedDomain)) {
        return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
      }
    }

    const businessId = config.business_id as string

    // ── Per-session + per-business-day rate limits (Upstash, fail-closed in prod) ─
    const sessionKey = (visitor_id ?? 'anon') + ':' + businessId
    const [sessionRl, bizRl] = await Promise.all([
      limit('widget:session:' + sessionKey, { requests: 10, window: '1 m' }),
      limit('widget:business:' + businessId, { requests: 100, window: '1 d' }),
    ])
    if (!sessionRl.ok) {
      return NextResponse.json({
        reply: "You've sent a lot of messages! Please wait a moment before sending more.",
        conversation_id: conversation_id ?? null,
        booking_created: false,
        booking_id: null,
      })
    }
    if (!bizRl.ok) {
      return NextResponse.json({
        reply: 'Our chat assistant is resting for today. Please visit us in-store or give us a call directly.',
        conversation_id: conversation_id ?? null,
        booking_created: false,
        booking_id: null,
      })
    }

    // ── Load business details ─────────────────────────────────────────────
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name, industry, city, phone, email, google_average_rating, google_total_reviews')
      .eq('id', businessId)
      .maybeSingle()

    // ── Load products with real stock status ──────────────────────────────
    let productContext = ''
    const { data: products } = await supabaseAdmin
      .from('pos_products')
      .select('name, price, stock_quantity, is_active, description')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name')
      .limit(40)
    if (products?.length) {
      productContext = products.map((p: { name: string; price: number | null; stock_quantity: number | null; description?: string | null }) => {
        const qty = Number(p.stock_quantity ?? 0)
        const stockNote = qty === 0 ? ' (currently unavailable)' : qty <= 5 ? ' (low stock)' : ' (in stock)'
        const priceBit = config.show_prices ? ' — A$' + (Number(p.price) || 0).toFixed(2) : ''
        const descBit = p.description ? ' — ' + String(p.description).slice(0, 80) : ''
        return p.name + priceBit + descBit + stockNote
      }).join('\n')
    }

    // ── Top 3 best-sellers (last 30 days) ────────────────────────────────
    let topSellersContext = ''
    try {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString()
      const { data: items } = await supabaseAdmin.from('pos_sale_items')
        .select('product_name, quantity, pos_sales!inner(business_id, created_at, status)')
        .eq('pos_sales.business_id', businessId)
        .neq('pos_sales.status', 'voided')
        .gte('pos_sales.created_at', since).limit(2000)
      const counts: Record<string, number> = {}
      for (const r of (items ?? []) as Array<{ product_name: string | null; quantity: number | null }>) {
        if (!r.product_name) continue
        counts[r.product_name] = (counts[r.product_name] ?? 0) + Number(r.quantity ?? 0)
      }
      const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n)
      if (top3.length > 0) topSellersContext = 'Top sellers: ' + top3.join(', ')
    } catch (e) { console.error('[non-fatal]', e) }

    // ── Membership mention — no identity lookup (WIDGET-PII-LEAK-FIX / AG-W0) ─────
    // This used to query pos_customers directly by whatever email/phone the visitor typed and
    // hand the result (name, points, tier) back in the chat context — a fully public, unverified
    // caller could enumerate any customer of this business with no ownership proof at all. A public
    // widget has no session concept to check ownership against, so the lookup is removed entirely
    // rather than gated — the model is told to defer to the verified loyalty flow instead.
    let memberContext = ''
    if (config.recognise_members !== false) {
      const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
      const phoneMatch = message.match(/(?:\+?61|0)\d{8,9}|\d{10}/)
      if (emailMatch || phoneMatch) {
        memberContext = 'The visitor shared a contact detail asking about loyalty membership. You cannot look up or share any points, tier, balance, or "member found" status in this chat — invite them to check their balance by signing in to their loyalty account, or ask a staff member if they are in-store. Never guess or invent a membership status.'
      }
    }

    // ── Build system prompt ───────────────────────────────────────────────
    const now = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })
    const apptEnabled = config.appointments_enabled === true

    const systemPrompt = [
      'You are ' + (config.bot_name ?? 'Aria') + ', the AI assistant for ' + (biz?.name ?? 'this business') + ' — an Australian ' + (biz?.industry ?? 'retail') + ' business' + (biz?.city ? ' in ' + biz.city : '') + '.',
      'Current time: ' + now + '.',
      'Tone: ' + (config.tone ?? 'friendly') + '. Answer length: ' + (config.answer_length ?? 'normal') + '.',
      config.assistant_role === 'sales'
        ? 'Your goal is to help visitors with questions, guide them to products, and encourage them to visit or book.'
        : 'Your goal is to answer questions accurately and helpfully.',
      '',
      config.opening_hours && Object.keys(config.opening_hours).length > 0
        ? 'Opening hours:\n' + Object.entries(config.opening_hours).map(([d, h]) => d + ': ' + h).join('\n')
        : '',
      config.services ? 'Services offered:\n' + config.services : '',
      biz?.phone ? 'Phone: ' + biz.phone : '',
      biz?.email ? 'Email: ' + biz.email : '',
      biz?.google_average_rating ? 'Google rating: ' + biz.google_average_rating + '★ (' + (biz.google_total_reviews ?? 0) + ' reviews)' : '',
      productContext ? 'Products available (with real-time stock):\n' + productContext : '',
      productContext ? 'If a visitor asks about an unavailable product, tell them it is currently out of stock and offer to notify them or suggest an alternative.' : '',
      topSellersContext,
      memberContext,
      'PRIVACY: Never invent loyalty points, tiers, or benefits. Only state membership data when MEMBER LOOKUP is provided above. Never reveal data about other customers.',
      config.faqs?.length > 0
        ? 'FAQs:\n' + (config.faqs as Array<{q:string;a:string}>).map(f => 'Q: ' + f.q + '\nA: ' + f.a).join('\n')
        : '',
      config.delivery_policy ? 'Delivery policy: ' + config.delivery_policy : '',
      config.returns_policy ? 'Returns policy: ' + config.returns_policy : '',
      config.age_restricted_policy ? 'Age restrictions: ' + config.age_restricted_policy : '',
      config.custom_rules ? 'Important rules:\n' + config.custom_rules : '',
      config.guardrails ? 'Restrictions: ' + config.guardrails : '',
      '',
      apptEnabled
        ? ('APPOINTMENT BOOKING: You CAN book appointments for this business. When a visitor wants to book, collect:\n' +
          '1. Their name\n' +
          '2. Their preferred date (within the next ' + (config.appointment_lead_days ?? 14) + ' days)\n' +
          '3. Their preferred time\n' +
          '4. Service they want (if applicable): ' + (config.appointment_services ?? 'any service') + '\n' +
          '5. Their phone number or email for confirmation\n\n' +
          'If a previous turn said a slot was already taken, suggest 2-3 alternative times rather than re-proposing the same slot.\n' +
          'When you have ALL required details, confirm the booking and respond with ONLY this JSON block at the end of your message:\n' +
          '```json\n' +
          '{"booking_confirmed": true, "visitor_name": "NAME", "booking_date": "YYYY-MM-DD", "booking_time": "HH:MM", "service": "SERVICE", "visitor_phone": "PHONE", "visitor_email": "EMAIL"}\n' +
          '```\n' +
          'Do NOT include the JSON block unless you have all details confirmed.')
        : 'You cannot book appointments — direct visitors to call or email.',
      '',
      config.show_talk_to_staff && (config.escalation_phone || config.escalation_email)
        ? ('If the visitor needs human help: "' + (config.escalation_message ?? 'Please contact us directly.') + '". ' +
          (config.escalation_phone ? 'Phone: ' + config.escalation_phone : '') + ' ' +
          (config.escalation_email ? 'Email: ' + config.escalation_email : ''))
        : '',
    ].filter(Boolean).join('\n')

    // ── Build message history for Claude ──────────────────────────────────
    const msgs: Message[] = [
      ...history.slice(-10),
      { role: 'user', content: message },
    ]

    // ── Call Claude (max_tokens capped at 350) ────────────────────────────
    const t0 = Date.now()
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: systemPrompt,
      messages: msgs,
    })
    const latencyMs = Date.now() - t0

    const replyText = response.content[0].type === 'text' ? response.content[0].text : ''

    // ── Log usage to aria_ai_calls (non-fatal) ────────────────────────────
    void supabaseAdmin.from('aria_ai_calls').insert({
      agent_key: 'widget-chat',
      provider: 'anthropic',
      business_id: businessId,
      role: 'chat',
      model_id: 'claude-haiku-4-5-20251001',
      model_provider: 'anthropic',
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      latency_ms: latencyMs,
      success: true,
      request_summary: message.slice(0, 120),
    }).then(undefined, () => {})

    // ── Detect and process appointment booking ────────────────────────────
    let bookingId: string | null = null
    let convId = conversation_id ?? null
    const apptData = apptEnabled ? parseAppointmentJSON(replyText) : null

    let slotFullMessage = ''
    if (apptData?.booking_confirmed) {
      const maxPerSlot = Number(config.max_bookings_per_slot ?? 1)
      const { data: existing } = await supabaseAdmin
        .from('bookings').select('id')
        .eq('business_id', businessId)
        .eq('booking_date', apptData.booking_date)
        .eq('booking_time', apptData.booking_time)
        .neq('status', 'cancelled')
      const slotFull = (existing?.length ?? 0) >= maxPerSlot

      if (slotFull) {
        slotFullMessage = '\n\nThat time slot (' + apptData.booking_date + ' at ' + apptData.booking_time + ') is already booked — sorry! Please pick another time and I\'ll lock it in for you.'
      } else {
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
          ].filter(Boolean).join('\n')
          await sendSMS(ownerPhone, smsBody)
        }

        await supabaseAdmin.from('aria_autopilot_actions').insert({
          business_id: businessId,
          category: 'booking',
          priority: 'important',
          title: 'New website booking: ' + apptData.visitor_name,
          description: apptData.booking_date + ' at ' + apptData.booking_time + (apptData.service ? ' — ' + apptData.service : ''),
          action_data: { suggested_action: 'Confirm appointment with customer' },
          status: 'pending',
        }).then(undefined, () => {})
      }
    }

    // ── Save / update conversation ─────────────────────────────────────────
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

    // ── Strip JSON block from visible reply ───────────────────────────────
    const visibleReply = replyText.replace(/```json[\s\S]*?```/g, '').trim() + (slotFullMessage || '')

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