import { supabaseAdmin } from '@/lib/supabase-admin'
import { getEffectivePlan, isTrialing, trialExpired, type Plan } from '@/lib/plans/resolve-plan'
import { PLANS } from '@/lib/billing/plans'

export type EntitlementStatus = 'trialing' | 'active' | 'lapsed' | 'none'

export interface Entitlement {
  plan_key: Plan
  status: EntitlementStatus
  sections: string[]
  max_outlets: number | null
  max_staff: number | null
  // MS13 PHASE 6 — agent/routine caps ride the SAME canonical entitlement path MS12 established
  // (businesses.plan → getEffectivePlan → PLANS), so a tier change moves them with everything else.
  max_agents: number | null
  max_routines: number | null
  ai_budget_usd: number
  is_trial: boolean
}

// SS-1 — the single source every future gate calls. Pure resolution: computes entitlement, does
// NOT block or enforce anything (SS-3's job) — safe to land before Stripe exists (SS-2) since
// nothing yet depends on its output changing app behavior. Server-only (supabaseAdmin), and
// tenant-safe by construction: resolves exactly the passed business_id via a single .eq() filter,
// never a cross-business query.
export async function getEntitlement(business_id: string): Promise<Entitlement> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('plan, subscription_status, trial_ends_at, stripe_subscription_id, plan_override_by')
    .eq('id', business_id)
    .maybeSingle()

  // Reuses the existing, already-live plan-resolution primitives (resolve-plan.ts) rather than
  // reimplementing trial/override logic — businesses.plan is the canonical source those already
  // read (SS commit 0abd33a9, 2026-06-15); this file only adds the richer entitlement shape
  // (sections/limits/ai_budget) that system never had.
  const plan_key = getEffectivePlan(biz)
  const trialing = isTrialing(biz?.subscription_status)
  const expired = trialExpired(biz?.trial_ends_at)
  const is_trial = trialing && !expired

  let status: EntitlementStatus
  if (biz?.plan_override_by) status = 'active' // admin grant always wins, matches getEffectivePlan
  else if (is_trial) status = 'trialing'
  else if (biz?.stripe_subscription_id) status = 'active'
  else if (trialing && expired) status = 'lapsed' // SS-3 defines what a lapsed business can still do
  else status = biz ? 'active' : 'none' // no business row at all → 'none'; otherwise signup default

  const planDef = PLANS[plan_key]

  // AI budget: the plan registry's value wins unless business_subscriptions.sonnet_monthly_budget_cents
  // was explicitly customized away from its column default (3000 = $30/mo) — founder-confirmed
  // reconciliation (2026-07-28) so a real per-business override set before this sprint isn't
  // silently discarded, without inventing a new "is this custom" column that doesn't exist.
  const { data: sub } = await supabaseAdmin
    .from('business_subscriptions')
    .select('sonnet_monthly_budget_cents')
    .eq('business_id', business_id)
    .maybeSingle()
  const DEFAULT_BUDGET_CENTS = 3000
  const ai_budget_usd =
    sub?.sonnet_monthly_budget_cents != null && sub.sonnet_monthly_budget_cents !== DEFAULT_BUDGET_CENTS
      ? sub.sonnet_monthly_budget_cents / 100
      : planDef.ai_budget_usd

  return {
    plan_key,
    status,
    sections: planDef.sections,
    max_outlets: planDef.max_outlets,
    max_staff: planDef.max_staff,
    max_agents: planDef.max_agents,
    max_routines: planDef.max_routines,
    ai_budget_usd,
    is_trial,
  }
}
