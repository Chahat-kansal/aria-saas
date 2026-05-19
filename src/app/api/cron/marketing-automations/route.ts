export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({
    id: cronId, job_name: 'marketing-automations', status: 'running', started_at: new Date().toISOString(),
  })

  let birthdaySent = 0, reviewRequestsQueued = 0

  try {
    const today = new Date()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')

    // Birthday automation — customers with birthday today who have marketing consent
    const { data: birthdayCustomers } = await supabaseAdmin
      .from('pos_customers')
      .select('id,name,phone,email,business_id,birthday')
      .eq('marketing_consent', true)
      .not('phone', 'is', null)
      .filter('birthday', 'like', `%-${mm}-${dd}`)

    const yearStart = `${today.getFullYear()}-01-01`

    for (const customer of birthdayCustomers ?? []) {
      const c = customer as Record<string, unknown>

      // Idempotency: skip if a birthday campaign was already sent for this customer this year
      // Check campaign_recipients joined with campaigns.type='birthday'
      const { data: existingRecipient } = await supabaseAdmin
        .from('campaign_recipients')
        .select('id, campaigns!inner(type)')
        .eq('customer_id', c.id as string)
        .eq('business_id', c.business_id as string)
        .gte('created_at', yearStart)
        .limit(1)
        .maybeSingle()

      if (existingRecipient) continue

      const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', c.business_id as string).maybeSingle()
      const firstName = ((c.name as string) ?? '').split(' ')[0]
      const message = `Happy birthday ${firstName}! 🎂 Celebrate with us at ${(biz as Record<string,unknown>)?.name ?? 'our store'} — enjoy $10 off your next visit this week. You deserve it!`

      // Create the campaign
      const { data: camp } = await supabaseAdmin.from('campaigns').insert({
        business_id: c.business_id as string,
        name: `Birthday — ${c.name as string}`,
        type: 'birthday',
        channel: 'sms',
        target_type: 'manual',
        message,
        status: 'pending',
        aria_generated: true,
      }).select('id').maybeSingle()

      if (camp) {
        // Queue recipient
        await supabaseAdmin.from('campaign_recipients').insert({
          campaign_id: (camp as Record<string,unknown>).id as string,
          customer_id: c.id as string,
          business_id: c.business_id as string,
          channel: 'sms',
          status: 'pending',
        })
        birthdaySent++
      }
    }

    // Review request automation — customers who visited in last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: recentSales } = await supabaseAdmin
      .from('pos_sales')
      .select('customer_id,business_id,total_amount')
      .gte('created_at', twoHoursAgo)
      .neq('status', 'voided')
      .not('customer_id', 'is', null)
      .gte('total_amount', 20)

    const processed = new Set<string>()
    for (const sale of recentSales ?? []) {
      const s = sale as Record<string, unknown>
      const key = `${s.customer_id}-${s.business_id}`
      if (processed.has(key)) continue
      processed.add(key)

      const { data: customer } = await supabaseAdmin.from('pos_customers')
        .select('id,name,phone,marketing_consent,segment').eq('id', s.customer_id as string).maybeSingle()
      const cu = customer as Record<string, unknown> | null
      if (!cu?.marketing_consent || !cu?.phone) continue
      if (!['champions','loyal','regular'].includes((cu.segment as string) ?? '')) continue

      const { data: biz } = await supabaseAdmin.from('businesses').select('name,google_business_url').eq('id', s.business_id as string).maybeSingle()
      const b = biz as Record<string, unknown> | null
      if (!b?.google_business_url) continue

      // Check not recently requested — use campaign_recipients as a proxy
      const { data: recentReq } = await supabaseAdmin
        .from('campaign_recipients')
        .select('id, campaigns!inner(type)')
        .eq('customer_id', cu.id as string)
        .eq('business_id', s.business_id as string)
        .gte('created_at', thirtyDaysAgo)
        .limit(1)
        .maybeSingle()
      if (recentReq) continue

      const firstName = ((cu.name as string) ?? '').split(' ')[0]
      const message = `Hi ${firstName}, thanks for visiting ${b.name as string}! We'd love your review — takes 30 seconds: ${b.google_business_url as string}`

      const { data: camp } = await supabaseAdmin.from('campaigns').insert({
        business_id: s.business_id as string,
        name: `Review request — ${cu.name as string}`,
        type: 'review_request',
        channel: 'sms',
        target_type: 'manual',
        message,
        status: 'pending',
        aria_generated: true,
      }).select('id').maybeSingle()

      if (camp) {
        await supabaseAdmin.from('campaign_recipients').insert({
          campaign_id: (camp as Record<string,unknown>).id as string,
          customer_id: cu.id as string,
          business_id: s.business_id as string,
          channel: 'sms',
          status: 'pending',
        })
        reviewRequestsQueued++
      }
    }

    await supabaseAdmin.from('cron_logs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      businesses_processed: 0,
      errors: { birthday_sent: birthdaySent, review_requests_queued: reviewRequestsQueued },
    }).eq('id', cronId)

    return NextResponse.json({ ok: true, birthday_sent: birthdaySent, review_requests_queued: reviewRequestsQueued })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
