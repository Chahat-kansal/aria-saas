import type { Membership } from './membership'
import type { OwnerDecision } from '@/lib/owner-app/decisions'

// ACCESS-MODEL-1 — FIELD MASKING. Widening a table is NOT the same as exposing every field.
//
// RLS admits a member to a ROW; this masks the FIELDS on that row their permission flags forbid.
// Both layers apply, and they compose with the EXISTING ~30-flag pos_users.permissions model
// (can_view_cost_price, can_view_customer_contact, …) rather than inventing a parallel scheme —
// the same flags the POS till has always honoured.
//
// (b) CONFIRMED, per the brief's second open check: no pay-rate or bank field can ride along on a
// money decision card. aria_autopilot_actions has no join to staff_pay_rates / bank_accounts /
// payroll_* — those tables are not widened and are never selected by the owner app. The only
// sensitive material that can appear on a card is inside the free-form `payload` (action_data)
// jsonb, which an agent populated. That is exactly what maskDecisionForMember scrubs below.

/** payload keys that carry cost/margin data — gated on can_view_cost_price. */
const COST_KEYS = [
  'cost', 'cost_price', 'cost_cents', 'unit_cost', 'current_cost', 'new_cost',
  'cost_impact_cents', 'total_cost_impact_cents', 'margin', 'margin_pct',
  'new_margin_pct', 'current_margin_pct', 'recommended_margin_pct', 'landed_cost',
]

/** payload keys carrying customer PII — gated on can_view_customer_contact. */
const CONTACT_KEYS = ['customer_email', 'customer_phone', 'email', 'phone', 'delivery_address', 'address']

/** payload keys carrying pay/wage data — owner-only, never exposed to a member on any card. */
const PAY_KEYS = ['pay_rate', 'pay_rate_cents', 'hourly_rate', 'hourly_rate_cents', 'wage', 'salary', 'super', 'super_amount_owed']

export const MASKED = '[hidden]' as const

function flag(m: Membership, key: string): boolean {
  return m.permissions[key] === true
}

function scrub(value: unknown, keysToMask: string[]): unknown {
  if (Array.isArray(value)) return value.map(v => scrub(v, keysToMask))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = keysToMask.includes(k.toLowerCase()) ? MASKED : scrub(v, keysToMask)
    }
    return out
  }
  return value
}

/**
 * Mask a decision for a member. The OWNER is returned untouched — owner access is unchanged by this
 * sprint, everywhere.
 *
 * A money decision stays VISIBLE with its amount_cents headline (the confirmed read-only rule — the
 * manager needs the context), but any cost/margin, contact, or pay field inside the payload is
 * scrubbed unless their flags permit it. Pay fields are ALWAYS scrubbed for a member: there is no
 * flag that grants a manager wage visibility in the owner app.
 */
export function maskDecisionForMember(decision: OwnerDecision, membership: Membership): OwnerDecision {
  if (membership.is_owner) return decision

  const keys: string[] = [...PAY_KEYS]
  if (!flag(membership, 'can_view_cost_price')) keys.push(...COST_KEYS)
  if (!flag(membership, 'can_view_customer_contact')) keys.push(...CONTACT_KEYS)

  return {
    ...decision,
    payload: scrub(decision.payload, keys.map(k => k.toLowerCase())) as Record<string, unknown>,
  }
}

export function maskDecisionsForMember(decisions: OwnerDecision[], membership: Membership): OwnerDecision[] {
  if (membership.is_owner) return decisions
  return decisions.map(d => maskDecisionForMember(d, membership))
}
