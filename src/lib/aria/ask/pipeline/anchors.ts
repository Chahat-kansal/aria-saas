/**
 * M18 · BRAIN-2 PHASE 1 — THE ANCHOR SET. WHAT STAGE 2 ACTUALLY LOADS.
 *
 * M17 built the grounding stage and left its body empty: `kind: 'council'` with four blank fields,
 * `kind: 'full'` with `ctx: undefined as never`, and `kind: 'none'` for everything else. The stage
 * ran on every turn and returned nothing on all of them. This file is what it returns instead.
 *
 * ⚠️ WHY A SECOND, LEANER SET RATHER THAN THE COUNCIL'S EIGHTEEN QUERIES.
 *
 * `answer-council.ts:112` runs 18 parallel queries and derives nine labelled anchors from them. Two
 * facts make hoisting that block up here the wrong move, and both are measured, not assumed:
 *
 *   1 · It lives inside a `try` whose `catch` falls back to the single-model path. Moving it in
 *       front of the lane changes what happens when `getBusinessContext()` throws — a behaviour
 *       change, which M17 recorded as the one thing a structural sprint must not smuggle in.
 *   2 · On that degraded path there are no anchors at all — which is exactly the turn a verifier is
 *       for. A grounding stage that only works when the council's own block worked is the "exists,
 *       looks correct, does nothing" shape this repo has seven instances of.
 *
 * So this loads a LEAN set — six queries — that every figure-bearing lane gets unconditionally,
 * including the ones that have never had anchors in their life (`main` has none of its own; the
 * general lane has none). The council keeps its own wider block for the model's SAFE-TO-CITE text;
 * this set is what the ANSWER is checked against. Phase 2's verifier reads it.
 *
 * ⚠️ THE LABELS ARE COPIED VERBATIM FROM `answer-council.ts:213`, not reworded. Six of its nine
 * labels are reused character-for-character so the two sets speak one vocabulary. A second wording
 * for "Completed sales, today." would be failure pattern #4 (N copies drift) committed on purpose.
 *
 * ⚠️ REVENUE COMES FROM `getRevenueSnapshot` / `getRevenueForRange`, NEVER A HAND-ROLLED `pos_sales`
 * QUERY. RULE 6 names those two as the canonical AEST-day-boundary implementations, and the audit
 * counted ~120 call sites that re-derived the filter by hand. This file adds none.
 *
 * ⚠️ GROUNDING-TEETH. A figure that cannot be computed honestly is ABSENT, with a note saying why —
 * never zero standing in for unknown. A revenue of 0 across 0 rows is a different thing: that IS the
 * honest answer ("no completed sales today") and it is present.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getRevenueSnapshot, getRevenueForRange } from '@/lib/aria/revenue-snapshot'
import { todayAEST, startOfWeekAEST, addDaysYmd } from '@/lib/date-au'
import type { AnchorQuery, LabelledFigure, LaneName, TurnAnchorSet } from './types'

/**
 * WHICH LANES GET ANCHORS, AND WHY EACH OF THE REST DOES NOT — ONE DECISION PER LANE, ALL VISIBLE.
 *
 * `null` means LOAD the set. A string is the reason this lane's set is legitimately EMPTY, and it
 * travels in the anchor set itself, so the next person reading an empty set is told why rather than
 * left to guess whether it is a bug.
 *
 * ⚠️ `Record<LaneName, …>` IS THE RAIL, AND IT IS THE POINT OF WRITING IT THIS WAY. A lane added to
 * `LANE_NAMES` without a decision here is a `tsc` error — not a lane that silently grounds nothing.
 * Every allow-list in this repo that was a plain object or an array has drifted; this one cannot,
 * because the compiler counts it.
 */
const GATE_SPEND = 'an admission gate answered before the classifiers and before grounding ran. '
  + 'The dollar figures in its body are this account\'s own AI spend, read straight from the cost '
  + 'guard — not a business figure derived from an answer'
const GATE_PLAIN = 'an admission gate answered before the classifiers and before grounding ran — '
  + 'its body carries no figure at all'

export const ANCHOR_PLAN: Readonly<Record<LaneName, string | null>> = {
  // ── LOADED. Every lane that can put a dollar or a percentage in front of an owner. ────────────
  council: null,
  main: null,
  // `image`, `stopped` and `total_outage` are SUB-EXITS of main, not candidates `decide()` offers
  // (see its header). They are listed because a `Record<LaneName, …>` must be total, and they load
  // for the same reason `main` does — they are reached from inside it.
  image: null,
  stopped: null,
  total_outage: null,
  multi_domain: null,
  deliverable: null,
  background_task: null,
  inventory_agent: null,
  action_planner: null,

  // ── EMPTY, AND IT SAYS WHY. ───────────────────────────────────────────────────────────────────
  general: 'the general lane runs before any business context exists (route.ts:824 — the M12 lane). '
    + 'It answers smalltalk and open questions and has no business figure of its own to anchor',
  nav_fastpath: 'a navigation answer names a screen, not a number',
  pending_action: 'the confirmation path restates an action the owner already approved; the figures '
    + 'in it came from the stored action row, not from this turn',
  agent_composer: 'composes an agent definition — no business figure is in the response',
  save_plan: 'the [ARIA_SAVE_PLAN] sentinel makes no model call, spends nothing and returns no figure',
  rate_limited_user: GATE_PLAIN,
  bad_request: GATE_PLAIN,
  rate_limited_minute: GATE_PLAIN,
  cost_guard_blocked: GATE_SPEND,
  cost_ceiling: GATE_SPEND,
}

