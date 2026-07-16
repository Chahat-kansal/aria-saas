// INTEL-COMPUTE-1 — shared provenance shape for every deterministic compute-engine function.
// Every calculation in src/lib/aria/compute/** (and the extended revenue-snapshot.ts) returns its
// result alongside one of these, so any figure shown to an owner or handed to the model can be
// displayed with its own audit trail — what inputs, what rule, how grounded — rather than as a
// bare number. This is the concrete substrate the later Business Truth typing
// (verified/derived/estimated) and Aria Intelligence Contract plug into; it does not implement
// those systems itself.

// verified   — summed directly from real rows with no assumption/fallback/estimate involved.
// derived    — computed from other verified/derived figures via a defined rule (e.g. a growth %
//              computed from two verified revenue snapshots).
// estimated  — involves an assumption, an industry-standard default, or a fallback because a real
//              input was missing (e.g. a resolved cost falling back to an estimate). Compute
//              functions in this module never silently invent a number to reach "verified" or
//              "derived" — if an estimate had to be used, grounding is estimated and the
//              assumption is named in `rule`.
export type Grounding = 'verified' | 'derived' | 'estimated'

export interface Provenance {
  /** Name of the compute function that produced this result, e.g. "getRevenueSnapshot". */
  function: string
  /** Bumped whenever the underlying formula/rule changes, so a stored/cached result can be told
   * apart from one computed under an old, since-corrected rule. */
  version: string
  /** The exact inputs used to produce this result (business_id, date range, filters applied) —
   * enough to reproduce the query by hand. */
  inputs: Record<string, unknown>
  /** One-line human-readable description of the rule actually applied, e.g. "status='completed',
   * AEST calendar-day boundary" — written for an owner or auditor to read, not just a developer. */
  rule: string
  grounding: Grounding
  computed_at: string
}

export function makeProvenance(
  fn: string,
  version: string,
  inputs: Record<string, unknown>,
  rule: string,
  grounding: Grounding,
): Provenance {
  return { function: fn, version, inputs, rule, grounding, computed_at: new Date().toISOString() }
}

/** A calculation result that couldn't be produced because a required real input was missing —
 * returned instead of a fabricated or zero-defaulted number. Callers (including AI prompt
 * builders) must handle this case explicitly and say "insufficient data," never silently coerce
 * it to 0 or omit it. */
export interface InsufficientData {
  ok: false
  reason: string
  provenance: Provenance
}

export interface ComputeOk<T> {
  ok: true
  data: T
  provenance: Provenance
}

export type ComputeResult<T> = ComputeOk<T> | InsufficientData
