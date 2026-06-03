import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import twilio from 'twilio'

export const dynamic = 'force-dynamic'

/**
 * POST /api/aria/review-request
 * Sends an SMS review request to a customer after a completed POS sale.
 * Called by the POS terminal 30min after sale completion (client-side setTimeout)
 * OR manually triggered from the dashboard.
 *
 * Rate-limited: one review request per customer per 30 days.
 * UPGRADE_ONLY: add more channels (email, WhatsApp), never remove SMS.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { business_id, sale_id, customer_phone, customer_name } = await req.json()
  if (!business_id || !customer_phone) {
    return NextResponse.json({ error: 'business_id and customer_phone required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses')
    .select('id,name,google_review_url,suburb')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Rate limit: skip if we already sent this customer a review request in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase.from('aria_autopilot_actions')
    .select('id').eq('business_id', business_id)
    .eq('action_type', 'review_request')
    .eq('metadata->phone', customer_phone)
    .gte('created_at', thirtyDaysAgo)
    .limit(1).maybeSingle()

  if (recent) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Rate limited — review request already sent in last 30 days' })
  }

  // Build the message
  const firstName = customer_name?.split(' ')[0] ?? 'there'
  const reviewUrl = (biz as any).google_review_url ?? `https://www.google.com/search?q=${encodeURIComponent((biz.name ?? '') + ' ' + ((biz as any).suburb ?? ''))}`
  const bizName = biz.name ?? 'us'

  const message = `Hi ${firstName}! Thanks for visiting ${bizName} today 😊 We'd love your feedback — it helps other locals find us. Takes 30 seconds: ${reviewUrl}`

  // Send via Twilio
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  try {
    const client = twilio(accountSid, authToken)
    const msg = await client.messages.create({
      body: message,
      from: fromNumber,
      to: customer_phone,
    })

    // Log to autopilot_actions for tracking + rate limiting
    await supabase.from('aria_autopilot_actions').insert({
      business_id,
      action_type: 'review_request',
      action_label: `Review request SMS → ${firstName}`,
      status: 'sent',
      metadata: { phone: customer_phone, sale_id, message_sid: msg.sid },
    })

    return NextResponse.json({ ok: true, message_sid: msg.sid })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
