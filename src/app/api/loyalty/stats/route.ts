export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const d30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const [enrolled, active, config, txns] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', business_id).gt('points_balance', 0),
    supabaseAdmin.from('pos_loyalty_transactions').select('customer_id').eq('business_id', business_id).eq('type', 'earn').gte('created_at', d30),
    supabaseAdmin.from('pos_loyalty_config').select('point_value_cents').eq('business_id', business_id).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_transactions').select('type, points_delta').eq('business_id', business_id).gte('created_at', d30),
  ])

  const { data: allCustomers } = await supabaseAdmin
    .from('pos_customers')
    .select('points_balance, loyalty_points')
    .eq('business_id', business_id)

  const totalPoints = (allCustomers ?? []).reduce((s, c) => s + Number(c.points_balance ?? c.loyalty_points ?? 0), 0)
  const pointValueCents = Number(config.data?.point_value_cents ?? 1)
  const liabilityDollars = (totalPoints * pointValueCents) / 100

  const activeIds = new Set((active.data ?? []).map((t: { customer_id: string }) => t.customer_id))
  const redemptions = (txns.data ?? []).filter((t: { type: string }) => t.type === 'redeem').length

  const avgPoints = (allCustomers ?? []).length > 0
    ? totalPoints / (allCustomers ?? []).length
    : 0

  return NextResponse.json({
    enrolled: enrolled.count ?? 0,
    active_this_month: activeIds.size,
    total_points_outstanding: totalPoints,
    points_liability_dollars: liabilityDollars,
    redemptions_this_month: redemptions,
    avg_points_per_customer: Math.round(avgPoints),
  })
}

export const GET = withErrorCapture('loyalty/stats', _GET)
