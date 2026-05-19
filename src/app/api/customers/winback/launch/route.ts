export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { applyTemplate } from '@/lib/winback-templates'

async function sendSMS(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return { ok: false, error: 'Twilio not configured' }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  })
  const data = await res.json() as { sid?: string; message?: string }
  return { ok: res.ok, twilio_sid: data.sid, error: data.message }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { name, target_segment, channel, message_template, offer_type, offer_value_cents, send_now, scheduled_at, business_id } = body
  if (!business_id || !target_segment || !channel || !message_template) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id,name').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get target customers
  const { data: customers } = await supabaseAdmin
    .from('pos_customers')
    .select('id,name,phone,email,days_since_visit,marketing_consent')
    .eq('business_id', business_id)
    .eq('segment', target_segment)
    .eq('marketing_consent', true)

  if (!customers?.length) return NextResponse.json({ error: 'No eligible customers in this segment' }, { status: 400 })

  const b = biz as Record<string, unknown>
  const campaignStatus = send_now ? 'active' : 'scheduled'

  const { data: campaign, error: campErr } = await supabaseAdmin.from('customer_winback_campaigns').insert({
    business_id, name: name || `${target_segment} winback ${new Date().toLocaleDateString('en-AU')}`,
    target_segment, channel, message_template, offer_type: offer_type ?? null, offer_value_cents: offer_value_cents ?? null,
    status: campaignStatus, scheduled_at: scheduled_at ?? null,
  }).select('id').single()

  if (campErr || !campaign) return NextResponse.json({ error: campErr?.message ?? 'Campaign create failed' }, { status: 500 })

  let sentCount = 0
  const recipients: Record<string, unknown>[] = []

  if (send_now && channel === 'sms') {
    for (const c of customers) {
      if (!c.phone) continue
      const firstName = String(c.name ?? '').split(' ')[0] || 'there'
      const message = applyTemplate(message_template, {
        first_name: firstName, days_since_visit: String(c.days_since_visit ?? 'a while'), business_name: String(b.name),
      })
      const result = await sendSMS(c.phone, message)
      recipients.push({ campaign_id: campaign.id, customer_id: c.id, contacted_at: result.ok ? new Date().toISOString() : null })
      if (result.ok) sentCount++
    }
  } else {
    // Schedule — just create recipient rows
    for (const c of customers) {
      recipients.push({ campaign_id: campaign.id, customer_id: c.id })
    }
  }

  if (recipients.length) await supabaseAdmin.from('customer_winback_recipients').insert(recipients)

  if (send_now) {
    await supabaseAdmin.from('customer_winback_campaigns').update({ sent_count: sentCount, sent_at: new Date().toISOString(), status: 'sent' }).eq('id', campaign.id)
  }

  return NextResponse.json({ ok: true, campaign_id: campaign.id, sent_count: sentCount, recipients_count: recipients.length })
}

export const POST = withErrorCapture('customers/winback/launch', _POST)
