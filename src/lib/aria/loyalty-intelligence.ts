import type { SupabaseClient } from '@supabase/supabase-js'

export interface LoyaltyStats {
  configured: boolean
  members: number
  newMembers30d: number
  pointsOutstanding: number
  redemptions30d: number
  attachmentRate: number   // % of sales in last 30d that had a customer attached (loyalty health signal)
  attachedSales30d: number
  totalSales30d: number
  checkinCount7d: number   // counter QR / camera check-ins in last 7 days
}

// Loyalty counters for the daily briefing + weekly report. Single source so both reuse it.
export async function getLoyaltyStats(db: SupabaseClient, businessId: string): Promise<LoyaltyStats> {
  const since   = new Date(Date.now() - 30 * 86400000).toISOString()
  const since7d = new Date(Date.now() -  7 * 86400000).toISOString()
  const [cfg, members, newMembers, redemptions, balances, totalSales, attachedSales, checkins7d] = await Promise.all([
    db.from('pos_loyalty_config').select('business_id').eq('business_id', businessId).maybeSingle(),
    db.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    db.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', since),
    db.from('pos_loyalty_transactions').select('id', { count: 'exact', head: true }).eq('business_id', businessId).not('reward_redeemed', 'is', null).gte('created_at', since),
    db.from('pos_customers').select('points_balance, loyalty_points').eq('business_id', businessId).limit(2000),
    db.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'completed').gte('created_at', since),
    db.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'completed').gte('created_at', since).not('customer_id', 'is', null),
    db.from('loyalty_checkins').select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', since7d),
  ])

  let pointsOutstanding = 0
  for (const c of balances.data ?? []) pointsOutstanding += Number(c.points_balance ?? c.loyalty_points ?? 0)

  const totalSales30d = totalSales.count ?? 0
  const attachedSales30d = attachedSales.count ?? 0
  const attachmentRate = totalSales30d > 0 ? Math.round((attachedSales30d / totalSales30d) * 100) : 0

  return {
    configured: !!cfg.data,
    members: members.count ?? 0,
    newMembers30d: newMembers.count ?? 0,
    pointsOutstanding,
    redemptions30d: redemptions.count ?? 0,
    attachmentRate,
    attachedSales30d,
    totalSales30d,
    checkinCount7d: checkins7d.count ?? 0,
  }
}

export function hasLoyaltySignal(s: LoyaltyStats): boolean {
  return s.configured && (s.members > 0 || s.newMembers30d > 0 || s.redemptions30d > 0)
}
