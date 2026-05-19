export type RfmTier = 'bronze' | 'silver' | 'gold'

export function calcRFM(totalSpend: number, visitCount: number, lastVisitIso: string | null) {
  const daysSince = lastVisitIso
    ? Math.floor((Date.now() - new Date(lastVisitIso).getTime()) / 86400000)
    : 999
  const r = daysSince <= 7 ? 5 : daysSince <= 30 ? 4 : daysSince <= 60 ? 3 : daysSince <= 120 ? 2 : 1
  const f = visitCount <= 1 ? 1 : visitCount === 2 ? 2 : visitCount <= 5 ? 3 : visitCount <= 10 ? 4 : 5
  const m = totalSpend < 50 ? 1 : totalSpend < 200 ? 2 : totalSpend < 500 ? 3 : totalSpend < 1000 ? 4 : 5
  const total = r + f + m
  const tier: RfmTier = total <= 6 ? 'bronze' : total <= 10 ? 'silver' : 'gold'
  return { r, f, m, total, tier, daysSince }
}

export const TIER_COLOR: Record<RfmTier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold:   '#FFD700',
}
