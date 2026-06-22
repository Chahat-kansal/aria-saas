import { supabaseAdmin } from '@/lib/supabase-admin'

// LOY-TIER-PERKS — per-tier benefits. A member's tier is derived from their REAL points_balance against
// pos_loyalty_config tier_silver/gold/platinum_points (the only tier source; loyalty_tiers is dead).
// The headline perk, points_multiplier, grants BONUS earn through the EXISTING ledger on a real sale,
// idempotent per (perk, sale) via loyalty_tier_perk_grants.

export type Tier = 'platinum' | 'gold' | 'silver' | null

export interface TierThresholds { silver: number; gold: number; platinum: number; pointsPerDollar: number }

export async function getTierConfig(businessId: string): Promise<TierThresholds> {
  const { data } = await supabaseAdmin.from('pos_loyalty_config')
    .select('tier_silver_points, tier_gold_points, tier_platinum_points, points_per_dollar').eq('business_id', businessId).maybeSingle()
  return {
    silver: Number(data?.tier_silver_points ?? 500),
    gold: Number(data?.tier_gold_points ?? 1500),
    platinum: Number(data?.tier_platinum_points ?? 5000),
    pointsPerDollar: Number(data?.points_per_dollar ?? 1),
  }
}

/** Highest tier whose threshold the balance meets; null below silver. */
export function tierForBalance(balance: number, t: TierThresholds): Tier {
  const b = Number(balance) || 0
  if (b >= t.platinum) return 'platinum'
  if (b >= t.gold) return 'gold'
  if (b >= t.silver) return 'silver'
  return null
}

export interface TierPerk { id: string; tier: string; perk_type: string; perk_value: number | null; config: Record<string, unknown> | null; is_active: boolean }

/** Active perks for a given tier at a business. */
export async function getActivePerks(businessId: string, tier: Exclude<Tier, null>): Promise<TierPerk[]> {
  const { data } = await supabaseAdmin.from('loyalty_tier_perks')
    .select('id, tier, perk_type, perk_value, config, is_active')
    .eq('business_id', businessId).eq('tier', tier).eq('is_active', true)
  return (data ?? []) as TierPerk[]
}

async function awardViaLedger(customerId: string, businessId: string, points: number): Promise<void> {
  if (points <= 0) return
  await supabaseAdmin.rpc('increment_loyalty_points', { customer_id: customerId, points })
  await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customerId, p_column: 'points_balance', p_amount: points })
  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id: businessId, customer_id: customerId, sale_id: null, type: 'earn', points_delta: points, created_at: new Date().toISOString(),
  })
}

/**
 * Apply the member's tier points_multiplier as BONUS earn on a real sale. The base earn is handled by the
 * untouched earn block in pos/sale; this credits only the extra (base × (multiplier − 1)). Tier is computed
 * from the member's real points_balance; bonus is grounded in the real sale total. Idempotent per (perk, sale).
 */
export async function applyTierEarnPerks(customerId: string, businessId: string, saleId: string): Promise<void> {
  const { data: sale } = await supabaseAdmin.from('pos_sales')
    .select('total_amount, status').eq('id', saleId).eq('business_id', businessId).maybeSingle()
  if (!sale || sale.status === 'voided') return
  const total = Number(sale.total_amount ?? 0)
  if (total <= 0) return

  const { data: cust } = await supabaseAdmin.from('pos_customers').select('points_balance').eq('id', customerId).maybeSingle()
  if (!cust) return

  const cfg = await getTierConfig(businessId)
  const tier = tierForBalance(Number(cust.points_balance ?? 0), cfg)
  if (!tier) return

  const perks = await getActivePerks(businessId, tier)
  const mult = perks.find(p => p.perk_type === 'points_multiplier')
  if (!mult) return
  const multiplier = Number(mult.perk_value ?? 1)
  if (multiplier <= 1) return

  const base = Math.floor(cfg.pointsPerDollar * total)
  const bonus = Math.round(base * (multiplier - 1))
  if (bonus <= 0) return

  // Idempotency claim: UNIQUE(perk_id, sale_id) blocks a second grant for this sale.
  const { error } = await supabaseAdmin.from('loyalty_tier_perk_grants')
    .insert({ perk_id: mult.id, business_id: businessId, customer_id: customerId, sale_id: saleId, points_awarded: bonus })
  if (error) return
  await awardViaLedger(customerId, businessId, bonus)
}
