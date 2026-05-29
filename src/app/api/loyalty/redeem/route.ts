export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { markBriefingStale } from '@/lib/aria/briefing-invalidate'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { customer_id, business_id, points_to_redeem, stamps_to_redeem, sale_id } = body
  if (!customer_id || !business_id) return NextResponse.json({ error: 'customer_id, business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: customer }, { data: config }] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id, points_balance, loyalty_points, stamps_count').eq('id', customer_id).eq('business_id', business_id).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_config').select('point_value_cents, stamps_to_reward, stamp_reward_text').eq('business_id', business_id).maybeSingle(),
  ])
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const currentPoints = Number(customer.points_balance ?? customer.loyalty_points ?? 0)
  const currentStamps = Number(customer.stamps_count ?? 0)
  const pointValueCents = Number(config?.point_value_cents ?? 1)
  const stampsNeeded = Number(config?.stamps_to_reward ?? 10)

  const ptsRedeem = Number(points_to_redeem ?? 0)
  const stRedeem = Number(stamps_to_redeem ?? 0)

  if (ptsRedeem > 0 && currentPoints < ptsRedeem) {
    return NextResponse.json({ error: `Insufficient points — customer has ${currentPoints}` }, { status: 400 })
  }
  if (stRedeem > 0 && currentStamps < stampsNeeded) {
    return NextResponse.json({ error: `Insufficient stamps — customer has ${currentStamps}/${stampsNeeded}` }, { status: 400 })
  }

  const discountCents = ptsRedeem * pointValueCents
  const newPoints = Math.max(0, currentPoints - ptsRedeem)
  const newStamps = stRedeem > 0 ? Math.max(0, currentStamps - stampsNeeded) : currentStamps
  const rewardText = stRedeem > 0 ? (config?.stamp_reward_text ?? 'Free reward') : null

  await supabaseAdmin.from('pos_customers').update({
    points_balance: newPoints, loyalty_points: newPoints, loyalty_balance: newPoints,
    stamps_count: newStamps, updated_at: new Date().toISOString(),
  }).eq('id', customer_id)

  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id, customer_id, sale_id: sale_id ?? null,
    type: 'redeem',
    points_delta: -ptsRedeem,
    stamps_delta: stRedeem > 0 ? -stampsNeeded : 0,
    reward_redeemed: rewardText,
    created_at: new Date().toISOString(),
  })

  void markBriefingStale(business_id)
  return NextResponse.json({
    ok: true,
    discount_cents: discountCents,
    discount_dollars: discountCents / 100,
    new_points_balance: newPoints,
    new_stamps_count: newStamps,
    reward_redeemed: rewardText,
  })
}

export const POST = withErrorCapture('loyalty/redeem', _POST)
