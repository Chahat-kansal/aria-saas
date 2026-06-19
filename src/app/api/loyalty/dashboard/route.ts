export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getLoyaltyCustomer } from '@/lib/loyalty/auth'
import { getTier, TIERS, TIER_BADGE, type LoyaltyTier } from '@/lib/loyalty'

// LOY-P2-DASHBOARD — read-only data for the authed customer's own loyalty dashboard.
// SCOPE: the customer is resolved ONLY from the session cookie via getLoyaltyCustomer();
// this route NEVER reads a customer_id from the request — no IDOR. Every figure is a real
// DB value (balance/stamps/spend/tier/history); nothing invented. No mutations here.

export async function GET() {
  const me = await getLoyaltyCustomer()
  if (!me) return NextResponse.json({ customer: null })

  const { customer_id, business_id, name } = me

  const [{ data: cust }, { data: cfg }, { data: txns }] = await Promise.all([
    supabaseAdmin.from('pos_customers')
      .select('points_balance, loyalty_points, stamps_count, total_spent, total_spend, visit_count')
      .eq('id', customer_id).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_config')
      .select('program_type, points_per_dollar, point_value_cents, stamps_to_reward, stamp_reward_text')
      .eq('business_id', business_id).maybeSingle(),
    // Own rows only — scoped to this customer AND business.
    supabaseAdmin.from('pos_loyalty_transactions')
      .select('type, points_delta, stamps_delta, reward_redeemed, created_at')
      .eq('customer_id', customer_id).eq('business_id', business_id)
      .order('created_at', { ascending: false }).limit(20),
  ])

  const programType = (cfg?.program_type ?? 'points') === 'stamps' ? 'stamps' : 'points'
  const balance = Number(cust?.points_balance ?? cust?.loyalty_points ?? 0)
  const stamps = Number(cust?.stamps_count ?? 0)
  const pointValueCents = Number(cfg?.point_value_cents ?? 1)
  const spend = Number(cust?.total_spent ?? cust?.total_spend ?? 0)
  const visits = Number(cust?.visit_count ?? 0)
  const stampsTarget = Math.max(1, Number(cfg?.stamps_to_reward ?? 10))
  const stampRewardText = (cfg?.stamp_reward_text as string) ?? 'a free reward'

  // Tier (points mode only) — uses the SAME spend/visit thresholds as the earn path (lib/loyalty.ts).
  let tier: {
    current: LoyaltyTier; current_label: string; current_color: string; multiplier: number
    next: LoyaltyTier | null; next_label: string | null; progress_pct: number; to_next_spend: number
  } | null = null
  if (programType === 'points') {
    const order: LoyaltyTier[] = ['bronze', 'silver', 'gold']
    const current = getTier(spend, visits)
    const idx = order.indexOf(current)
    const next = idx < order.length - 1 ? order[idx + 1] : null
    let progressPct = 100, toNextSpend = 0, nextLabel: string | null = null
    if (next) {
      const prev = TIERS[current].min_spend
      const target = TIERS[next].min_spend
      progressPct = Math.max(0, Math.min(100, Math.round(((spend - prev) / (target - prev)) * 100)))
      toNextSpend = Math.max(0, Math.round((target - spend) * 100) / 100)
      nextLabel = TIER_BADGE[next].label
    }
    tier = {
      current, current_label: TIER_BADGE[current].label, current_color: TIER_BADGE[current].color,
      multiplier: TIERS[current].multiplier, next, next_label: nextLabel, progress_pct: progressPct, to_next_spend: toNextSpend,
    }
  }

  const activity = (txns ?? []).map(t => ({
    type: (t.type as string) ?? 'earn',
    points_delta: Number(t.points_delta ?? 0),
    stamps_delta: Number(t.stamps_delta ?? 0),
    reward_redeemed: (t.reward_redeemed as string | null) ?? null,
    created_at: t.created_at as string,
  }))

  const dollarValue = Math.round(balance * pointValueCents) / 100

  return NextResponse.json({
    customer: { name },
    program_type: programType,
    points: { balance, dollar_value: dollarValue, point_value_cents: pointValueCents },
    stamps: { count: stamps, target: stampsTarget, remaining: Math.max(0, stampsTarget - stamps), reward_text: stampRewardText },
    tier,
    reward_available: programType === 'stamps'
      ? { available: stamps >= stampsTarget, text: stampRewardText }
      : { available: dollarValue >= 1, dollars: dollarValue },
    activity,
    // Empty state: brand-new customer with nothing yet — never fabricate points.
    empty: activity.length === 0 && (programType === 'points' ? balance === 0 : stamps === 0),
  })
}
