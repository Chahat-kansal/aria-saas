// ONBOARD-FIX-1 (feature-set confirmation) — industry -> recommended feature
// set, shown as a one-screen "does this look right?" checklist in onboarding
// (not a 50-item form). Each option either writes a real existing setting
// (loyalty -> pos_loyalty_config.program_enabled, already the canonical
// source per the loyalty field-mismatch fix) or gates a Sidebar nav item via
// the existing feature_flags.disabled_for_business_ids mechanism (same
// infra plan-enforcement reads — see src/lib/features.ts hasFeature()).

export interface FeatureOption {
  key: string
  label: string
  description: string
  /** Sidebar ALL_ITEMS key this feature's nav item corresponds to, gated via feature_flags. */
  navItemKey?: string
  /** feature_flags.flag_key for the nav-hide mechanism (only set when navItemKey is set). */
  flagKey?: string
  /** Writes directly to an existing per-business setting instead of a nav flag. */
  settingsField?: 'loyalty_enabled'
}

export const ALL_FEATURES: Record<string, FeatureOption> = {
  loyalty: {
    key: 'loyalty', label: 'Loyalty rewards',
    description: 'Points on every sale, redeemable for discounts.',
    settingsField: 'loyalty_enabled',
  },
  reviews: {
    key: 'reviews', label: 'Review requests',
    description: 'Automatic SMS asking happy customers to leave a Google review.',
    navItemKey: 'reviews', flagKey: 'nav_reviews',
  },
  compliance: {
    key: 'compliance', label: 'Compliance & age checks',
    description: 'Licensing/RSA tracking and age-verification logging.',
    navItemKey: 'compliance', flagKey: 'nav_compliance',
  },
  reorder: {
    key: 'reorder', label: 'Smart reorder alerts',
    description: 'Aria flags low stock before you run out.',
    navItemKey: 'reorder', flagKey: 'nav_reorder',
  },
  ordering: {
    key: 'ordering', label: 'Online ordering',
    description: 'Customers order ahead from your customer app.',
    navItemKey: 'pos-online', flagKey: 'nav_ordering',
  },
  bookings: {
    key: 'bookings', label: 'Bookings',
    description: 'Customers book a table, service, or class online.',
    navItemKey: 'bookings', flagKey: 'nav_bookings',
  },
  wholesale: {
    key: 'wholesale', label: 'Wholesale orders',
    description: 'Manage bulk/trade orders separately from retail sales.',
    navItemKey: 'wholesale', flagKey: 'nav_wholesale',
  },
}

interface FeatureDefault { key: string; defaultOn: boolean }

// Product-business industries (matches onboarding's INDUSTRIES list).
const INDUSTRY_FEATURE_SETS: Record<string, FeatureDefault[]> = {
  liquor: [
    { key: 'loyalty', defaultOn: true }, { key: 'reviews', defaultOn: true },
    { key: 'compliance', defaultOn: true }, { key: 'reorder', defaultOn: true },
  ],
  convenience: [
    { key: 'loyalty', defaultOn: true }, { key: 'reviews', defaultOn: true },
    { key: 'compliance', defaultOn: true }, { key: 'reorder', defaultOn: true },
  ],
  bakery: [
    { key: 'loyalty', defaultOn: true }, { key: 'reviews', defaultOn: true },
    { key: 'reorder', defaultOn: true }, { key: 'ordering', defaultOn: false },
  ],
  cafe: [
    { key: 'loyalty', defaultOn: true }, { key: 'reviews', defaultOn: true },
    { key: 'ordering', defaultOn: true }, { key: 'bookings', defaultOn: false },
  ],
  restaurant: [
    { key: 'loyalty', defaultOn: true }, { key: 'reviews', defaultOn: true },
    { key: 'ordering', defaultOn: true }, { key: 'bookings', defaultOn: true },
  ],
  retail: [
    { key: 'loyalty', defaultOn: true }, { key: 'reviews', defaultOn: true },
    { key: 'reorder', defaultOn: true },
  ],
  warehouse: [
    { key: 'wholesale', defaultOn: true }, { key: 'reorder', defaultOn: true },
  ],
  other: [
    { key: 'loyalty', defaultOn: true }, { key: 'reviews', defaultOn: true },
  ],
}

// All service-model industries share one default set — a service business
// (swim school, clinic, tutoring, etc.) cares about bookings/reviews far more
// than the specific sub-vertical, so one shared set avoids a 6-way matrix
// for marginal accuracy (matches "not a 50-item form" principle).
const SERVICE_FEATURE_SET: FeatureDefault[] = [
  { key: 'bookings', defaultOn: true },
  { key: 'reviews', defaultOn: true },
  { key: 'loyalty', defaultOn: false },
]

export function getFeatureSetForBusiness(industry: string, businessModel: string): Array<FeatureOption & { defaultOn: boolean }> {
  const set = businessModel === 'service'
    ? SERVICE_FEATURE_SET
    : (INDUSTRY_FEATURE_SETS[industry] ?? INDUSTRY_FEATURE_SETS.other)
  return set.map(s => ({ ...ALL_FEATURES[s.key], defaultOn: s.defaultOn }))
}

// getFeatureChoicesForBusiness / applyFeatureChoices (the supabaseAdmin-
// backed read/write core) live in industry-features-server.ts, NOT here —
// this file must stay importable from client components (the onboarding
// wizard's Feature-confirm step imports getFeatureSetForBusiness directly).
// supabase-admin.ts constructs its client at module scope using
// SUPABASE_SERVICE_ROLE_KEY, which Next.js never inlines into a browser
// bundle; merely importing that module from client code throws
// "supabaseKey is required" at hydration time (ONBOARD-WIZARD-1 — caught
// via a real Playwright run against the rebuilt wizard, not code review).
