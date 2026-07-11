// SETTINGS-FEATURES-1 — the onboarding feature-set step promises "you can
// change any of this later in Settings"; these two functions are the shared
// read/write core for both onboarding submit AND the settings Features tab,
// so the two surfaces can never drift onto different logic for the same
// feature_flags.disabled_for_business_ids / pos_loyalty_config.program_enabled
// writes. Split into its own file (ONBOARD-WIZARD-1) — supabaseAdmin's
// module-scope client construction must never be reachable from a
// 'use client' import graph (see industry-features.ts's comment); every
// consumer here is a server route.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ALL_FEATURES } from '@/lib/industry-features'

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
