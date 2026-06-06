export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Message { role: 'user' | 'assistant'; content: string }

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

    // ── Load business details + Google rating (Fix 4) ────────────────
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name, industry, city, phone, email, google_average_rating, google_total_reviews')
      .eq('id', businessId)
      .maybeSingle()

    // ── Fix 1+2: ALWAYS load products with real stock status ──────────
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

    // ── Fix 4: top 3 best-sellers (last 30 days) ──────────────────────
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

    // ── Fix 5: optional membership lookup from visitor message ────────
    let memberContext = ''
    if (config.recognise_members !== false) {
      const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
      const phoneMatch = message.match(/(?:\+?61|0)\d{8,9}|\d{10}/)
      const lookup = emailMatch?.[0] ?? phoneMatch?.[0] ?? null
      if (lookup) {
        const { data: cust } = await supabaseAdmin.from('pos_customers')
          .select('id, name, loyalty_points, points_balance, loyalty_balance, loyalty_tier')
          .eq('business_id', businessId)
          .or(`email.eq.${lookup},phone.eq.${lookup}`)
          .maybeSingle()
        if (cust) {
          const points = Number(cust.points_balance ?? cust.loyalty_points ?? cust.loyalty_balance ?? 0)
          let perks = ''
          if (cust.loyalty_tier) {
            const { data: tier } = await supabaseAdmin.from('loyalty_tiers')
              .select('tier_name, perks, points_multiplier')
              .eq('business_id', businessId).eq('tier_name', cust.loyalty_tier).maybeSingle()
            if (tier?.perks) perks = ` Tier perks: ${tier.perks}.`
            else if (tier?.tier_name) perks = ` ${tier.tier_name} tier.`
          }
          memberContext = `MEMBER LOOKUP: ${cust.name ?? 'Customer'} is a verified member with ${points} loyalty points${cust.loyalty_tier ? ' (' + cust.loyalty_tier + ' tier)' : ''}.${perks} Greet them by name, share these real numbers — never invent any.`
        } else {
          memberContext = `MEMBER LOOKUP: No membership found for ${lookup}. If asked, invite them to join the loyalty program — it is free.`
        }
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
        ? 'Opening hours:\n' + Object.entries(config.opening_hours).map(([d, h]) => d + ': ' + h).join('\n')
        : '',
      config.services ? 'Services offered:\n' + config.services : '',
      biz?.phone ? 'Phone: ' + biz.phone : '',
      biz?.email ? 'Email: ' + biz.email : '',
      biz?.google_average_rating ? `Google rating: ${biz.google_average_rating}★ (${biz.google_total_reviews ?? 0} reviews)` : '',
      productContext ? 'Products available (with real-time stock):\n' + productContext : '',
      productContext ? 'If a visitor asks about an unavailable product, tell them it is currently out of stock and offer to notify them or suggest an alternative.' : '',
      topSellersContext,
      memberContext,
      'PRIVACY: Never invent loyalty points, tiers, or benefits. Only state membership data when MEMBER LOOKUP is provided above. Never reveal data about other customers.',
      config.faqs?.length > 0
        ? 'FAQs:\n' + config.faqs.map((f: {q:string;a:string}) => 'Q: ' + f.q + '\nA: ' + f.a).join('\n')
        : '',
      config.delivery_policy ? 'Delivery policy: ' + config.delivery_policy : '',
      config.returns_policy ? 'Returns policy: ' + config.returns_policy : '',
      config.age_restricted_policy ? 'Age restrictions: ' + config.age_restricted_policy : '',
      config.custom_rules ? 'Important rules:\n' + config.custom_rules : '',
      config.guardrails ? 'Restrictions: ' + config.guardrails : '',
      '',
      apptEnabled
        ? `APPOINTMENT BOOKING: You CAN book appointments for this business. When a visitor wants to book, collect:
1. Their name
2. Their preferred date (within the next ${config.appointment_lead_days ?? 14} days)
3. Their preferred time
4. Service they want (if applicable): ${config.appointment_services ?? 'any service'}
5. Their phone number or email for confirmation

If a previous turn said a slot was already taken, suggest 2-3 alternative times rather than re-proposing the same slot.
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
    ].filter(Boolean).join('\n')

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

    let slotFullMessage = ''
    if (apptData?.booking_confirmed) {
      // Fix 3: prevent double bookings — check slot availability
      const maxPerSlot = Number(config.max_bookings_per_slot ?? 1)
      const { data: existing } = await supabaseAdmin
        .from('bookings').select('id')
        .eq('business_id', businessId)
        .eq('booking_date', apptData.booking_date)
        .eq('booking_time', apptData.booking_time)
        .neq('status', 'cancelled')
      const slotFull = (existing?.length ?? 0) >= maxPerSlot

      if (slotFull) {
        slotFullMessage = `\n\nThat time slot (${apptData.booking_date} at ${apptData.booking_time}) is already booked — sorry! Please pick another time and I'll lock it in for you.`
      } else {
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
    ].filter(Boolean).join('\n')
        await sendSMS(ownerPhone, smsBody)
      }

      // Also notify via email if configured (write to aria_autopilot_actions)
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

    // ── Strip JSON block from visible reply, append slot-full notice ──
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
