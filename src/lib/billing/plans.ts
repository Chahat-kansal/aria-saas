import type { Plan } from '@/lib/plans/resolve-plan'

// SS-1 — the plans registry: the single canonical source for price/limits/capability-section
// data per plan. Config, not constants scattered across call sites — a price or limit change is
// an edit here, never a redeploy of gating logic. CONFIG-ONLY for SS-1 (no DB-backed `plans`
// table): nothing in this sprint needs an owner/admin to edit these values through a UI, and a
// config module is simpler to review/diff than a seeded table for values that only change via a
// deliberate pricing decision. Revisit as a DB table only if/when self-serve plan editing is
// actually needed — this file stays the single source either way.
//
// Founder-confirmed matrix (2026-07-28) — build to these EXACT values, do not invent:
//   plan_key | price/mo | ai_budget_usd/mo | max_outlets | max_staff
//   starter  | $297     | $20              | 1           | 5
//   growth   | $597     | $50              | 3           | 15
//   pro      | $997     | $120             | null (unlim)| null (unlim)
//
// "unlimited" is stored as `null`, never a magic number — src/lib/billing/entitlement.ts treats
// null as no cap. ai_budget_usd is a DOLLAR AI-cost budget, not a token count: Haiku/Sonnet/Opus
// costs vary 3-25x per token, so a blended token number would be misleading. It maps onto the
// existing aria_ai_calls.cost_usd_cents / aria_daily_spend infra SS-4 reads to meter real spend.
// Over-limit policy is SOFT-WARN (warn at 80%/100%, never block an in-flight Aria action) — SS-1
// only stores the number; SS-4 implements the warning.
export interface PlanDef {
  plan_key: Plan
  price_usd: number
  ai_budget_usd: number
  max_outlets: number | null
  max_staff: number | null
  /**
   * MS13 PHASE 6 — owner-built agents per tier (null = unlimited). The brief fixes these:
   * starter 2 / growth 5 / pro unlimited.
   */
  max_agents: number | null
  /**
   * Scheduled routines per tier. The brief says "routines capped" WITHOUT giving numbers, so
   * these MIRROR max_agents rather than inventing a second scale — flagged for the founder, and
   * revertible in one edit here (config, not logic). GROUNDING-TEETH: a made-up number stated as
   * a decision is worse than a stated mirror.
   */
  max_routines: number | null
  /** Sidebar.tsx `section` values this plan unlocks (cumulative — see SECTIONS_BY_TIER below). */
  sections: string[]
  /** Stripe Price ID for Checkout — filled in SS-2, null until then (no Stripe integration in SS-1). */
  stripe_price_id: string | null
}

// SS-1 — capability tiers, mapped onto Sidebar.tsx's REAL section taxonomy (SECTION_ORDER,
// Sidebar.tsx:179), not an invented scheme. Founder-approved additions per tier:
//   starter: Overview, Operations, Revenue
//   growth:  + Marketing, Reputation
//   pro:     + Intelligence, Warehouse, Pro tools (quote-builder/compliance/recipes — matches
//            the existing Pro-only quote-gen rule exactly)
//
// UNIVERSAL_SECTIONS below are the 4 real Sidebar.tsx sections the founder-approved matrix does
// NOT mention (Modules, Settings, Customer surfaces, and the nav section literally named
// 'Growth' — unrelated to the 'growth' PLAN key despite the identical word; do not confuse the
// two). Per the brief's own stated philosophy ("all three tiers get the full ecosystem; tiers
// scale with business SIZE, not by crippling features"), every plan gets these — 'Modules'
// contains AriaPOS itself, which every business needs regardless of tier. This is a deliberate,
// flagged assumption (not something the founder's matrix explicitly confirmed) since the matrix
// was a short, targeted list of what's exclusively gated, not an exhaustive enumeration of every
// real section — surfaced here for review, not silently decided.
const UNIVERSAL_SECTIONS = ['Modules', 'Settings', 'Customer surfaces', 'Growth']

const STARTER_SECTIONS = [...UNIVERSAL_SECTIONS, 'Overview', 'Operations', 'Revenue']
const GROWTH_SECTIONS = [...STARTER_SECTIONS, 'Marketing', 'Reputation']
const PRO_SECTIONS = [...GROWTH_SECTIONS, 'Intelligence', 'Warehouse', 'Pro tools']

export const PLANS: Record<Plan, PlanDef> = {
  starter: {
    plan_key: 'starter', price_usd: 297, ai_budget_usd: 20,
    max_outlets: 1, max_staff: 5,
    max_agents: 2, max_routines: 2,
    sections: STARTER_SECTIONS, stripe_price_id: null,
  },
  growth: {
    plan_key: 'growth', price_usd: 597, ai_budget_usd: 50,
    max_outlets: 3, max_staff: 15,
    max_agents: 5, max_routines: 5,
    sections: GROWTH_SECTIONS, stripe_price_id: null,
  },
  pro: {
    plan_key: 'pro', price_usd: 997, ai_budget_usd: 120,
    max_outlets: null, max_staff: null,
    max_agents: null, max_routines: null,
    sections: PRO_SECTIONS, stripe_price_id: null,
  },
}

// SS-1 — this codebase already has an INDEPENDENT, already-LIVE, already-server-enforced
// per-feature plan gate (`feature_flags` table + src/lib/features.ts's hasFeature/requireFeature,
// shipped 2026-06-15, enforced today on 6 real routes: warehouse/replenish, competitor-prices,
// winback-send, weekly-order, receipt-scan, custom-features). That system gates individual
// features (e.g. `competitor_analysis`=pro-only, `weekly_orders`=growth+) — a FINER granularity
// than this file's section-level gating, and its tier assignments do not all agree with the
// section map above (e.g. `competitor_analysis` is pro-only today, but its nav item — Competitor
// watch — lives in the 'Reputation' section, which this file puts at growth). SS-1 does not
// touch, replace, or enforce against that system — it is untouched and keeps working exactly as
// it does today. This is flagged, not silently reconciled, because SS-3 (actual enforcement) will
// need a founder decision on whether section-level and flag-level gating should be merged,
// and if so which one wins on the overlapping cases. Out of scope for SS-1, which only resolves
// entitlement — it does not enforce anything.
export const KNOWN_FEATURE_FLAG_VS_SECTION_MISMATCH_NOTE =
  'See PLANS module comment — feature_flags (per-feature) and PLANS.sections (per-section) ' +
  'disagree on some items (e.g. competitor_analysis=pro-only vs Reputation=growth). Unreconciled by design in SS-1.'
