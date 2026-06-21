export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'

// LOY-NETWORK — read-only data for the authed customer's MEMBERSHIP at one business. SCOPE: the
// identity is resolved from the session cookie; the membership (pos_customers row) is resolved by
// (identity, business_id). The business_id selects which of the customer's OWN memberships is shown —
// no cross-identity access (the lookup is scoped to their identity). Nothing invented; no mutations.

export async function GET(req: Request) {
  const bidParam = new URL(req.url).searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ customer: null })
  const me = await getLoyaltyMembership(realId)
  if (!me) return NextResponse.json({ customer: null })

  const { customer_id, business_id, name } = me

  const [{ data: cust }, { data: cfg }, { data: txns }] = await Promise.all([
    supabaseAdmin.from('pos_customers')
      .select('points_balance, loyalty_points, stamps_count, total_spent, total_spend, visit_count')
      .eq('id', customer_id).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_config')
      .select('program_type, points_per_dollar, point_value_cents, stamps_to_reward, stamp_reward_text, tier_silver_points, tier_gold_points, tier_platinum_points')
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
  const stampsTarget = Math.max(1, Number(cfg?.stamps_to_reward ?? 10))
  const stampRewardText = (cfg?.stamp_reward_text as string) ?? 'a free reward'

  // Tier (points mode) — driven by the owner's CONFIGURED point thresholds (pos_loyalty_config),
  // the single source of truth. Everyone starts Bronze; Silver/Gold/Platinum unlock at the configured
  // points (measured against the member's points balance). Omitted entirely if no tier is configured
  // (no fabricated tiers). LOY-CONFIG-COMPLETE: replaces the old hardcoded spend thresholds so owner
  // edits to tier_*_points now drive what the customer sees.
  let tier: {
    current: string; current_label: string; current_color: string
    next: string | null; next_label: string | null; progress_pct: number; to_next_points: number
  } | null = null
  if (programType === 'points') {
    const ladder = [
      { key: 'bronze', label: 'Bronze', color: '#CD7F32', threshold: 0 },
      { key: 'silver', label: 'Silver', color: '#C0C0C0', threshold: Math.max(0, Number(cfg?.tier_silver_points ?? 0)) },
      { key: 'gold', label: 'Gold', color: '#FFD700', threshold: Math.max(0, Number(cfg?.tier_gold_points ?? 0)) },
      { key: 'platinum', label: 'Platinum', color: '#E5E4E2', threshold: Math.max(0, Number(cfg?.tier_platinum_points ?? 0)) },
    ].filter((t, i) => i === 0 || t.threshold > 0).sort((a, b) => a.threshold - b.threshold)

    if (ladder.length > 1) {
      let curIdx = 0
      for (let i = 0; i < ladder.length; i++) if (balance >= ladder[i].threshold) curIdx = i
      const cur = ladder[curIdx]
      const nxt = ladder[curIdx + 1] ?? null
      let progressPct = 100, toNextPoints = 0, nextLabel: string | null = null
      if (nxt) {
        const span = Math.max(1, nxt.threshold - cur.threshold)
        progressPct = Math.max(0, Math.min(100, Math.round(((balance - cur.threshold) / span) * 100)))
        toNextPoints = Math.max(0, nxt.threshold - balance)
        nextLabel = nxt.label
      }
      tier = {
        current: cur.key, current_label: cur.label, current_color: cur.color,
        next: nxt?.key ?? null, next_label: nextLabel, progress_pct: progressPct, to_next_points: toNextPoints,
      }
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
