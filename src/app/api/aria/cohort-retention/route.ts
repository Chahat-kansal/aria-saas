export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString()
  const nineMonthsAgo = new Date(Date.now() - 270 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ data: customers }, { data: sales }, { data: recentSales }] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id,created_at').eq('business_id', business_id).gte('created_at', sixMonthsAgo),
    supabaseAdmin.from('pos_sales').select('customer_id,created_at').eq('business_id', business_id).gte('created_at', nineMonthsAgo).not('customer_id', 'is', null),
    supabaseAdmin.from('pos_sales').select('total_amount,created_at').eq('business_id', business_id).gte('created_at', thirtyDaysAgo),
  ])

  // Daily revenue for weather correlation
  const daily_revenue: Record<string, number> = {}
  for (const s of recentSales ?? []) {
    const date = s.created_at.slice(0, 10)
    daily_revenue[date] = (daily_revenue[date] ?? 0) + (Number(s.total_amount) || 0)
  }

  // Group customers by cohort month
  const cohortMap: Record<string, { cohortDate: Date; customerIds: string[] }> = {}
  for (const c of customers ?? []) {
    const d = new Date(c.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!cohortMap[key]) cohortMap[key] = { cohortDate: new Date(d.getFullYear(), d.getMonth(), 1), customerIds: [] }
    cohortMap[key].customerIds.push(c.id)
  }

  // Group sales by customer_id → array of dates
  const salesByCustomer: Record<string, number[]> = {}
  for (const s of sales ?? []) {
    const cid = s.customer_id as string
    if (!salesByCustomer[cid]) salesByCustomer[cid] = []
    salesByCustomer[cid].push(new Date(s.created_at).getTime())
  }

  const cohorts = Object.entries(cohortMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, { cohortDate, customerIds }]) => {
      const total = customerIds.length
      if (total === 0) return null
      const base = cohortDate.getTime()
      let d30 = 0, d60 = 0, d90 = 0
      for (const cid of customerIds) {
        const times = salesByCustomer[cid] ?? []
        if (times.some(t => t > base + 30 * 86400000)) d30++
        if (times.some(t => t > base + 60 * 86400000)) d60++
        if (times.some(t => t > base + 90 * 86400000)) d90++
      }
      return {
        month: cohortDate.toLocaleDateString('en-AU', { month: 'short' }),
        total,
        pct30: Math.round((d30 / total) * 100),
        pct60: Math.round((d60 / total) * 100),
        pct90: Math.round((d90 / total) * 100),
      }
    })
    .filter(Boolean)

  return NextResponse.json({ cohorts, daily_revenue })
}

export const GET = withErrorCapture('aria/cohort-retention', _GET)
