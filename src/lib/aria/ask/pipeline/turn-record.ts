/**
 * M17B · PHASE 2 — THE TURN RECORD, as a console line. Phase 3 gives it a home.
 *
 * ⚠️ NOBODY HAS EVER BEEN ABLE TO PREDICT WHICH LANE A MESSAGE TAKES. S4 through M12 each found a
 * turn in an unexpected lane, because the decision was spread across 25 regexes and lived only in
 * the shape of the control flow — whichever `return` happened to run first.
 *
 * `runTurn` now hands this function the whole decision: the strategy that won, the reason it won,
 * the features that were true, which candidates were offered and declined, the grounding kind, the
 * verification verdict, and the per-stage timings.
 *
 * **Phase 2 writes it to the log.** Phase 3 decides where it is persisted — and per RULE 10a, if
 * that needs a column that does not exist, the DDL is proposed and parked rather than smuggled into
 * a JSONB blob.
 */
import type { TurnRecord } from './types'

/** Emitted once per turn. One line, structured, greppable. */
export function recordTurn(record: TurnRecord): void {
  console.log('[ask-aria] turn', JSON.stringify({
    lane: record.lane,
    reason: record.reason,
    declined: record.declined,
    fired: record.firedFeatures,
    intent: record.intentType,
    aria_intent: record.ariaIntentType,
    complexity: record.complexity,
    grounding: record.groundingKind,
    verified: record.verified,
    status: record.status,
    stage_ms: record.stageMs,
    total_ms: record.totalMs,
  }))
}
