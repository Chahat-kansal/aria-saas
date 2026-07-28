export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { requireSection } from '@/lib/billing/enforce'
import { runCustomerFacingCopy } from '@/lib/aria/grounded'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    business_id, customer_ids, sms_message, email_subject, email_body,
    channel, campaign_name, enable_ab_test,
  } = body
  if (!business_id || !Array.isArray(customer_ids) || customer_ids.length === 0) {
    return NextResponse.json({ error: 'business_id and customer_ids required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // SS-RECONCILE — was requireFeature(business_id, 'winback_sms') (growth+). Customer winback's
  // nav item lives in the 'Revenue' section, starter+ in the confirmed plan matrix — this loosens
  // from growth+ to starter, never re-tightens (RULE0).
  const gate = await requireSection(business_id, 'Revenue')
  if (gate) return gate

  const ch: string = channel ?? 'both'
  const baseName: string = campaign_name ?? `Winback — ${new Date().toLocaleDateString('en-AU')}`

  // Load customers + purchase history (shared by both A/B and standard paths)
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
  const mkSend = (custId: string, campId: string) => {
    const bestHourAEST = hourMap[custId] ?? 18
    const bestHourUTC = (bestHourAEST - 10 + 24) % 24
    const scheduled = new Date(now)
    scheduled.setUTCHours(bestHourUTC, 0, 0, 0)
    if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1)
    return { campaign_id: campId, customer_id: custId, channel: ch, scheduled_send_at: scheduled.toISOString(), status: 'pending' }
  }

  // A/B test split: generate variant B, create 2 campaigns, split customers 50/50
  if (enable_ab_test && sms_message) {
    let variantBMessage: string = sms_message
    try {
      // AI-GROUNDING-1 — was a raw `new Anthropic()` call logged only to console/Sentry via
      // trackAICall, invisible in the aria_ai_calls cost ledger and with no circuit-breaker/Gemini
      // failover, despite writing text that gets SMS'd straight to real customers.
      const resp = await runCustomerFacingCopy({
        model: 'haiku',
        agentKey: 'marketing_ai_generate',
        role: 'narrative',
        businessId: business_id,
        maxTokens: 200,
        fallback: sms_message,
        systemPrompt: 'Create an alternative SMS for A/B testing. Same offer, different angle/tone/hook. Max 160 chars. Return ONLY the SMS text, no quotes or explanation.',
        userPrompt: `Original: ${sms_message}`,
      })
      variantBMessage = resp.safe ? resp.data.slice(0, 160) : sms_message
    } catch { /* keep original as variant B fallback */ }

    const allCust = customers ?? []
    const half = Math.ceil(allCust.length / 2)
    const custA = allCust.slice(0, half)
    const custB = allCust.slice(half)

    const { data: campA, error: campAErr } = await supabaseAdmin.from('campaigns').insert({
      business_id, name: baseName + ' (A)', type: 'winback',
      message: sms_message, email_subject: email_subject ?? null, email_body: email_body ?? null,
      channel: ch, status: 'scheduled', recipients_count: custA.length, ab_variant: 'A',
    }).select('id').single()
    if (campAErr || !campA) return NextResponse.json({ error: 'Campaign A creation failed' }, { status: 500 })

    const { data: campB, error: campBErr } = await supabaseAdmin.from('campaigns').insert({
      business_id, name: baseName + ' (B)', type: 'winback',
      message: variantBMessage, email_subject: email_subject ?? null, email_body: email_body ?? null,
      channel: ch, status: 'scheduled', recipients_count: custB.length,
      ab_variant: 'B', ab_parent_id: campA.id,
    }).select('id').single()
    if (campBErr || !campB) return NextResponse.json({ error: 'Campaign B creation failed' }, { status: 500 })

    const sendsA = custA.map(c => mkSend(c.id as string, campA.id))
    const sendsB = custB.map(c => mkSend(c.id as string, campB.id))
    const allSendsAB = [...sendsA, ...sendsB]
    if (allSendsAB.length > 0) await supabaseAdmin.from('campaign_sends').insert(allSendsAB)

    return NextResponse.json({
      ab_test: true,
      campaign_a_id: campA.id,
      campaign_b_id: campB.id,
      variant_a_message: sms_message,
      variant_b_message: variantBMessage,
      split_a: custA.length,
      split_b: custB.length,
      total: allSendsAB.length,
    })
  }

  // Standard (non-A/B) flow — unchanged logic
  const { data: campaign, error: campErr } = await supabaseAdmin.from('campaigns').insert({
    business_id,
    name: baseName,
    type: 'winback',
    message: sms_message ?? null,
    email_subject: email_subject ?? null,
    email_body: email_body ?? null,
    channel: ch,
    status: 'scheduled',
    recipients_count: customer_ids.length,
  }).select('id').single()
  if (campErr || !campaign) return NextResponse.json({ error: 'Campaign creation failed' }, { status: 500 })

  const sends = (customers ?? []).map(c => mkSend(c.id as string, campaign.id))
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
