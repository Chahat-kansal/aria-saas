import { sendSMS } from '@/lib/clicksend'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'

interface SequenceStep { delay_days: number; message: string; condition: string }
type SendRow = { id: string; campaign_id: string | null; customer_id: string | null; channel: string | null; sequence_step: number | null }
type CampRow = {
  id: string; name: string | null; message: string | null; email_subject: string | null
  email_body: string | null; channel: string | null; type: string | null
  created_at: string | null; business_id: string | null
  sequence_steps: SequenceStep[] | null
}

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  const { data: dueRaw } = await supabaseAdmin
    .from('campaign_sends')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_send_at', new Date().toISOString())
    .limit(100)

  await updateRevenue()

  const due = (dueRaw ?? []) as unknown as SendRow[]
  if (!due.length) return NextResponse.json({ sent: 0, failed: 0, skipped: 0 })

  const campaignIds = [...new Set(due.map(d => d.campaign_id as string))]
  const customerIds = [...new Set(due.map(d => d.customer_id as string))]

  const [{ data: campaignsRaw }, { data: customers }] = await Promise.all([
    supabaseAdmin.from('campaigns').select('*').in('id', campaignIds),
    supabaseAdmin.from('pos_customers').select('id, name, phone, email').in('id', customerIds),
  ])

  const campMap = Object.fromEntries(
    ((campaignsRaw ?? []) as unknown as CampRow[]).map(c => [c.id, c])
  ) as Record<string, CampRow>
  const custMap = Object.fromEntries((customers ?? []).map(c => [c.id as string, c]))

  // Sequence skip: for step > 0 sends, cancel if customer already returned after campaign start
  const seqDue = due.filter(d => (d.sequence_step ?? 0) > 0)
  const skippedIds: string[] = []

  if (seqDue.length > 0) {
    const seqCampIds = [...new Set(seqDue.map(d => d.campaign_id as string))]
    const seqCustIds = [...new Set(seqDue.map(d => d.customer_id as string))]
    const returnedKeys = new Set<string>() // 'campaign_id:customer_id'

    for (const campId of seqCampIds) {
      const camp = campMap[campId]
      if (!camp?.created_at || !camp.business_id) continue
      const { data: sales } = await supabaseAdmin
        .from('pos_sales')
        .select('customer_id')
        .eq('business_id', camp.business_id)
        .in('customer_id', seqCustIds)
        .gt('created_at', camp.created_at)
        .neq('status', 'voided')
        .limit(500)
      for (const sale of sales ?? []) {
        returnedKeys.add(`${campId}:${sale.customer_id}`)
      }
    }

    for (const send of seqDue) {
      if (returnedKeys.has(`${send.campaign_id}:${send.customer_id}`)) {
        skippedIds.push(send.id)
      }
    }
  }

  const skippedSet = new Set(skippedIds)
  const resendKey = process.env.RESEND_API_KEY
  const sentIds: string[] = []
  const failedIds: string[] = []

  for (const send of due) {
    if (skippedSet.has(send.id)) continue

    const campaign = campMap[send.campaign_id as string]
    const customer = custMap[send.customer_id as string]
    if (!campaign || !customer) { sentIds.push(send.id); continue }

    // For sequence campaigns: use the step-specific message
    const stepIdx = send.sequence_step ?? 0
    let smsMessage: string | null = campaign.message
    if (campaign.type === 'winback_sequence' && Array.isArray(campaign.sequence_steps) && stepIdx > 0) {
      const stepDef = (campaign.sequence_steps as SequenceStep[])[stepIdx] as SequenceStep | undefined
      smsMessage = stepDef?.message ?? smsMessage
    }

    const ch = (send.channel ?? 'both') as string
    let ok = true

    if (ch !== 'email' && customer.phone && smsMessage) {
      const phone = (customer.phone as string).replace(/\s/g, '').replace(/^0/, '+61')
      const msgBody = smsMessage.replace('{name}', (customer.name as string) ?? '')
      const smsResult = await sendSMS(phone, msgBody, { category: 'marketing', businessId: campaign.business_id as string, customerId: customer.id as string })
      if (!smsResult.ok) ok = false
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

    if (ok) sentIds.push(send.id)
    else failedIds.push(send.id)
  }

  const now = new Date().toISOString()
  if (sentIds.length > 0) await supabaseAdmin.from('campaign_sends').update({ status: 'sent', sent_at: now }).in('id', sentIds)
  if (failedIds.length > 0) await supabaseAdmin.from('campaign_sends').update({ status: 'failed' }).in('id', failedIds)
  if (skippedIds.length > 0) {
    // sequence_skip_reason is a new column — cast update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseAdmin.from('campaign_sends').update({ status: 'skipped', sequence_skip_reason: 'customer_returned' } as any).in('id', skippedIds)
  }

  // Update sent_count on campaigns
  for (const cid of campaignIds) {
    const n = sentIds.filter(sid => due.find(d => d.id === sid && d.campaign_id === cid)).length
    if (n > 0) await supabaseAdmin.from('campaigns').update({ sent_count: n, status: 'sent' }).eq('id', cid)
  }

  // Aria Intelligence: log returned customers from sequence campaigns as positive events
  if (skippedIds.length > 0) {
    const skippedByCamp: Record<string, number> = {}
    for (const sid of skippedIds) {
      const send = due.find(d => d.id === sid)
      if (send?.campaign_id) skippedByCamp[send.campaign_id] = (skippedByCamp[send.campaign_id] ?? 0) + 1
    }
    for (const [campId, count] of Object.entries(skippedByCamp)) {
      const camp = campMap[campId]
      if (!camp?.business_id) continue
      await supabaseAdmin.from('aria_autopilot_actions').insert({
        business_id: camp.business_id,
        action_type: 'sequence_skip',
        category: 'marketing',
        title: `${count} customer${count !== 1 ? 's' : ''} returned — sequence follow-ups cancelled`,
        description: `Customers in sequence "${camp.name ?? campId}" made a purchase after the campaign started. Remaining sends cancelled automatically.`,
        status: 'completed',
        triggered_by: 'winback_sequence',
        target_count: count,
        channel: 'sms',
      })
    }
  }

  return NextResponse.json({ sent: sentIds.length, failed: failedIds.length, skipped: skippedIds.length })
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
