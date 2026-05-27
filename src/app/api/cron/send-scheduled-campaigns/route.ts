import { sendSMS } from '@/lib/clicksend'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data: due } = await supabaseAdmin
    .from('campaign_sends')
    .select('id, campaign_id, customer_id, channel')
    .eq('status', 'pending')
    .lte('scheduled_send_at', new Date().toISOString())
    .limit(100)

  await updateRevenue()

  if (!due?.length) return NextResponse.json({ sent: 0, failed: 0 })

  const campaignIds = [...new Set(due.map(d => d.campaign_id as string))]
  const customerIds = [...new Set(due.map(d => d.customer_id as string))]

  const [{ data: campaigns }, { data: customers }] = await Promise.all([
    supabaseAdmin.from('campaigns').select('id, name, message, email_subject, email_body, channel').in('id', campaignIds),
    supabaseAdmin.from('pos_customers').select('id, name, phone, email').in('id', customerIds),
  ])

  const campMap = Object.fromEntries((campaigns ?? []).map(c => [c.id as string, c]))
  const custMap = Object.fromEntries((customers ?? []).map(c => [c.id as string, c]))

  // ClickSend SMS
  // ClickSend — no phone number needed
  const resendKey = process.env.RESEND_API_KEY

  const sentIds: string[] = []
  const failedIds: string[] = []

  for (const send of due) {
    const campaign = campMap[send.campaign_id as string]
    const customer = custMap[send.customer_id as string]
    if (!campaign || !customer) { sentIds.push(send.id as string); continue }

    const ch = (send.channel ?? 'both') as string
    let ok = true

    if (ch !== 'email' && customer.phone && campaign.message && accountSid && authToken && twilioFrom) {
      const phone = (customer.phone as string).replace(/\s/g, '').replace(/^0/, '+61')
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: twilioFrom as string, Body: (campaign.message as string).replace('{name}', (customer.name as string) ?? '') }).toString(),
      })
      if (!res.ok) ok = false
    }

    if (ch !== 'sms' && customer.email && campaign.email_body && resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${campaign.name ?? 'Aria'} <onboarding@resend.dev>`,
          to: customer.email as string,
          subject: (campaign.email_subject as string) ?? 'We miss you!',
          html: (campaign.email_body as string).replace(/\{name\}/g, (customer.name as string) ?? 'there'),
        }),
      })
      if (!res.ok) ok = false
    }

    if (ok) sentIds.push(send.id as string)
    else failedIds.push(send.id as string)
  }

  const now = new Date().toISOString()
  if (sentIds.length > 0) await supabaseAdmin.from('campaign_sends').update({ status: 'sent', sent_at: now }).in('id', sentIds)
  if (failedIds.length > 0) await supabaseAdmin.from('campaign_sends').update({ status: 'failed' }).in('id', failedIds)

  // Update sent_count on campaigns
  for (const cid of campaignIds) {
    const n = sentIds.filter(sid => due.find(d => d.id === sid && d.campaign_id === cid)).length
    if (n > 0) await supabaseAdmin.from('campaigns').update({ sent_count: n, status: 'sent' }).eq('id', cid)
  }

  return NextResponse.json({ sent: sentIds.length, failed: failedIds.length })
}

async function updateRevenue() {
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { data: sends } = await supabaseAdmin
    .from('campaign_sends')
    .select('id, campaign_id, customer_id, sent_at')
    .eq('status', 'sent')
    .lt('sent_at', oneDayAgo)
    .not('sent_at', 'is', null)
    .limit(500)

  if (!sends?.length) return

  const byCampaign: Record<string, Array<{ customer_id: string; sent_at: string }>> = {}
  for (const s of sends) byCampaign[s.campaign_id as string] = [...(byCampaign[s.campaign_id as string] ?? []), { customer_id: s.customer_id as string, sent_at: s.sent_at as string }]

  for (const [campaignId, rows] of Object.entries(byCampaign)) {
    const { data: camp } = await supabaseAdmin.from('campaigns').select('business_id, recipients_count').eq('id', campaignId).single()
    if (!camp) continue

    let revenue = 0
    const returned = new Set<string>()

    for (const row of rows) {
      const windowEnd = new Date(new Date(row.sent_at).getTime() + 30 * 86_400_000).toISOString()
      const { data: sales } = await supabaseAdmin.from('pos_sales')
        .select('total_amount')
        .eq('customer_id', row.customer_id)
        .eq('business_id', camp.business_id as string)
        .gt('created_at', row.sent_at)
        .lt('created_at', windowEnd)
        .neq('status', 'voided')
      if (sales?.length) {
        returned.add(row.customer_id)
        revenue += sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0)
      }
    }

    const cost = rows.length * 0.05
    const roi = cost > 0 ? Math.round(((revenue - cost) / cost) * 100) : 0
    await supabaseAdmin.from('campaigns').update({ attributed_revenue: revenue, returned_customers: returned.size, roi_percent: roi }).eq('id', campaignId)
  }
}
