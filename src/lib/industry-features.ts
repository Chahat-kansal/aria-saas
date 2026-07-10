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

// SETTINGS-FEATURES-1 — the onboarding feature-set step promises "you can
// change any of this later in Settings"; these two functions are the shared
// read/write core for both onboarding submit AND the settings Features tab,
// so the two surfaces can never drift onto different logic for the same
// feature_flags.disabled_for_business_ids / pos_loyalty_config.program_enabled
// writes. Moved here (out of onboarding/submit/route.ts) so a settings route
// can reuse it without importing another route file as a module.
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function getFeatureChoicesForBusiness(businessId: string): Promise<Record<string, boolean>> {
  const flagKeys = Object.values(ALL_FEATURES).map(f => f.flagKey).filter((k): k is string => !!k)
  const [{ data: loyaltyConfig }, { data: flags }] = await Promise.all([
    supabaseAdmin.from('pos_loyalty_config').select('program_enabled').eq('business_id', businessId).maybeSingle(),
    flagKeys.length > 0
      ? supabaseAdmin.from('feature_flags').select('flag_key, disabled_for_business_ids').in('flag_key', flagKeys)
      : Promise.resolve({ data: [] as Array<{ flag_key: string; disabled_for_business_ids: string[] | null }> }),
  ])

  const disabledByFlagKey = new Set(
    (flags ?? [])
      .filter(f => ((f.disabled_for_business_ids as string[] | null) ?? []).includes(businessId))
      .map(f => f.flag_key as string),
  )

  const choices: Record<string, boolean> = {}
  for (const feature of Object.values(ALL_FEATURES)) {
    if (feature.settingsField === 'loyalty_enabled') {
      choices[feature.key] = loyaltyConfig?.program_enabled ?? false
    } else if (feature.flagKey) {
      choices[feature.key] = !disabledByFlagKey.has(feature.flagKey)
    }
  }
  return choices
}

export async function applyFeatureChoices(businessId: string, choices: Record<string, boolean>): Promise<void> {
  for (const feature of Object.values(ALL_FEATURES)) {
    const chosen = choices[feature.key]
    if (chosen === undefined) continue

    if (feature.settingsField === 'loyalty_enabled') {
      await supabaseAdmin.from('pos_loyalty_config')
        .upsert({ business_id: businessId, program_enabled: chosen }, { onConflict: 'business_id' })
      continue
    }

    if (feature.flagKey) {
      const { data: flag } = await supabaseAdmin.from('feature_flags')
        .select('disabled_for_business_ids').eq('flag_key', feature.flagKey).maybeSingle()
      const current: string[] = (flag?.disabled_for_business_ids as string[] | null) ?? []
      const wasDisabled = current.includes(businessId)
      if (chosen === wasDisabled) {
        // chosen=true & currently disabled -> re-enable; chosen=false & not yet disabled -> disable
        const next = chosen ? current.filter(id => id !== businessId) : [...current, businessId]
        await supabaseAdmin.from('feature_flags')
          .update({ disabled_for_business_ids: next, updated_at: new Date().toISOString() })
          .eq('flag_key', feature.flagKey)
      }
    }
  }
}
