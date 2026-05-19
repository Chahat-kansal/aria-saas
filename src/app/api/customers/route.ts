export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { calcRFM } from '@/lib/rfm'

const PAGE_SIZE = 50

function coalesce(...vals: (number | null | undefined)[]) {
  for (const v of vals) if (v != null) return Number(v)
  return 0
}

function lastVisit(c: Record<string, unknown>) {
  return (c.last_visit ?? c.last_visit_at ?? null) as string | null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const q      = searchParams.get('q') ?? ''
  const segment = searchParams.get('segment') ?? ''
  const sort   = searchParams.get('sort') ?? 'total_spent'
  const page   = Math.max(0, parseInt(searchParams.get('page') ?? '0'))
  const consent = searchParams.get('marketing_consent')
  const tag    = searchParams.get('tag') ?? ''

  const now = Date.now()
  const d30  = new Date(now - 30  * 86400000).toISOString()
  const d60  = new Date(now - 60  * 86400000).toISOString()
  const d120 = new Date(now - 120 * 86400000).toISOString()
  const d61  = new Date(now - 61  * 86400000).toISOString()

  let query = supabaseAdmin
    .from('pos_customers')
    .select('id, business_id, name, email, phone, birthday, tags, marketing_consent, loyalty_points, points_balance, total_spent, total_spend, visit_count, last_visit, last_visit_at, abn, source, notes, created_at, segment, rfm_recency_score, rfm_frequency_score, rfm_monetary_score, rfm_score_total, days_since_visit, lifetime_value_cents')
    .eq('business_id', business_id)

  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
  if (consent === 'true')  query = query.eq('marketing_consent', true)
  if (consent === 'false') query = query.eq('marketing_consent', false)
  if (tag) query = query.contains('tags', [tag])

  // Use DB segment column (populated by scoring cron) with fallback to computed logic
  const SCORED_SEGMENTS = ['champions','loyal','regular','new','at_risk','hibernating','never_returned','needs_attention']
  if (segment && SCORED_SEGMENTS.includes(segment)) {
    query = query.eq('segment', segment)
  } else if (segment === 'vip') {
    query = query.or(`total_spent.gte.500,total_spend.gte.500,visit_count.gte.10`)
  } else if (segment === 'lost') {
    query = query.lt('last_visit', d120).gte('visit_count', 2)
  }

  // Sort
  const sortMap: Record<string, string> = {
    total_spent: 'total_spent', visit_count: 'visit_count', last_visit: 'last_visit_at', name: 'name',
    spend: 'lifetime_value_cents',
  }
  const sortCol = sortMap[sort] ?? 'lifetime_value_cents'
  const asc = sort === 'name'
  query = query.order(sortCol, { ascending: asc, nullsFirst: false })

  query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const customers = (data ?? []).map(c => {
    const spend = coalesce(c.total_spent as number, c.total_spend as number)
    const visits = coalesce(c.visit_count as number)
    const lv = lastVisit(c as Record<string, unknown>)
    const rfm = calcRFM(spend, visits, lv)
    return { ...c, _spend: spend, _visits: visits, _lastVisit: lv, rfm }
  })

  return NextResponse.json({ customers, page, page_size: PAGE_SIZE })
}

export const GET = withErrorCapture('customers', _GET)
