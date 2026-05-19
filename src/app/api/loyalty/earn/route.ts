export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getTier, calcEarn } from '@/lib/loyalty'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { sale_id, customer_id, business_id, sale_total } = body
  if (!customer_id || !business_id || !sale_total) {
    return NextResponse.json({ error: 'customer_id, business_id, sale_total required' }, { status: 400 })
  }

  // Verify caller owns this business
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: customer }, { data: config }] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id, points_balance, loyalty_points, stamps_count, total_spent, total_spend, visit_count').eq('id', customer_id).eq('business_id', business_id).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_config').select('*').eq('business_id', business_id).maybeSingle(),
  ])
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const spend = Number(customer.total_spent ?? customer.total_spend ?? 0)
  const visits = Number(customer.visit_count ?? 0)
  const tier = getTier(spend, visits)

  const isPoints = !config || config.program_type !== 'stamps'
  const pointsPerDollar = Number(config?.points_per_dollar ?? 1)

  let pointsDelta = 0
  let stampsDelta = 0

  if (isPoints) {
    pointsDelta = calcEarn(Number(sale_total), pointsPerDollar, tier)
  } else {
    stampsDelta = 1 // 1 stamp per visit
  }

  const currentPoints = Number(customer.points_balance ?? customer.loyalty_points ?? 0)
  const currentStamps = Number(customer.stamps_count ?? 0)
  const newPoints = currentPoints + pointsDelta
  const newStamps = currentStamps + stampsDelta

  // Update customer balances (both duplicate columns)
  await supabaseAdmin.from('pos_customers').update({
    points_balance: newPoints,
    loyalty_points: newPoints,
    loyalty_balance: newPoints,
    stamps_count: newStamps,
    updated_at: new Date().toISOString(),
  }).eq('id', customer_id)

  // Log transaction
  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id,
    customer_id,
    sale_id: sale_id ?? null,
    type: 'earn',
    points_delta: pointsDelta,
    stamps_delta: stampsDelta,
    created_at: new Date().toISOString(),
  })

  const stampReward = isPoints ? null : (newStamps >= (config?.stamps_to_reward ?? 10) ? (config?.stamp_reward_text ?? 'Free reward') : null)

  return NextResponse.json({
    ok: true,
    tier,
    points_earned: pointsDelta,
    stamps_earned: stampsDelta,
    new_points_balance: newPoints,
    new_stamps_count: newStamps,
    stamp_reward_earned: stampReward,
  })
}

export const POST = withErrorCapture('loyalty/earn', _POST)
