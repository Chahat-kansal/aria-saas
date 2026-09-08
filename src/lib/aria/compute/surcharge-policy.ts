import { makeProvenance, type ComputeResult } from './provenance'
import type { ItemImpact } from './item-card-impact'

/**
 * M14 PHASE 3 — PROPOSE, DON'T PRICE.
 *
 * This module turns "you lose 1.32% of takings on 1 October" into a set of prices the owner can
 * approve, reject or edit. **It writes nothing.** The proposal goes out through `createDecision`
 * into `aria_autopilot_actions` as a `bulk_price_update` — a capability that is already
 * `propose_only` with gate reason `money`, already in `DESTRUCTIVE_ACTION_TYPES`, and already
 * carries a kill switch, a role gate, a mass-mutation backstop and an append-only audit log.
 * **No second pricing engine, and no new power.**
 *
 * ── ⚠️ ROUNDING IS A PROPOSAL FEATURE, NOT SILENT BEHAVIOUR ────────────────────────────────────
 * A 1.32% rise turns $4.50 into $4.5594. Nobody prices a flat white at $4.5594, so it has to be
 * rounded — and rounding always over- or under-recovers. Every rounded line therefore carries its
 * **drift**: what the rounding did to the recovery, in cents and as a share. The owner sees the
 * rounding rather than inheriting it.
 */

export type RecoveryPolicy = 'recover_full' | 'recover_half' | 'absorb'
export type RoundingStyle = 'exact' | 'nearest_5c' | 'nearest_10c' | 'nearest_50c'

export interface PricedLine {
  id: string
  name: string
  current_price: number
  /** Before rounding — the mathematically exact recovering price. */
  target_price: number
  /** What we actually propose, after the chosen rounding. */
  proposed_price: number
  /** proposed − target. Positive means the rounding recovers MORE than needed. */
  rounding_drift: number
  units_sold: number | null
  /** Annualised revenue effect of this line, from the window's units. Null when units are unknown. */
  revenue_effect: number | null
}

export interface PricingProposal {
  policy: RecoveryPolicy
  rounding: RoundingStyle
  /** The rise actually applied, as a percent. `absorb` is 0. */
  applied_pct: number
  lines: PricedLine[]
  /** Lines whose price does not move — reported, not hidden. */
  unchanged_count: number
  /** Sum of `revenue_effect` over the lines that have units. */
  total_revenue_effect: number | null
  /** ⚠️ Net rounding drift across the proposal — the number an owner should see before approving. */
  total_rounding_drift: number
  requires_stepup: boolean
  stepup_reason: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Round to a price point. `exact` is the identity, and is a legitimate choice. */
export function roundToPricePoint(price: number, style: RoundingStyle): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  const step = style === 'exact' ? 0 : style === 'nearest_5c' ? 0.05 : style === 'nearest_10c' ? 0.1 : 0.5
  if (step === 0) return round2(price)
  return round2(Math.round(price / step) * step)
}

/** What fraction of the shortfall each policy recovers. Named, so nothing is implicit. */
export function policyFactor(policy: RecoveryPolicy): number {
  return policy === 'recover_full' ? 1 : policy === 'recover_half' ? 0.5 : 0
}

/**
 * A step-up is a second authentication before a money decision is approved. It is demanded on
 * amount OR on breadth — a small rise across the whole menu is not a small change.
 *
 * Both thresholds are explicit and tested. A proposal that changes nothing never asks for one.
 */
export const STEPUP_ANNUAL_DOLLARS = 1000
export const STEPUP_LINE_COUNT = 20

export function stepUpDecision(changedLines: number, annualEffect: number | null): { required: boolean; reason: string | null } {
  if (changedLines === 0) return { required: false, reason: null }
  if (annualEffect != null && Math.abs(annualEffect) >= STEPUP_ANNUAL_DOLLARS) {
    return { required: true, reason: 'This moves about $' + Math.round(Math.abs(annualEffect)).toLocaleString('en-AU') + ' a year.' }
  }
  if (changedLines >= STEPUP_LINE_COUNT) {
    return { required: true, reason: 'This changes ' + changedLines + ' prices at once.' }
  }
  return { required: false, reason: null }
}

export interface BuildProposalInputs {
  items: ItemImpact[]
  /** The full recovery figure from phase 2, as a percent. */
  recovery_pct: number
  policy: RecoveryPolicy
  rounding: RoundingStyle
  /** Days the units were measured over, so the effect can be annualised honestly. */
  window_days: number
}

export function buildPricingProposal(input: BuildProposalInputs): ComputeResult<PricingProposal> {
  const prov = (rule: string) => makeProvenance('buildPricingProposal', '1.0.0',
    { items: input.items.length, recovery_pct: input.recovery_pct, policy: input.policy, rounding: input.rounding },
    rule, 'derived')

  if (input.items.length === 0) {
    return { ok: false, reason: 'No products to price.', provenance: prov('no items') }
  }
  if (input.window_days <= 0) {
    return { ok: false, reason: 'A sales window of zero days cannot be annualised.', provenance: prov('bad window') }
  }

  const applied = round2(input.recovery_pct * policyFactor(input.policy) * 100) / 100
  const yearFactor = 365 / input.window_days

  const lines: PricedLine[] = input.items.map(it => {
    const target = round2(it.price * (1 + applied / 100))
    const proposed = roundToPricePoint(target, input.rounding)
    const delta = round2(proposed - it.price)
    return {
      id: it.id,
      name: it.name,
      current_price: it.price,
      target_price: target,
      proposed_price: proposed,
      rounding_drift: round2(proposed - target),
      units_sold: it.units_sold,
      revenue_effect: it.units_sold == null ? null : round2(delta * it.units_sold * yearFactor),
    }
  })

  const changed = lines.filter(l => l.proposed_price !== l.current_price)
  const withUnits = lines.filter(l => l.revenue_effect != null)
  const totalEffect = withUnits.length === 0 ? null : round2(withUnits.reduce((s, l) => s + (l.revenue_effect ?? 0), 0))
  const totalDrift = round2(lines.reduce((s, l) => s + l.rounding_drift, 0))
  const step = stepUpDecision(changed.length, totalEffect)

  return {
    ok: true,
    data: {
      policy: input.policy,
      rounding: input.rounding,
      applied_pct: applied,
      lines,
      unchanged_count: lines.length - changed.length,
      total_revenue_effect: totalEffect,
      total_rounding_drift: totalDrift,
      requires_stepup: step.required,
      stepup_reason: step.reason,
    },
    provenance: prov(
      'recovery x policy factor, rounded to the chosen price point, annualised from a '
      + input.window_days + '-day window; rounding drift reported per line and in total',
    ),
  }
}

/**
 * The three policies side by side on ONE item — the sprint's "show what each does to a coffee".
 *
 * Deliberately takes a real item rather than a hypothetical $5.00: an owner should see the choice
 * on something off their own menu.
 */
export function policyComparison(price: number, recoveryPct: number, rounding: RoundingStyle) {
  return (['recover_full', 'recover_half', 'absorb'] as RecoveryPolicy[]).map(policy => {
    const applied = round2(recoveryPct * policyFactor(policy) * 100) / 100
    const target = round2(price * (1 + applied / 100))
    const proposed = roundToPricePoint(target, rounding)
    return {
      policy,
      applied_pct: applied,
      proposed_price: proposed,
      change: round2(proposed - price),
      /** What the owner absorbs per sale under this policy, at the full recovery figure. */
      absorbed_per_sale: round2(price * (recoveryPct / 100) - (proposed - price)),
    }
  })
}
