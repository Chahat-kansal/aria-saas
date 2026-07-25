// ARCH-CLEANUP-1 — shared community query building blocks (F4 + F5). Zero behavior change.

import type { SupabaseClient } from '@supabase/supabase-js'

// SECURITY-P4 follow-up — businesses.is_test marks a fixture/QA business (e.g. the smoke-suite's
// own test account), not a real one. Cross-business PUBLIC surfaces (global feed/Discover,
// network-wide search/reels/live streams, any ranking that mixes multiple businesses' data
// together) must exclude these — a real visitor should never see test content in a feed meant to
// represent the real network. A test business's OWN direct pages (profile, leaderboard, owner
// dashboard) are deliberately NOT filtered by this — the smoke suite and manual testing still need
// those to render normally when visited directly by id/slug.
export async function getTestBusinessIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('businesses').select('id').eq('is_test', true)
  return ((data ?? []) as Array<{ id: string }>).map(r => r.id)
}

/** PostgREST exclusion clause for `.not(col, 'in', excludeIdsClause(ids))` — returns null when
 * there's nothing to exclude, so callers can skip applying `.not(...)` entirely (an empty `()`
 * `in` list is not what we want — "exclude nothing" should mean no filter, not a query error). */
export function excludeIdsClause(ids: string[]): string | null {
  if (!ids.length) return null
  return '(' + ids.join(',') + ')'
}

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
