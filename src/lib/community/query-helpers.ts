// ARCH-CLEANUP-1 — shared community query building blocks (F4 + F5). Zero behavior change.

// F4 — the SUPERSET business-card embed: every column ANY community route currently selects on the
// `businesses` embed. Using one constant everywhere means no route can silently LOSE a field; a route
// gaining an unused column (e.g. block now also returns suburb) is intentional and harmless.
// Columns observed across the 11 routes: name, logo_url (all) · community_verified (most) ·
// industry/suburb/city (feed, engagement, marketplace, search) · website (marketplace/[id]).
export const COMMUNITY_BUSINESS_CARD =
  'businesses(name, logo_url, community_verified, industry, suburb, city, website)'

// F5 — collapse the per-type engagement count fan-out into one grouped tally, with ZERO-FILL.
// A member with 0 of a type returns 0 (never undefined/missing) — this is the failure mode the
// refactor must avoid, so every known type is initialised to 0.
export const ENGAGEMENT_TYPES = ['like', 'save', 'comment', 'share', 'view'] as const
export type EngagementCounts = Record<(typeof ENGAGEMENT_TYPES)[number], number>

export function tallyEngagementTypes(
  rows: Array<{ engagement_type: string | null }> | null | undefined,
): EngagementCounts {
  const counts: EngagementCounts = { like: 0, save: 0, comment: 0, share: 0, view: 0 } // zero-fill
  for (const r of rows ?? []) {
    const t = r.engagement_type
    if (t && t in counts) counts[t as keyof EngagementCounts]++
  }
  return counts
}
