export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { sendSMS } from '@/lib/clicksend'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id') ?? await getBid(supabase, user.id)
  if (!business_id) return NextResponse.json({ score: null, total: 0 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 86400_000).toISOString()

  const [allRes, prevRes] = await Promise.all([
    supabaseAdmin.from('nps_responses')
      .select('id, score, comment, responded_at, customer_id').eq('business_id', business_id)
      .order('responded_at', { ascending: false }).limit(500),
    supabaseAdmin.from('nps_responses')
      .select('score').eq('business_id', business_id)
      .gte('responded_at', sixtyDaysAgo).lt('responded_at', thirtyDaysAgo),
  ])

  const all = allRes.data ?? []
  const recent30 = all.filter(r => r.responded_at >= thirtyDaysAgo)
  const promoters  = all.filter(r => Number(r.score) >= 9).length
  const passives   = all.filter(r => Number(r.score) >= 7 && Number(r.score) <= 8).length
  const detractors = all.filter(r => Number(r.score) <= 6).length
  const total = all.length
  const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null

  // 30-day window counts for trend
  const p30 = recent30.filter(r => Number(r.score) >= 9).length
  const pa30 = recent30.filter(r => Number(r.score) >= 7 && Number(r.score) <= 8).length
  const d30 = recent30.filter(r => Number(r.score) <= 6).length

  // Prior 30-day window for trend comparison
  const prev = prevRes.data ?? []
  const prevP  = prev.filter(r => Number(r.score) >= 9).length
  const prevPa = prev.filter(r => Number(r.score) >= 7 && Number(r.score) <= 8).length
  const prevD  = prev.filter(r => Number(r.score) <= 6).length
  const prevTotal = prev.length
  const prevScore = prevTotal > 0 ? Math.round(((prevP - prevD) / prevTotal) * 100) : null

  return NextResponse.json({
    score: npsScore,
    total,
    promoters: total > 0 ? Math.round((promoters / total) * 100) : 0,
    passives:  total > 0 ? Math.round((passives  / total) * 100) : 0,
    detractors: total > 0 ? Math.round((detractors / total) * 100) : 0,
    promoter_count: promoters,
    passive_count:  passives,
    detractor_count: detractors,
    recent_30_promoters: p30,
    recent_30_passives:  pa30,
    recent_30_detractors: d30,
    prev_score: prevScore,
    prev_total: prevTotal,
    recent: all.slice(0, 10),
  })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id } = await req.json()
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()

  const { data: recentSales } = await supabaseAdmin.from('pos_sales')
    .select('customer_id').eq('business_id', business_id)
    .gte('created_at', thirtyDaysAgo).neq('status', 'voided').not('customer_id', 'is', null)

  const customerIds = [...new Set((recentSales ?? []).map(s => s.customer_id as string))]
  if (!customerIds.length) return NextResponse.json({ sent: 0, skipped: 0 })

  const { data: customers } = await supabaseAdmin.from('pos_customers')
    .select('id, name, phone').in('id', customerIds).not('phone', 'is', null)

  const { data: recentResponses } = await supabaseAdmin.from('nps_responses')
    .select('customer_id').eq('business_id', business_id).gte('created_at', ninetyDaysAgo)
  const recentSet = new Set((recentResponses ?? []).map(r => r.customer_id as string))

  let sent = 0, skipped = 0
  for (const c of customers ?? []) {
    if (recentSet.has(c.id)) { skipped++; continue }
    const phone = (c.phone as string).replace(/\s/g, '').replace(/^0/, '+61')
    const body = `Hi ${(c.name as string).split(' ')[0]}! How likely are you to recommend ${biz.name} to a friend? Reply 0-10 (10 = extremely likely) 🙏`
    const r = await sendSMS(phone, body, { category: 'marketing', businessId: business_id, customerId: c.id })
    if (r.ok) sent++; else skipped++
  }

  return NextResponse.json({ sent, skipped })
}

export const GET  = withErrorCapture('aria/nps', _GET)
export const POST = withErrorCapture('aria/nps', _POST)
