export const TIERS = {
  bronze: { min_spend: 0,    min_visits: 0,  multiplier: 1.0 },
  silver: { min_spend: 500,  min_visits: 20, multiplier: 1.5 },
  gold:   { min_spend: 2000, min_visits: 50, multiplier: 2.0 },
} as const

export type LoyaltyTier = keyof typeof TIERS

export function getTier(lifetimeSpend: number, visitCount: number): LoyaltyTier {
  if (lifetimeSpend >= TIERS.gold.min_spend || visitCount >= TIERS.gold.min_visits) return 'gold'
  if (lifetimeSpend >= TIERS.silver.min_spend || visitCount >= TIERS.silver.min_visits) return 'silver'
  return 'bronze'
}

export function calcEarn(saleTotal: number, pointsPerDollar: number, tier: LoyaltyTier): number {
  return Math.floor(saleTotal * pointsPerDollar * TIERS[tier].multiplier)
}

export const TIER_BADGE: Record<LoyaltyTier, { label: string; color: string }> = {
  bronze: { label: 'Bronze', color: '#CD7F32' },
  silver: { label: 'Silver', color: '#C0C0C0' },
  gold:   { label: 'Gold',   color: '#FFD700' },
}
