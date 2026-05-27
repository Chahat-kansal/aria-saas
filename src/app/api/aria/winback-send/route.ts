export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { business_id, customer_ids, sms_message, email_subject, email_body, channel, campaign_name } = body
  if (!business_id || !Array.isArray(customer_ids) || customer_ids.length === 0) {
    return NextResponse.json({ error: 'business_id and customer_ids required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ch: string = channel ?? 'both'

  const { data: campaign, error: campErr } = await supabaseAdmin.from('campaigns').insert({
    business_id,
    name: campaign_name ?? `Winback — ${new Date().toLocaleDateString('en-AU')}`,
    type: 'winback',
    message: sms_message ?? null,
    email_subject: email_subject ?? null,
    email_body: email_body ?? null,
    channel: ch,
    status: 'scheduled',
    recipients_count: customer_ids.length,
  }).select('id').single()
  if (campErr || !campaign) return NextResponse.json({ error: 'Campaign creation failed' }, { status: 500 })

  const [{ data: customers }, { data: allSales }] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id, phone, email').eq('business_id', business_id).in('id', customer_ids),
    supabaseAdmin.from('pos_sales').select('customer_id, created_at').eq('business_id', business_id).in('customer_id', customer_ids).not('customer_id', 'is', null),
  ])

  // Build personalised best-hour map (mode purchase hour AEST)
  const hourCounts: Record<string, Record<number, number>> = {}
  for (const sale of allSales ?? []) {
    const cid = sale.customer_id as string
    const hour = new Date(sale.created_at as string).getHours()
    if (!hourCounts[cid]) hourCounts[cid] = {}
    hourCounts[cid][hour] = (hourCounts[cid][hour] ?? 0) + 1
  }
  const hourMap: Record<string, number> = {}
  for (const [cid, counts] of Object.entries(hourCounts)) {
    hourMap[cid] = parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
  }

  const now = new Date()
  const sends = (customers ?? []).map(c => {
    const bestHourAEST = hourMap[c.id] ?? 18
    const bestHourUTC = (bestHourAEST - 10 + 24) % 24
    const scheduled = new Date(now)
    scheduled.setUTCHours(bestHourUTC, 0, 0, 0)
    if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1)
    return { campaign_id: campaign.id, customer_id: c.id, channel: ch, scheduled_send_at: scheduled.toISOString(), status: 'pending' }
  })

  if (sends.length > 0) await supabaseAdmin.from('campaign_sends').insert(sends)

  return NextResponse.json({
    campaign_id: campaign.id,
    scheduled: true,
    will_send_sms: (customers ?? []).filter(c => c.phone && ch !== 'email').length,
    will_send_email: (customers ?? []).filter(c => c.email && ch !== 'sms').length,
    total: sends.length,
  })
}

export const POST = withErrorCapture('aria/winback-send', _POST)
