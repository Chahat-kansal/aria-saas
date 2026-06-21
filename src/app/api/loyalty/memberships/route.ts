export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getLoyaltyIdentity } from '@/lib/loyalty/auth'
import { decryptCustomerPII } from '@/lib/aria/customer-pii'

// LOY-WALLET-1 — list ALL of the signed-in identity's memberships across businesses (the wallet hub).
// Identity-scoped ONLY (resolved from the session cookie) — never another identity's rows; no business
// filter. Points/tier/stamps stay per-business; this aggregates the VIEW, it does not merge balances.

const TIER_COLORS: Record<string, string> = { bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700', platinum: '#E5E4E2' }

export async function GET() {
  const identity = await getLoyaltyIdentity()
  if (!identity) return NextResponse.json({ memberships: null }, { status: 401 })

  const { data: rows } = await supabaseAdmin.from('pos_customers')
    .select('id, business_id, name, name_enc, points_balance, loyalty_points, stamps_count, loyalty_tier')
    .eq('loyalty_identity_id', identity.id)
  const memberships = rows ?? []
  if (memberships.length === 0) return NextResponse.json({ name: null, email: identity.email, memberships: [] })

  const bizIds = [...new Set(memberships.map(m => m.business_id as string))]
  const [{ data: bizes }, { data: cfgs }] = await Promise.all([
    supabaseAdmin.from('businesses').select('id, name, logo_url').in('id', bizIds),
    supabaseAdmin.from('pos_loyalty_config')
      .select('business_id, program_type, point_value_cents, stamps_to_reward, stamp_reward_text, tier_silver_points, tier_gold_points, tier_platinum_points')
      .in('business_id', bizIds),
  ])
  const bizMap = new Map((bizes ?? []).map(b => [b.id as string, b]))
  const cfgMap = new Map((cfgs ?? []).map(c => [c.business_id as string, c]))

  let displayName: string | null = null
  const out = memberships.map(m => {
    const biz = bizMap.get(m.business_id as string)
    const cfg = cfgMap.get(m.business_id as string)
    const programType = (cfg?.program_type ?? 'points') === 'stamps' ? 'stamps' : 'points'
    const balance = Number(m.points_balance ?? m.loyalty_points ?? 0)
    const stamps = Number(m.stamps_count ?? 0)
    const pvc = Number(cfg?.point_value_cents ?? 1)
    const stampsTarget = Math.max(1, Number(cfg?.stamps_to_reward ?? 10))

    let memberName: string | null = (m.name as string | null) ?? null
    try { memberName = decryptCustomerPII(m as Record<string, unknown>, m.business_id as string).name ?? memberName } catch { /* keep plaintext */ }
    if (!displayName && memberName) displayName = memberName

    // Tier (points mode) — owner-configured thresholds vs the member's points (same as the dashboard).
    let tier: { current_label: string; current_color: string; next_label: string | null; progress_pct: number; to_next_points: number } | null = null
    if (programType === 'points') {
      const ladder = [
        { key: 'bronze', label: 'Bronze', threshold: 0 },
        { key: 'silver', label: 'Silver', threshold: Math.max(0, Number(cfg?.tier_silver_points ?? 0)) },
        { key: 'gold', label: 'Gold', threshold: Math.max(0, Number(cfg?.tier_gold_points ?? 0)) },
        { key: 'platinum', label: 'Platinum', threshold: Math.max(0, Number(cfg?.tier_platinum_points ?? 0)) },
      ].filter((t, i) => i === 0 || t.threshold > 0).sort((a, b) => a.threshold - b.threshold)
      if (ladder.length > 1) {
        let curIdx = 0
        for (let i = 0; i < ladder.length; i++) if (balance >= ladder[i].threshold) curIdx = i
        const cur = ladder[curIdx]; const nxt = ladder[curIdx + 1] ?? null
        let progressPct = 100, toNextPoints = 0, nextLabel: string | null = null
        if (nxt) {
          const span = Math.max(1, nxt.threshold - cur.threshold)
          progressPct = Math.max(0, Math.min(100, Math.round(((balance - cur.threshold) / span) * 100)))
          toNextPoints = Math.max(0, nxt.threshold - balance); nextLabel = nxt.label
        }
        tier = { current_label: cur.label, current_color: TIER_COLORS[cur.key], next_label: nextLabel, progress_pct: progressPct, to_next_points: toNextPoints }
      }
    }

    return {
      business_id: m.business_id,
      business_name: (biz?.name as string) ?? 'Rewards',
      logo_url: (biz?.logo_url as string | null) ?? null,
      program_type: programType,
      points_balance: balance,
      dollar_value: Math.round(balance * pvc) / 100,
      stamps_count: stamps,
      stamps_target: stampsTarget,
      stamp_reward_text: (cfg?.stamp_reward_text as string) ?? 'a free reward',
      tier,
    }
  })

  return NextResponse.json({ name: displayName, email: identity.email, memberships: out })
}
