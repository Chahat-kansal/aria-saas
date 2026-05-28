import type { SupabaseClient } from '@supabase/supabase-js'

export interface LoyaltyStats {
  configured: boolean
  members: number
  newMembers30d: number
  pointsOutstanding: number
  redemptions30d: number
}

// Loyalty counters for the daily briefing + weekly report. Single source so both reuse it.
export async function getLoyaltyStats(db: SupabaseClient, businessId: string): Promise<LoyaltyStats> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [cfg, members, newMembers, redemptions, balances] = await Promise.all([
    db.from('pos_loyalty_config').select('business_id').eq('business_id', businessId).maybeSingle(),
    db.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', since),
    db.from('pos_loyalty_transactions').select('id', { count: 'exact', head: true }).eq('business_id', businessId).not('reward_redeemed', 'is', null).gte('created_at', since),
    db.from('pos_customers').select('points_balance, loyalty_points').eq('business_id', businessId).limit(2000),
  ])

  let pointsOutstanding = 0
  for (const c of balances.data ?? []) pointsOutstanding += Number(c.points_balance ?? c.loyalty_points ?? 0)

  return {
    configured: !!cfg.data,
    members: members.count ?? 0,
    newMembers30d: newMembers.count ?? 0,
    pointsOutstanding,
    redemptions30d: redemptions.count ?? 0,
  }
}

export function hasLoyaltySignal(s: LoyaltyStats): boolean {
  return s.configured && (s.members > 0 || s.newMembers30d > 0 || s.redemptions30d > 0)
}
