/**
 * M17B · PHASE 3 — THE TURN RECORD. Why a message went where it went.
 *
 * ⚠️ NOBODY HAS EVER BEEN ABLE TO PREDICT WHICH LANE A MESSAGE TAKES. S4 through M12 each found a
 * turn in an unexpected lane, because the decision was spread across 25 regexes and lived only in
 * the shape of the control flow — whichever `return` happened to run first. Reconstructing why the
 * founder's "tidy up before the weekend" reached the general lane (M12) meant re-running both
 * classifiers by hand, because the lane that took it returned before anything logged a thing.
 *
 * `runTurn` now hands this the whole decision: the lane that won, the reason it won, **which
 * candidates were offered and declined**, the features that fired, the grounding kind, the
 * verification verdict, the status and the per-stage timings.
 *
 * ── WHERE IT GOES, AND WHY NO DDL WAS INVENTED ──────────────────────────────────────────────────
 *
 * The sprint says: reuse an existing column if one fits; if a new table is needed, propose the DDL
 * and park; never smuggle JSONB. So:
 *
 * **`aria_ai_calls` fits the core, using its columns for exactly what they are for** — it is the
 * canonical per-call ledger, written through `logAICallSafe()` (the one entry point that checks the
 * returned error, because whole `agent_key`s once wrote zero rows for weeks on a silent CHECK
 * violation). `response_summary` already carries compact JSON summaries on five other agent keys in
 * this very pipeline (`health_signals`, `goal_context`, `open_loops`, `advice_weights`,
 * `industry_benchmark`). This is that same pattern, not a new use of the column.
 *
 *     agent_key        'ask_aria_router'   — a new key; only role and provider carry CHECKs
 *     role             'other'             — on the CHECK list
 *     provider         'other'             — no model was called to make this decision
 *     latency_ms       the whole turn
 *     request_summary  lane + reason, human-readable at a glance
 *     response_summary the decision as JSON: lane, reason, declined, grounding, verified, status
 *     learning_signal  the features that fired
 *
 * **What does NOT fit is parked, not smuggled.** Per-stage timings, the full 18-boolean feature
 * vector and a typed verification verdict want real columns you can aggregate on — "what is the p95
 * of stage `act` on the council lane this week" is a query M18 will want and cannot ask of a text
 * blob. The DDL for that is proposed in `docs/aria/RUN-M17B.md` and **PARKED**: RULE 10a, schema is
 * never mine to write. The console line below carries the full record in the meantime.
 */
import { logAICallSafe } from '@/lib/aria/log-ai-call'
import type { TurnRecord } from './types'

/** The shape written to `response_summary`. Compact on purpose — it is a summary column. */
function decisionJson(record: TurnRecord): string {
  return JSON.stringify({
    lane: record.lane,
    reason: record.reason,
    declined: record.declined,
    grounding: record.groundingKind,
    verified: record.verified.ran ? 'ran' : 'not_run',
    status: record.status,
    intent: record.intentType,
    aria_intent: record.ariaIntentType,
  })
}

/**
 * Emitted once per turn.
 *
 * ⚠️ FIRE-AND-FORGET, DELIBERATELY. A turn must never fail because its diagnostic row did not
 * insert — but `logAICallSafe` still reads and logs the error, so a rejected insert is visible
 * rather than silent. That is the distinction W6 is about: non-fatal is fine, silent is not.
 */
export function recordTurn(record: TurnRecord): void {
  // The FULL record, greppable in Vercel logs, including the per-stage timings the table has no
  // column for yet.
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

  void logAICallSafe({
    business_id: record.businessId,
    agent_key: 'ask_aria_router',
    role: 'other',
    provider: 'other',
    success: true,
    latency_ms: record.totalMs,
    request_summary: `${record.lane} — ${record.reason}`.slice(0, 200),
    response_summary: decisionJson(record).slice(0, 500),
    learning_signal: record.firedFeatures.join(',').slice(0, 100) || 'none',
  })
}

/** Exported for the test: the exact row this would write, without writing it. */
export function turnRecordRow(record: TurnRecord) {
  return {
    business_id: record.businessId,
    agent_key: 'ask_aria_router' as const,
    role: 'other' as const,
    provider: 'other' as const,
    success: true,
    latency_ms: record.totalMs,
    request_summary: `${record.lane} — ${record.reason}`.slice(0, 200),
    response_summary: decisionJson(record).slice(0, 500),
    learning_signal: record.firedFeatures.join(',').slice(0, 100) || 'none',
  }
}
