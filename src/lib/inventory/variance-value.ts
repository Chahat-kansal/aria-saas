// INV-BASELINE-1 PHASE 3 — "worth nothing" and "value unknown" are different facts.
//
// resolve-cost.ts has always been honest — its header says an absent or zero cost is reported as
// unknown (NULL), "never silently treated as 0 and never fabricated". Every CALLER then flattened
// that null to 0 on arrival, so the distinction died one line after it was made:
//
//   let varianceCents = 0
//   if (rc.cost != null) varianceCents = Math.round(variance * rc.cost * 100)   // else: stays 0
//
// A stored 0 then meant either "this variance cost the business nothing" or "we have no idea what
// this variance cost", with nothing downstream able to tell them apart — and downstream included an
// owner-facing shrinkage total in dollars and an AI action priority.
//
// These are the two rules that were being broken, extracted so they are assertable.

/**
 * Value a variance at a known unit cost. NULL cost in → NULL out, always.
 *
 * @param varianceQty  counted − expected (signed: negative is a shortfall)
 * @param unitCost     dollars per unit from resolveCostFor, or null when unresolvable
 * @returns            signed cents, or null when the value is genuinely unknown
 */
export function varianceValueCents(varianceQty: number, unitCost: number | null | undefined): number | null {
  if (unitCost == null || !Number.isFinite(Number(unitCost))) return null
  const qty = Number(varianceQty)
  if (!Number.isFinite(qty)) return null
  const cents = Math.round(qty * Number(unitCost) * 100)
  // Normalise -0 to 0. A negative shortfall against a zero cost produces -0, which serialises as 0
  // but fails Object.is(-0, 0) — so a stored value could compare unequal to the number it prints as.
  return cents === 0 ? 0 : cents
}

export interface ValueTotal {
  /** Sum of the lines that could be priced. */
  knownCents: number
  /** Lines whose value could not be resolved — excluded from knownCents, never added as 0. */
  unknownLines: number
  /**
   * The figure safe to publish. NULL when there were lines to value and NOT ONE could be priced —
   * publishing 0 there asserts "this cost nothing", which is a claim rather than a measurement.
   */
  totalCents: number | null
}

/**
 * Total a set of line values without letting unknowns masquerade as zeroes.
 *
 * A partial total is still returned when SOME lines priced — that is genuinely useful — but
 * `unknownLines` comes back with it so no surface can render the number as complete. Any caller
 * showing totalCents must show unknownLines beside it when non-zero.
 */
export function totalVarianceValue(lineValues: Array<number | null | undefined>): ValueTotal {
  let knownCents = 0
  let unknownLines = 0
  let knownLines = 0
  for (const v of lineValues) {
    if (v == null || !Number.isFinite(Number(v))) { unknownLines++; continue }
    knownCents += Number(v)
    knownLines++
  }
  const hadLines = lineValues.length > 0
  return {
    knownCents,
    unknownLines,
    totalCents: hadLines && knownLines === 0 ? null : knownCents,
  }
}