/** A lane with nothing to ground. EMPTY, PRESENT, AND IT SAYS WHY. `undefined` would be a bug. */
export function emptyAnchorSet(reason: string): TurnAnchorSet {
  if (!reason.trim()) {
    // A reason-less empty set is the same silence in a new place — the exact thing `Verification`'s
    // required `reason` field exists to forbid one stage later.
    throw new Error(
      '[ask/anchors] emptyAnchorSet() needs a reason. "Nothing to ground" is a result; '
      + 'an unexplained empty set is not.',
    )
  }
  return { figures: [], queries: [], emptyReason: reason }
}

/** Runs one named ground-truth query and records what happened to it, including failure. */
async function runQuery(
  name: string,
  fn: () => Promise<{ rows: number; figures: LabelledFigure[]; note?: string }>,
): Promise<AnchorQuery> {
  try {
    const { rows, figures, note } = await fn()
    return { name, ran: true, rows, anchors: figures, note }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // WALL 6 — read the error. A failed anchor query that reported nothing would make the verifier
    // one stage later refuse an honest figure for want of its anchor, and nobody would know why.
    console.error('[ask/anchors] ' + name + ' failed:', message)
    return { name, ran: false, rows: null, anchors: [], note: message }
  }
}

/** Only a finite number is an anchor. NaN and Infinity are how a fabricated figure gets validated. */
function figure(value: number | null | undefined, label: string): LabelledFigure[] {
  return typeof value === 'number' && Number.isFinite(value)
    ? [{ value: +value.toFixed(2), label }]
    : []
}

/**
 * THE LEAN ANCHOR SET — six queries, every figure-bearing lane, every turn.
 *
 * Never throws: a query that fails is recorded as `ran: false` carrying the thrown message, because
 * the set still has to be present for the stage to have run. The set as a whole is tagged with an
 * `emptyReason` only when not one query produced a figure, which is a different and louder fact.
 */
export async function loadAnchorSet(bid: string): Promise<TurnAnchorSet> {
  const today = todayAEST()
  const weekStart = startOfWeekAEST().toISOString().slice(0, 10)
  const lastWeekStart = addDaysYmd(weekStart, -7)
  const lastWeekEnd = addDaysYmd(weekStart, -1)

  const queries = await Promise.all([
    runQuery('revenue_today', async () => {
      const s = await getRevenueSnapshot(bid, today)
      return { rows: s.transaction_count, figures: figure(s.revenue, 'Completed sales, today.') }
    }),
    runQuery('revenue_week_to_date', async () => {
      const s = await getRevenueForRange(bid, weekStart, today)
      return { rows: s.transaction_count, figures: figure(s.revenue, 'Completed sales, this week to date.') }
    }),
    runQuery('revenue_last_week', async () => {
      const s = await getRevenueForRange(bid, lastWeekStart, lastWeekEnd)
      return { rows: s.transaction_count, figures: figure(s.revenue, 'Completed sales, last week.') }
    }),
    runQuery('customers_on_record', async () => {
      const { count, error } = await supabaseAdmin
        .from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid)
      // WALL 6 — a failed COUNT resolves with `{ error }` and a null count, which reads as "this
      // business has no customers". That is a figure the verifier would then bless.
      if (error) throw new Error(error.message)
      return { rows: count ?? 0, figures: figure(count ?? 0, 'Customers on record.') }
    }),
    runQuery('customers_consented', async () => {
      const { count, error } = await supabaseAdmin
        .from('pos_customers').select('id', { count: 'exact', head: true })
        .eq('business_id', bid).eq('marketing_consent', true)
      if (error) throw new Error(error.message)
      return { rows: count ?? 0, figures: figure(count ?? 0, 'Customers who have consented to marketing.') }
    }),
    runQuery('weekly_revenue_target', async () => {
      const { data, error } = await supabaseAdmin
        .from('businesses').select('weekly_revenue_target').eq('id', bid).maybeSingle()
      if (error) throw new Error(error.message)
      const target = (data as { weekly_revenue_target?: number | null } | null)?.weekly_revenue_target
      // GROUNDING-TEETH. An unset target is UNKNOWN, not $0. A briefing once computed every
      // percentage against a fabricated $999,999 because a missing target was filled in.
      return target == null
        ? { rows: data ? 1 : 0, figures: [], note: 'no weekly revenue target set for this business' }
        : { rows: 1, figures: figure(Number(target), 'Your weekly revenue target.') }
    }),
  ])

  const figures = queries.flatMap(q => q.anchors)
  const failed = queries.filter(q => !q.ran).map(q => q.name)
  return {
    figures,
    queries,
    emptyReason: figures.length > 0
      ? null
      : failed.length === queries.length
        ? 'every ground-truth query failed: ' + failed.join(', ')
        : failed.length > 0
          ? 'no query produced a figure; these failed: ' + failed.join(', ')
          : 'every ground-truth query ran and none produced a figure — no sales, no customers and no target on record',
  }
}
