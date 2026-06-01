export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { callAnthropic } from '@/lib/aria/providers/anthropic'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const business_id = String(body.business_id ?? '')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const d30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const [enrolledRes, activeRes, configRes, txnsRes, loyaltyAvgRes, nonLoyaltyAvgRes] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', business_id).gt('points_balance', 0),
    supabaseAdmin.from('pos_loyalty_transactions').select('customer_id').eq('business_id', business_id).eq('type', 'earn').gte('created_at', d30),
    supabaseAdmin.from('pos_loyalty_config').select('*').eq('business_id', business_id).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_transactions').select('type, reward_redeemed').eq('business_id', business_id).limit(5000),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', business_id).not('customer_id', 'is', null).neq('status', 'voided').gte('created_at', d30),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', business_id).is('customer_id', null).neq('status', 'voided').gte('created_at', d30),
  ])

  const enrolled = enrolledRes.count ?? 0
  const activePct = enrolled > 0 ? Math.round(((new Set((activeRes.data ?? []).map((t: { customer_id: string }) => t.customer_id))).size / enrolled) * 100) : 0

  const allCusts = (await supabaseAdmin.from('pos_customers').select('points_balance, loyalty_points').eq('business_id', business_id).limit(10000)).data ?? []
  const totalPoints = allCusts.reduce((s, c) => s + Number(c.points_balance ?? c.loyalty_points ?? 0), 0)
  const liability = ((totalPoints * Number(configRes.data?.point_value_cents ?? 1)) / 100).toFixed(2)

  const rewardMap: Record<string, number> = {}
  for (const t of txnsRes.data ?? []) {
    if (t.type === 'redeem' && t.reward_redeemed) rewardMap[t.reward_redeemed] = (rewardMap[t.reward_redeemed] ?? 0) + 1
  }
  const topReward = Object.entries(rewardMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A'

  const avg = (arr: { total_amount: number }[]) => arr.length > 0 ? (arr.reduce((s, r) => s + Number(r.total_amount), 0) / arr.length).toFixed(2) : '0'
  const loyaltyAvg = avg(loyaltyAvgRes.data ?? [])
  const nonLoyaltyAvg = avg(nonLoyaltyAvgRes.data ?? [])

  const userPrompt = `Loyalty program for ${biz.name} (${biz.industry ?? 'retail'}):
- Total enrolled: ${enrolled} customers
- Active this month: ${activePct}% of enrolled
- Points liability: A$${liability}
- Top redeemed reward: ${topReward}
- Avg basket WITH loyalty customer: A$${loyaltyAvg}
- Avg basket WITHOUT loyalty customer: A$${nonLoyaltyAvg}
- Program type: ${configRes.data?.program_type ?? 'points'}, ${configRes.data?.points_per_dollar ?? 1} pts per $1

Give the owner 3 specific, data-driven recommendations to improve loyalty ROI. Be concrete. Australian business context.`

  const result = await callAnthropic<Record<string, unknown>>(
    { model: 'haiku', systemPrompt: 'You are Aria, business intelligence for an Australian small business. Be specific and data-driven. No generic advice.', userPrompt, maxTokens: 400, businessId: business_id, agentKey: 'generic', role: 'data' },
    {}
  )

  return NextResponse.json({ insight: result.raw || 'Unable to generate insight at this time.' })
}

export const POST = withErrorCapture('loyalty/aria-insight', _POST)
