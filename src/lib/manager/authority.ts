import { supabaseAdmin } from '@/lib/supabase-admin'

// MANAGER-AGENT-1 — THE AUTHORITY BOUNDARY, in code.
//
// The rule (locked, do not soften): autonomy must NOT remove owner control. The Store Manager
// carries the LABOUR to done; the owner keeps AUTHORITY over anything that leaves a mark.
//
// The manager may act ALONE only when an action is ALL FOUR of:
//   1. INVISIBLE            — nothing outside the business sees it
//   2. REVERSIBLE           — it can be undone with no residue
//   3. ZERO-COST            — it spends nothing
//   4. TOUCHES NO MARKED DOMAIN — no customer, no roster, no money
//
// Everything else is drafted to done and released by the owner's single tap through the EXISTING
// PH-1 decision gate (createDecision → aria_autopilot_actions 'pending'). This module is what makes
// "the agent commits a marked action without the owner's tap" structurally impossible rather than
// merely discouraged: the only write path to the autonomy ledger runs assertSafe() first, and
// assertSafe THROWS on a marked action instead of returning false. A caller cannot ignore a throw
// the way it can ignore a boolean.
//
// This is deliberately NOT "act within boundaries, then report." The report half (the ledger)
// exists ONLY for the safe class above. If you are reading this while adding a money/customer/
// roster/irreversible capability here — stop. That belongs behind createDecision().

/** Domains where any action leaves a mark the owner must authorise. */
export const MARKED_DOMAINS = ['money', 'customer', 'roster', 'external'] as const
export type MarkedDomain = (typeof MARKED_DOMAINS)[number]

export interface SafetyClaim {
  action_kind: string
  summary: string
  is_invisible: boolean
  is_reversible: boolean
  is_zero_cost: boolean
  /** Which marked domains this action touches. MUST be empty to act alone. */
  touches: MarkedDomain[]
}

export class AuthorityViolation extends Error {
  constructor(public readonly claim: SafetyClaim, public readonly failed: string[]) {
    super(
      'AUTHORITY VIOLATION: "' + claim.action_kind + '" cannot be taken autonomously — failed [' +
      failed.join(', ') + ']. This action leaves a mark and MUST go to the owner via createDecision().',
    )
    this.name = 'AuthorityViolation'
  }
}

/**
 * The reversibility test. Returns nothing when the action is genuinely in the safe class; THROWS
 * AuthorityViolation otherwise.
 *
 * Throwing (not returning false) is the design: a boolean can be dropped on the floor by a careless
 * caller, a thrown error cannot be. Every autonomous path must pass through here.
 */
export function assertSafeToActAlone(claim: SafetyClaim): void {
  const failed: string[] = []
  if (!claim.is_invisible) failed.push('not invisible')
  if (!claim.is_reversible) failed.push('not reversible')
  if (!claim.is_zero_cost) failed.push('not zero-cost')
  if (claim.touches.length > 0) failed.push('touches ' + claim.touches.join('+'))
  if (failed.length > 0) throw new AuthorityViolation(claim, failed)
}

/** Non-throwing predicate, for deciding routing (act alone vs. gate) before attempting either. */
export function canActAlone(claim: SafetyClaim): boolean {
  try { assertSafeToActAlone(claim); return true } catch { return false }
}

/**
 * Record an action the manager took entirely on its own. The ONLY write path to autonomy_ledger.
 * Runs the authority test FIRST — a marked action throws here and never reaches the table (the DB
 * CHECK constraint autonomy_ledger_safe_class_only is the second, independent line of defence).
 */
export async function recordAutonomousAction(
  business_id: string,
  claim: SafetyClaim,
  run_id?: string | null,
): Promise<void> {
  assertSafeToActAlone(claim) // throws on anything marked — bypass is impossible from here

  const { error } = await supabaseAdmin.from('autonomy_ledger').insert({
    business_id,
    run_id: run_id ?? null,
    action_kind: claim.action_kind,
    summary: claim.summary,
    is_invisible: claim.is_invisible,
    is_reversible: claim.is_reversible,
    is_zero_cost: claim.is_zero_cost,
    touches_no_marked_domain: claim.touches.length === 0,
  })
  if (error) console.error('[manager/authority] autonomy ledger write failed:', error.message)
}
