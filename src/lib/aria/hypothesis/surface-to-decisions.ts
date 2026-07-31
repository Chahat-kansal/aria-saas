import { supabaseAdmin } from '@/lib/supabase-admin'
import { createDecision } from '@/lib/decisions/createDecision'

// BRAIN-LOOP-1 — the ENTRY CONDITION the learning loop was missing.
//
// The loop (generate -> accept -> baseline -> outcome -> weight) is already built, scheduled and
// consumed. It produced nothing because acceptance is owner-gated and no owner ever accepted: 240
// hypotheses, 45 active, 195 expired, 0 accepted, 0 with action_id, 0 with baseline_metric_cents.
// runOutcomeChecks() had literally nothing to measure.
//
// This routes a hypothesis into the PH-1 Decisions queue — the surface owners actually use daily —
// so accept/decline becomes a normal one-tap action instead of a visit to a board nobody opens.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
// · It does NOT auto-accept. Propose->approve is untouched; the owner still decides.
// · It does NOT fork a second acceptance path. The Decisions card carries the hypothesis id and
//   the resolve handler calls the EXISTING PATCH /api/aria/hypotheses/[id], which creates the
//   aria_actions row and fires onActionApproved() for the baseline snapshot. One acceptance path,
//   three surfaces (queue / board / intelligence page).
// · It does NOT copy hypothesis content into the decision as free text that can drift. The card
//   stores hypothesis_id and reads through to the live row.
// · It does NOT flush the backlog. Hard cap below.

/** Max hypotheses allowed into the Decisions queue per business per day. */
export const DAILY_SURFACE_CAP = 2

/**
 * Minimum window an owner gets to act on a surfaced hypothesis.
 *
 * WHY THIS EXISTS (found by the sprint's own proof run, not in review): the first version passed
 * the hypothesis's expires_at straight onto the decision card. Hypotheses go stale before the
 * expiry job flips them, so cards were created with an expiry ALREADY IN THE PAST — status
 * 'pending' but instantly refused by the decisions endpoint with 409 not_waiting. The entry
 * condition would have shipped dead: hypotheses surfaced, counted, and impossible to accept.
 *
 * A hypothesis's expires_at is about EVIDENCE freshness. It is not a budget for how long the owner
 * may take to answer. Once something is put in front of a person, they need a real window — so the
 * expiry is clamped to at least this, and the hypothesis is moved in step with its card (below) so
 * the two can never disagree about when the offer closes.
 */
const MIN_DECISION_WINDOW_HOURS = 72

export interface SurfaceResult {
  business_id: string
  candidates: number
  surfaced: number
  skipped_cap: number
  skipped_already_queued: number
  /**
   * True when the daily cap was already spent, so candidates were never counted. Without this,
   * the early return reports `candidates: 0`, which reads as "nothing to say" when the truth is
   * "we didn't look" — the same conflation of counts this whole sprint exists to stop.
   */
  daily_cap_reached: boolean
}

/**
 * Route up to DAILY_SURFACE_CAP active, never-queued hypotheses into the Decisions queue,
 * highest (weight x confidence) first.
 *
 * DEDUPE — "at most once, EVER": decision_id is a set-once marker with no FK, so once a hypothesis
 * has been queued it can never be selected again, and no DELETE of the decision row can reverse
 * that (see the migration header for why the FK is deliberately absent).
 *
 * RANKING — aria_advice_weights.weight (the learned signal, default 1.000) x the hypothesis's own
 * confidence. Weights only ever REORDER what the owner sees; they never fabricate a card,
 * suppress one, or alter a number on it.
 */
