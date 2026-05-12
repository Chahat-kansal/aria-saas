export const STRIPE_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_ID_STARTER!,
  growth:  process.env.STRIPE_PRICE_ID_GROWTH!,
  pro:     process.env.STRIPE_PRICE_ID_PRO!,
} as const

export type PlanTier = keyof typeof STRIPE_PRICE_IDS

export function getPriceId(tier: PlanTier): string {
  const id = STRIPE_PRICE_IDS[tier]
  if (!id) throw new Error(`Stripe price ID for tier "${tier}" not configured`)
  return id
}

export function priceIdToTier(priceId: string | undefined): PlanTier | null {
  if (!priceId) return null
  const entry = Object.entries(STRIPE_PRICE_IDS).find(([, v]) => v === priceId)
  return entry ? (entry[0] as PlanTier) : null
}