export async function surfaceHypothesesToDecisions(business_id: string): Promise<SurfaceResult> {
  const result: SurfaceResult = {
    business_id, candidates: 0, surfaced: 0, skipped_cap: 0, skipped_already_queued: 0,
    daily_cap_reached: false,
  }

  // How many already went into the queue today — the cap is per DAY, while the dedupe above is
  // per hypothesis forever. Both must hold.
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const { count: alreadyToday } = await supabaseAdmin
    .from('aria_hypotheses')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business_id)
    .not('decision_id', 'is', null)
    .gte('surfaced_at', dayStart.toISOString())

  const remaining = DAILY_SURFACE_CAP - (alreadyToday ?? 0)
  if (remaining <= 0) { result.daily_cap_reached = true; return result }

  // Candidate set — exactly the partial-index path (business_id, decision_id IS NULL,
  // status='active'), verified with EXPLAIN ANALYZE to use idx_aria_hypotheses_queue_candidates.
  const { data: candidates } = await supabaseAdmin
    .from('aria_hypotheses')
    .select('id, title, description, category, confidence, predicted_impact_cents, risk_level, expires_at')
    .eq('business_id', business_id)
    .is('decision_id', null)
    .eq('status', 'active')
    // status='active' is NOT sufficient: the expiry job runs on a schedule, so rows sit 'active'
    // past their own expires_at. Surfacing one means asking the owner to act on evidence that has
    // already gone stale. or() keeps rows that simply never had an expiry.
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
  const rows = candidates ?? []
  result.candidates = rows.length
  if (rows.length === 0) return result

  const { data: weightRows } = await supabaseAdmin
    .from('aria_advice_weights')
    .select('category, weight')
    .eq('business_id', business_id)
  const weightFor = new Map<string, number>(
    ((weightRows ?? []) as Array<{ category: string; weight: number }>).map(w => [w.category, Number(w.weight)]),
  )

  const ranked = rows
    .map(h => ({ h, score: (weightFor.get(String(h.category)) ?? 1) * Number(h.confidence ?? 0.6) }))
    .sort((a, b) => b.score - a.score)

  result.skipped_cap = Math.max(0, ranked.length - remaining)

  for (const { h } of ranked.slice(0, remaining)) {
    // Clamp to a usable window (see MIN_DECISION_WINDOW_HOURS).
    const floor = new Date(Date.now() + MIN_DECISION_WINDOW_HOURS * 3600_000)
    const hypExpiry = h.expires_at ? new Date(h.expires_at as string) : null
    const decisionExpiry = (hypExpiry && hypExpiry > floor ? hypExpiry : floor).toISOString()

    // GROUNDING-TEETH: title/description come verbatim from the hypothesis row; predicted impact is
    // passed through only when the generator actually recorded one. Nothing is computed here.
    const decisionId = await createDecision({
      business_id,
      domain: 'growth',
      kind: 'hypothesis',
      title: h.title as string,
      subtitle: (h.description as string) ?? null,
      amount_cents: (h.predicted_impact_cents as number) ?? null,
      // READ-THROUGH, not a copy: the card carries the id; content is always read from the live
      // hypothesis row so the two can never drift apart.
      payload: { hypothesis_id: h.id, category: h.category, risk_level: h.risk_level },
      aria_reason: (h.description as string) ?? null,
      expires_at: decisionExpiry,
      category: (h.category as string) ?? null,
      action_type: 'hypothesis',
      confidence: Number(h.confidence ?? 0.6),
      actor: 'cron',
    })
    if (!decisionId) continue

    // Mark it queued (set-once) AND surfaced in the same write — reaching the Decisions queue IS
    // being put in front of the owner.
    // expires_at is moved in step with the card so the hypothesis cannot lapse underneath a
    // decision the owner is still looking at — one closing time, not two.
    await supabaseAdmin.from('aria_hypotheses').update({
      decision_id: decisionId,
      surfaced_at: new Date().toISOString(),
      surfaced_status: 'surfaced',
      expires_at: decisionExpiry,
    }).eq('id', h.id).is('decision_id', null) // set-once guard: a concurrent pass cannot double-queue

    result.surfaced++
  }

  return result
}

/**
 * SET-ONCE surfacing stamp for the BROWSE surfaces (hypotheses board, intelligence page).
 * Instrumenting only the new queue would rebuild the exact blind spot the 195 legacy rows
 * represent, with a nicer column name — so every surface that renders a hypothesis stamps it.
 *
 * `.is('surfaced_at', null)` makes this genuinely set-once: a re-view never overwrites the first
 * render time, because the question the column answers is "was this ever shown to a human", not
 * "when was it last looked at".
 */
export async function markHypothesesSurfaced(business_id: string, hypothesisIds: string[]): Promise<void> {
  if (hypothesisIds.length === 0) return
  await supabaseAdmin.from('aria_hypotheses')
    .update({ surfaced_at: new Date().toISOString(), surfaced_status: 'surfaced' })
    .eq('business_id', business_id)     // tenant-scoped: never stamps another business's row
    .in('id', hypothesisIds)
    .is('surfaced_at', null)            // set-once
}
