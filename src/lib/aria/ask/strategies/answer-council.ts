/**
 * M17 · BRAIN-1 PHASE 3 — THE `council` LANE, WRAPPED.
 *
 * ⚠️ THE FILE IS answer-council.ts, NOT council.ts — AND THE SECOND NAME WOULD FAIL THE PUSH.
 * M13B phase 2 retired the bare `council` module specifier and guards it repo-wide
 * (src/lib/aria/council-names.test.ts). Naming this file `council.ts` made the registry import the
 * retired specifier, and that rail fired — correctly: its rule is about the specifier, not the
 * directory it sits in. Renamed rather than loosened, and the new name is the more accurate one:
 * this lane wraps `runAriaCouncil()` from lib/aria/answer-council.ts.
 *
 * ⚠️ It fired a SECOND time on this very comment, because the scan reads raw source and the
 * sentence above originally quoted the forbidden import verbatim. The sentence is reworded; the
 * rail is untouched. (M17's own one-exit guard hit the same class of problem from the other side
 * and was fixed by teaching it about block comments — see pipeline/one-exit-rule.ts. A rule that is
 * not mine to change gets worked with, not around.)
 *
 * Moved from `src/app/api/aria/ask/route.ts:1089–1509` — the largest lane before `main`, and the
 * one the whole sprint turns on. TWO exits: the graceful "not enough data yet" degradation, and the
 * council answer itself.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The only edits are the ones the spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('council', X)`
 *   · the gate reads `understanding.features` instead of four locals stage 1 already computed
 *   · falling off the end is `return null` — the DECLINE that the original expressed by letting the
 *     `catch` log "council failed, falling back to single-model" and simply running on
 *
 * ⚠️ `turnProvenance` MOVED WITH THE LANE, AND THAT IS THE POINT OF S3. It was declared at
 * route.ts:1088, three `try` blocks above the code that fills it, because the anchors were computed
 * deep inside this branch and spent only on the model prompt and the verifier — nothing carried
 * them out, which is why 0 of 288 conversations ever carried a provenance tier. Here it is a local
 * of the lane that produces it, and it still reaches the response and `upsertConversation` exactly
 * as it does today.
 *
 * ⚠️ WHAT THIS SPRINT DOES NOT DO TO THIS FILE: it does not put the constitution on this lane.
 * `answer-council.ts` still contains zero references to it — S6 measured that and M17 is structural.
 * Fixing it here would be a behaviour change in a sprint whose whole claim is that behaviour did not
 * change.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getBusinessContext } from '@/lib/aria/get-business-context'
import { buildFactsPacket } from '@/lib/aria/ask/facts-packet'
import { runAriaCouncil } from '@/lib/aria/answer-council'
import { validateAndHeal } from '@/lib/aria/response-validator'
import { buildProvenance } from '@/lib/aria/figure-provenance'
import { computeHealthSignals } from '@/lib/aria/health-signals'
import { computeGoalContext } from '@/lib/aria/goal-context'
import { getOpenLoops } from '@/lib/aria/open-loops'
import { computeBenchmarkContext } from '@/lib/aria/benchmark-context'
import { computeHypothesisContext } from '@/lib/aria/hypothesis-context'
import { logAICallSafe } from '@/lib/aria/log-ai-call'
import { formatNoticeContext, type NoticeRecord } from '@/lib/aria/notice-context'
import { dropContentFreeBlocks } from '@/lib/aria/block-content'
import type { AskBlock as AskBlockType } from '@/lib/aria/ask-types'
import { extractAndStoreMemories } from '@/lib/aria/memory/extract'
import { summariseConversation } from '@/lib/aria/memory/summarize'
import { todayAEST, toAESTStart, startOfWeekAEST } from '@/lib/date-au'
import { upsertConversation } from '../pipeline/turn-persistence'

export const councilStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, message, conversationId, clientMessages, noticeRef } = input
  const { intent, ariaIntent, features } = understanding

  // route.ts:1088 — S3 PHASE 1's PROVENANCE CARRIER, moved with the lane that fills it.
  let turnProvenance: { anchors: number[]; anchorLabels: Record<string, string> } | null = null

  // 2b. Strategic council path — skip buildAskAriaContext (19 DB queries wasted) for council requests.
  // RC5: a clear data-lookup never enters the council (answers in the tool-loop instead).
  if (!features.isBrevityQuestion && !features.isDataLookup && (features.isStrategicQuestion || ariaIntent.intent_type === 'analytical')) {
    try {
      const [bizCtx, factsPacket] = await Promise.all([
        getBusinessContext(bid),
        buildFactsPacket(bid, ariaIntent.comparison_period),
      ])
      // GROUNDING-TEETH Part 3: no grounded inputs → no strategic synthesis (graceful degradation)
      if (!bizCtx || bizCtx.length < 50) {
        const noDataMsg = "I don't have enough data yet for a strategic read — try a specific question."
        let savedConvId = conversationId
        // S9 PHASE 6 (#7) — same class as the mass-confirm save above: still non-fatal, no longer
        // silent. The owner asked something and the answer is real; losing the record of it is not
        // a reason to fail the request, but it is a reason to be able to find out.
        try { savedConvId = await upsertConversation(bid, userId, conversationId, message, noDataMsg, intent.type) }
        catch (e) { console.error('[aria/ask] no-data conversation NOT saved:', (e as Error).message) }
        return makeTurnResult('council', {
          response: noDataMsg,
          blocks: [{ type: 'lead', content: noDataMsg }],
          conversation_id: savedConvId ?? conversationId,
          intent: intent.type, action: null, cost_usd_cents: 0, downloads: null, tool_calls: [], used_council: false,
        })
      }
      let augCtx = bizCtx
      try {
        const ctxParsed = JSON.parse(bizCtx) as Record<string, unknown>
        ctxParsed.aria_facts_packet = factsPacket
        // GROUNDING-TEETH Part 2: positive anchors — live-queried values that ARE safe to cite
        try {
          const gtTodayStart = toAESTStart(todayAEST())
          const gtThisMon = new Date(toAESTStart(startOfWeekAEST().toISOString().slice(0, 10)))
          const gtWeekStart = gtThisMon.toISOString()
          const gtWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
          // GROUNDING-TEETH-V2 Part 3: calendar windows for last-week + same-week-last-month anchors
          const gtLastWeekStart = new Date(gtThisMon.getTime() - 7 * 86400000).toISOString()
          const gtSwlmStart = new Date(gtThisMon.getTime() - 28 * 86400000).toISOString()
          const gtSwlmEnd = new Date(gtThisMon.getTime() - 21 * 86400000).toISOString()
          const gt56dAgo = new Date(Date.now() - 56 * 86400000).toISOString()
          const gt30dAgo = new Date(Date.now() - 30 * 86400000).toISOString()
          // INTEL-COMPUTE-3 — the 4 pos_sales queries below (today/week/last-week/same-week-last-
          // month, feeding available_ground_truth — the block the model is told is "SAFE TO CITE")
          // used neq('voided'), admitting draft/refunded rows. status='completed' matches
          // getRevenueSnapshot()'s canonical rule (gt56d just below already used it correctly).
          const [gtToday, gtWeek, gtConsent, gtCompleted7, gtPaid7, gtLastWeek, gtSwlm, gt56d, gtTotalCust, gtTopCust, gtBiz, gtPromoActions, gtHealth, gtGoal, gtWeights, gtOpenLoops, gtBenchmark, gtHypotheses] = await Promise.all([
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtTodayStart).eq('status', 'completed'),
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtWeekStart).eq('status', 'completed'),
            supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('marketing_consent', true),
            // AUTOPILOT-FIX-1 PART 1: payment-coverage DENOMINATOR is completed sales only — draft/pending/
            // cancelled legitimately have no payment record. The old neq('voided') denominator counted them,
            // producing the fabricated "19% reconciliation / 6 of 32" anchor fed to the council as fact.
            supabaseAdmin.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid).gte('created_at', gtWeekAgo).eq('status', 'completed'),
            // numerator: payments on COMPLETED sales only (matches the denominator)
            supabaseAdmin.from('pos_sale_payments').select('sale_id, pos_sales!inner(business_id, created_at, status)').eq('pos_sales.business_id', bid).gte('pos_sales.created_at', gtWeekAgo).eq('pos_sales.status', 'completed').limit(5000),
            // V2 Part 3 new anchors
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtLastWeekStart).lt('created_at', gtWeekStart).eq('status', 'completed'),
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtSwlmStart).lt('created_at', gtSwlmEnd).eq('status', 'completed'),
            supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', bid).gte('created_at', gt56dAgo).eq('status', 'completed'),
            supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid),
            supabaseAdmin.from('pos_customers').select('total_spent').eq('business_id', bid).order('total_spent', { ascending: false }).limit(5),
            supabaseAdmin.from('businesses').select('weekly_revenue_target').eq('id', bid).maybeSingle(),
            supabaseAdmin.from('aria_actions').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'completed').gte('created_at', gt30dAgo).ilike('category', '%promo%'),
            // HEALTH-SIGNALS-1 Part 2: diagnostic facts (POS health, day-of-week baseline, freshness, known-unknowns)
            computeHealthSignals(bid).catch(() => null),
            // GOAL-AWARE-1 (I2): weekly target trajectory (projection, pace, on-track status)
            computeGoalContext(bid).catch(() => null),
            // OUTCOME-LOOP-1 (I4) Part 4: learned advice weights — how past recommendations per
            // category actually turned out (outcome-check cron → adjustAdviceWeight). Surfaces the
            // per-category confidence so the council can hedge categories that historically backfired.
            supabaseAdmin.from('aria_advice_weights').select('category,weight,positive_outcomes,negative_outcomes,neutral_outcomes').eq('business_id', bid),
            // PLAN-PERSISTENCE-1 (I5) Part 2: actions the owner executed but Aria never followed up on
            getOpenLoops(bid).catch(() => []),
            // I10 BENCHMARK Part 3: where this business sits vs anonymized industry peers (only when
            // its industry has passed the >=5-business privacy floor; otherwise available:false).
            computeBenchmarkContext(bid).catch(() => null),
            // I11 COUNTERFACTUAL Part 1: top open hypotheses the nightly engine generated (so the
            // council can proactively surface testable ideas the owner has not seen).
            computeHypothesisContext(bid).catch(() => null),
          ])
          const gtSum = (rows: Array<{ total_amount: number | null }> | null) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
          const paidSaleIds = new Set(((gtPaid7.data ?? []) as Array<{ sale_id: string }>).map(r => r.sale_id))
          const completedSales7 = gtCompleted7.count ?? 0
          // AUTOPILOT-FIX-1 PART 2: a coverage % from a tiny sample is meaningless. Small cafes do ~5-15
          // sales/day; <10 completed in 7d cannot support a "POS failure" conclusion. Emit null + a note
          // so the council never receives a scary low % it would echo as a crisis.
          const coveragePct = completedSales7 >= 10
            ? +((Math.min(paidSaleIds.size, completedSales7) / completedSales7) * 100).toFixed(1)
            : null
          // V2 Part 3: Tuesday avg + overall daily avg → the real "Tuesday gap" a "$480 leak" must match.
          // created_at is UTC; +10h ≈ AEST for day/DOW bucketing (fixed offset, matches date-au).
          const rows56 = (gt56d.data ?? []) as Array<{ total_amount: number | null; created_at: string }>
          const dayAgg = new Map<string, { tot: number; dow: number }>()
          for (const r of rows56) {
            const aest = new Date(new Date(r.created_at).getTime() + 10 * 3600000)
            const key = aest.toISOString().slice(0, 10)
            const cur = dayAgg.get(key) ?? { tot: 0, dow: aest.getUTCDay() }
            cur.tot += Number(r.total_amount ?? 0); dayAgg.set(key, cur)
          }
          const days = [...dayAgg.values()]
          const tueDays = days.filter(d => d.dow === 2)
          const tuesdayAvg = tueDays.length ? +(tueDays.reduce((s, d) => s + d.tot, 0) / tueDays.length).toFixed(2) : null
          const overallDailyAvg = days.length ? days.reduce((s, d) => s + d.tot, 0) / days.length : null
          const tuesdayGap = (tuesdayAvg != null && overallDailyAvg != null) ? +(tuesdayAvg - overallDailyAvg).toFixed(2) : null
          const topCustLTVs = ((gtTopCust.data ?? []) as Array<{ total_spent: number | null }>).map(c => +Number(c.total_spent ?? 0).toFixed(2)).filter(n => n > 0)
          const targetWeekly = (gtBiz.data as { weekly_revenue_target?: number | null } | null)?.weekly_revenue_target
            ? +Number((gtBiz.data as { weekly_revenue_target: number }).weekly_revenue_target).toFixed(2) : null
          const revToday = +gtSum(gtToday.data as Array<{ total_amount: number | null }>).toFixed(2)
          const revWeekCal = +gtSum(gtWeek.data as Array<{ total_amount: number | null }>).toFixed(2)
          const revLastWeekCal = +gtSum(gtLastWeek.data as Array<{ total_amount: number | null }>).toFixed(2)
          const revSwlm = +gtSum(gtSwlm.data as Array<{ total_amount: number | null }>).toFixed(2)
          // HEALTH-SIGNALS-1 / I1: every numeric the health signals expose becomes an anchor so V2
          // Check 6 can validate any figure Aria derives from the diagnostic facts.
          const healthAnchors = gtHealth?._anchor_numbers ?? []
          // GOAL-AWARE-1 (I2): goal-trajectory numerics → anchors (so Check 6 validates target/projection figures)
          const goalAnchors = gtGoal
            ? [gtGoal.weekly_target, gtGoal.projected_eow_revenue, gtGoal.gap_to_target, gtGoal.pace_required, gtGoal.on_track_pct, gtGoal.revenue_this_week, gtGoal.yesterday_actual]
              .filter((n): n is number => typeof n === 'number' && isFinite(n))
            : []
          // I10 BENCHMARK: industry percentile figures (p25/p50/p75 + own values) → anchors
          const benchmarkAnchors = gtBenchmark?.available ? gtBenchmark._anchor_numbers : []
          // I11 COUNTERFACTUAL: predicted-impact dollars of surfaced hypotheses → anchors
          const hypothesisAnchors = gtHypotheses?.available ? gtHypotheses._anchor_numbers : []
          // _anchor_values: the CLEAN numeric set Check 6 + the advisor cleaner validate against
          const anchorValues = [
            revToday, revWeekCal, revLastWeekCal, revSwlm, coveragePct,
            gtConsent.count ?? 0, gtTotalCust.count ?? 0, tuesdayAvg, tuesdayGap, targetWeekly, gtPromoActions.count ?? 0,
            ...topCustLTVs, ...healthAnchors, ...goalAnchors, ...benchmarkAnchors, ...hypothesisAnchors,
          ].filter((n): n is number => typeof n === 'number' && isFinite(n))

          // S6 PHASE 2 — THE STORED PROVENANCE IS THE LABELLED SET ONLY.
          //
          // `anchorValues` above still goes to the VERIFIER unchanged (Check 6 validates against as
          // wide a corpus as possible — dropping values there would weaken grounding). What changes
          // is what gets STORED as clickable sources: a live turn kept 33 anchors against 4 labels,
          // so 29 numbers were underlined and said nothing when clicked.
          //
          // The four spread sets — healthAnchors, goalAnchors, benchmarkAnchors, hypothesisAnchors —
          // are bare number[] with no per-value provenance, and they are where the junk came from:
          // -800, -600, -100, 100. A chart axis is not a source. They are not listed below, so they
          // are validated against but never offered as one.
          //
          // buildProvenance also drops AMBIGUOUS values. Labels were keyed by String(value), so on a
          // quiet day revenue-today, the weekly target and a promo count are all 0 and collapse to
          // one key with last-write-wins — the owner would click 0 and read whichever label landed
          // last. That is a coin-flip presented as a fact.
          turnProvenance = buildProvenance([
            { value: revToday,               label: 'Completed sales, today.' },
            { value: revWeekCal,             label: 'Completed sales, this week to date.' },
            { value: revLastWeekCal,         label: 'Completed sales, last week.' },
            { value: revSwlm,                label: 'Completed sales, the same week last month.' },
            { value: gtConsent.count ?? 0,   label: 'Customers who have consented to marketing.' },
            { value: gtTotalCust.count ?? 0, label: 'Customers on record.' },
            { value: targetWeekly,           label: 'Your weekly revenue target.' },
            { value: tuesdayAvg,             label: 'Average takings on a Tuesday.' },
            { value: coveragePct,            label: 'Share of sales with a customer attached.' },
          ])
          // OUTCOME-LOOP-1 (I4) Part 4: shape advice weights for the council. `weight` is the stored
          // [0.3,2.0] multiplier (unchanged — 4 downstream consumers depend on that frame). `success_rate`
          // is a Laplace-smoothed (positive+1)/(total+3) read-side view so a category with few/poor
          // outcomes reads as low-confidence rather than spuriously certain. Meta-confidence, not a
          // citeable dollar/% figure → deliberately NOT added to _anchor_values.
          const adviceWeightsGT = ((gtWeights.data ?? []) as Array<{ category: string; weight: number; positive_outcomes: number; negative_outcomes: number; neutral_outcomes: number }>)
            .map(w => {
              const pos = Number(w.positive_outcomes) || 0
              const neg = Number(w.negative_outcomes) || 0
              const neu = Number(w.neutral_outcomes)  || 0
              const total = pos + neg + neu
              return {
                category: w.category,
                weight: +Number(w.weight).toFixed(3),
                total_outcomes: total,
                success_rate: +((pos + 1) / (total + 3)).toFixed(3),
              }
            })
            .filter(w => w.total_outcomes > 0)
          // PLAN-PERSISTENCE-1 (I5) Part 2: only surface loops past the 7-day statistical floor
          // (DO-NOT push 'too_soon'). 5 most recent. getOpenLoops already orders by executed_at desc.
          const openLoopsGT = ((gtOpenLoops ?? []) as Array<{ outcome_status: string }>)
            .filter(l => l.outcome_status === 'ready_to_review')
            .slice(0, 5)
          ctxParsed.available_ground_truth = {
            note: 'VERIFIED LIVE QUERIES THIS TURN — these numbers are SAFE TO CITE. Any other specific figure must come from VERIFIED FIGURES or INTENT-GROUNDED FACTS.',
            revenue_today: revToday,
            revenue_this_week_calendar: revWeekCal,
            revenue_last_week_calendar: revLastWeekCal,
            same_week_last_month: revSwlm,
            payment_coverage_real_pct: coveragePct,
            payment_coverage_note: completedSales7 < 10
              ? `Only ${completedSales7} completed sales in the last 7 days — too small a sample to assess payment coverage. Do NOT claim a coverage %, "data loss", or "POS failure" from this.`
              : `${paidSaleIds.size} of ${completedSales7} completed sales have payment records (${coveragePct}% — healthy unless <95%).`,
            customer_count_with_consent: gtConsent.count ?? 0,
            total_customer_count: gtTotalCust.count ?? 0,
            top_customer_lifetime_values: topCustLTVs,
            tuesday_avg_revenue: tuesdayAvg,
            tuesday_vs_average_gap_dollars: tuesdayGap,
            target_weekly_revenue: targetWeekly,
            recent_promotion_actions: gtPromoActions.count ?? 0,
            // HEALTH-SIGNALS-1 Part 2+4: verifiable system state + what CANNOT be verified
            business_health: gtHealth ?? undefined,
            diagnostic_facts_note: 'business_health describes verifiable system state (POS health, day-of-week baseline, data freshness). known_unknowns lists what CANNOT be verified — ask the owner about those rather than asserting them. Any asserted cause (e.g. "POS broken") must be consistent with pos_health.status.',
            // GOAL-AWARE-1 (I2): weekly target trajectory — frame recommendations against the gap/pace
            goal_context: gtGoal ?? undefined,
            // OUTCOME-LOOP-1 (I4): learned per-category advice confidence from real outcomes
            advice_weights: adviceWeightsGT.length ? adviceWeightsGT : undefined,
            advice_weights_note: adviceWeightsGT.length
              ? 'advice_weights reflect how past recommendations per category actually performed. weight is a 0.3–2.0 confidence multiplier (1.0 = neutral); success_rate is Laplace-smoothed. LOWER weight / success_rate = be more cautious recommending that category again.'
              : undefined,
            // PLAN-PERSISTENCE-1 (I5): executed actions awaiting follow-up (≥7d, not yet outcome-tracked)
            open_loops: openLoopsGT.length ? openLoopsGT : undefined,
            open_loops_note: openLoopsGT.length
              ? 'open_loops are things the owner ACTED ON but you have not asked about. observed_delta is an early revenue read (not a verdict). If relevant, ask naturally how one went — do NOT assert it worked/failed from observed_delta alone.'
              : undefined,
            // I10 BENCHMARK Part 3+4: anonymized peer comparison (only present when the industry has ≥5 peers)
            industry_benchmarks: gtBenchmark?.available ? gtBenchmark.comparisons : undefined,
            industry_benchmarks_note: gtBenchmark?.available
              ? 'INDUSTRY_BENCHMARKS: industry_benchmarks compares this business to anonymized industry peers (aggregates only). Cite these when relevant. ALWAYS include sample_size when citing a benchmark.'
              : undefined,
            // I11 COUNTERFACTUAL Part 1: open hypotheses the owner has not acted on yet
            live_hypotheses: gtHypotheses?.available ? gtHypotheses.live_hypotheses : undefined,
            live_hypotheses_note: gtHypotheses?.available
              ? 'live_hypotheses are testable ideas Aria generated from this week\'s data that the owner has NOT yet seen/accepted. If relevant, proactively surface one or two with their predicted_impact_dollars. If the owner asks a "what if I do X" question, call counterfactual_simulate to run a fresh grounded prediction.'
              : undefined,
            _anchor_values: anchorValues,
          }
          // HEALTH-SIGNALS-1 Part 5: audit what diagnostic facts Aria saw this turn
          if (gtHealth) {
            void logAICallSafe({
              business_id: bid, agent_key: 'health_signals', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ pos: gtHealth.pos_health.status, dow_baseline: gtHealth.day_of_week_context.today_baseline_revenue, weather_avail: gtHealth.weather_context.available }).slice(0, 200),
            })
          }
          // GOAL-AWARE-1 (I2) Part 4: audit the goal trajectory Aria saw this turn
          if (gtGoal) {
            void logAICallSafe({
              business_id: bid, agent_key: 'goal_context', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ status: gtGoal.status, on_track_pct: gtGoal.on_track_pct, gap_to_target: gtGoal.gap_to_target }).slice(0, 200),
            })
          }
          // I11 COUNTERFACTUAL Part 5: audit the open hypotheses Aria surfaced this turn
          if (gtHypotheses?.available) {
            void logAICallSafe({
              business_id: bid, agent_key: 'hypothesis_surface', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ count: gtHypotheses.live_hypotheses.length, top: gtHypotheses.live_hypotheses.map(h => `${h.category}:${h.predicted_impact_dollars}`) }).slice(0, 200),
            })
          }
          // I10 BENCHMARK Part 5: audit the industry comparison Aria saw this turn
          if (gtBenchmark?.available) {
            void logAICallSafe({
              business_id: bid, agent_key: 'industry_benchmark', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ industry: gtBenchmark.industry, metrics: gtBenchmark.comparisons.map(c => `${c.metric_name}:${c.percentile_position}`), sample_size: gtBenchmark.comparisons[0]?.sample_size }).slice(0, 200),
            })
          }
          // OUTCOME-LOOP-1 (I4) Part 4: audit which learned advice weights Aria saw this turn
          if (adviceWeightsGT.length) {
            void logAICallSafe({
              business_id: bid, agent_key: 'advice_weights', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ categories: adviceWeightsGT.length, weights: adviceWeightsGT.map(w => `${w.category}:${w.weight}`) }).slice(0, 200),
            })
          }
          // PLAN-PERSISTENCE-1 (I5) Part 6: audit the open loops Aria saw this turn
          {
            const totalOpen = (gtOpenLoops ?? []).length
            if (totalOpen > 0) {
              void logAICallSafe({
                business_id: bid, agent_key: 'open_loops', role: 'analysis', provider: 'other', success: true,
                request_summary: bid,
                response_summary: JSON.stringify({ open_count: totalOpen, ready_to_review_count: openLoopsGT.length }).slice(0, 200),
              })
            }
          }
        } catch { /* non-fatal — council proceeds without anchors */ }
        augCtx = JSON.stringify(ctxParsed)
      } catch (e) {
        // S9 PHASE 6 (#7) — the council still answers, but WITHOUT the facts packet and the
        // ground-truth anchors. That is a quieter, more grounded answer than it should have been,
        // and until now nothing recorded that it had happened.
        console.error('[aria/ask] augmented council context FAILED — answering on raw bizCtx only:', (e as Error).message)
      }
      // RC4: COREFERENCE — the council path previously received zero conversation history, so pronouns in a
      // follow-up ("what does SHE buy") had no referent. Rehydrate the last ~10 turns (client-sent messages
      // first, else from aria_conversations by id) and inject them so the council resolves references.
      let recentHistoryBlock = ''
      try {
        let turns: Array<{ role: string; content: string }> = []
        if (clientMessages.length > 0) {
          turns = clientMessages.slice(-10)
        } else if (conversationId) {
          const { data: convRow, error: convErr } = await supabaseAdmin.from('aria_conversations')
            .select('messages').eq('id', conversationId).eq('business_id', bid).maybeSingle()
          // WALL 6 — RC4: without these turns the council cannot resolve "she"/"that" against the
          // previous turn, and the answer reads as a non-sequitur. Non-fatal, no longer silent.
          if (convErr) console.error('[aria/ask] council history unavailable:', convErr.message)
          const msgs = Array.isArray((convRow as { messages?: Array<{ role: string; content: string }> } | null)?.messages)
            ? (convRow as { messages: Array<{ role: string; content: string }> }).messages : []
          turns = msgs.slice(-10)
        }
        if (turns.length > 0) {
          recentHistoryBlock = '\n\nRECENT_CONVERSATION (resolve pronouns/"she"/"that" against this — most recent last):\n' +
            turns.map(m => `${m.role === 'assistant' ? 'Aria' : 'Owner'}: ${String(m.content ?? '').slice(0, 600)}`).join('\n')
        }
      } catch (e) {
        // S9 PHASE 6 (#7) — without history the council cannot resolve "she"/"that" against the
        // previous turn (RC4). The answer will look like a non-sequitur to the owner and like a
        // model failure to whoever reads it. It is neither.
        console.error('[aria/ask] conversation history unavailable — pronouns will not resolve:', (e as Error).message)
      }
      // ── S8 PHASE 3 — THE NOTICE THIS QUESTION CAME FROM ────────────────────────────────────
      // Re-read server-side and SCOPED TO THIS BUSINESS. The client sent an id; it did not send
      // the content, and it is not trusted to. The .eq('business_id', bid) is the whole security
      // story: three production rows share the title this bug was reported against, one per
      // business, so an unscoped lookup by id would be a cross-business read waiting to happen.
      let noticeBlock = ''
      if (noticeRef) {
        try {
          const table = noticeRef.source === 'aria_action' ? 'aria_actions' : 'aria_task_outputs'
          const cols = noticeRef.source === 'aria_action'
            ? 'id, title, category, priority, status, source, recommendation, reason, expected_impact, confidence, payload, created_at'
            : 'id, title, output_kind, status, created_at'
          const { data: noticeRow, error: noticeErr } = await supabaseAdmin
            .from(table).select(cols)
            .eq('id', noticeRef.id).eq('business_id', bid).maybeSingle()
          // RULE 7 — the error is checked, never discarded into an empty result. A notice that
          // cannot be read means the turn proceeds WITHOUT it, which is the old behaviour, rather
          // than the turn inventing what the notice might have said.
          if (noticeErr) console.error('[aria/ask] notice lookup failed:', noticeErr.message)
          else noticeBlock = formatNoticeContext(noticeRow as NoticeRecord | null, noticeRef.source)
        } catch (e) {
          console.error('[aria/ask] notice lookup threw:', (e as Error).message)
        }
      }
      const council = await runAriaCouncil(augCtx + recentHistoryBlock + noticeBlock + '\n\nOWNER_QUESTION: ' + message, bid, 'ask_aria', message)
      // COUNCIL-PORT-1 Parts 6+7: run council synthesis through the HEAL-1/GROUND-1 validator.
      // Council brains make zero LLM tool calls — their grounding is the pre-fetched context
      // (getBusinessContext + facts packet). toolsUsed=1 when that context loaded (mirrors the
      // deliverable path's grounded-source convention); 0 if it failed, arming Check 4.
      let councilText = council?.final_briefing ?? ''
      let councilBlocks = council?.ask_blocks ?? null
      if (council?.final_briefing) {
        try {
          const councilToolCallCount = bizCtx && bizCtx.length > 50 ? 1 : 0
          const councilValidated = await validateAndHeal({
            userMessage: message,
            blocks: councilBlocks,
            rawResponse: councilText,
            pipelinePath: 'council',
            businessId: bid,
            toolsUsed: councilToolCallCount,
            // GROUNDING-TEETH Check 5 corpus: full context + advisor outputs — any number the
            // synthesis cites must trace to this text (verbatim or ±2%)
            groundTruth: augCtx + '\n' + JSON.stringify(council.raw_brain_outputs ?? []),
            // GROUNDING-TEETH-V2 Check 6: CLEAN anchor values ONLY (not advisor outputs) — catches
            // numbers an advisor invented and the synthesis repeated (the V1 self-grounding escape).
            groundTruthAnchors: (() => {
              try { return JSON.stringify((JSON.parse(augCtx).available_ground_truth?._anchor_values) ?? []) }
              catch { return '[]' }
            })(),
          })
          if (councilValidated.healed) {
            councilBlocks = councilValidated.blocks
            if (councilValidated.healedText) councilText = councilValidated.healedText
          }
        } catch (e) { console.error('[aria/ask] council heal non-fatal:', (e as Error).message) }
      }
      if (council?.final_briefing) {
        let savedConvId = conversationId
        try {
          savedConvId = await upsertConversation(bid, userId, conversationId, message, councilText, intent.type, undefined, undefined, undefined, turnProvenance ?? undefined)
        } catch (e) {
          console.error('[aria/ask] upsertConversation failed (council):', (e as Error).message)
        }
        // Fire-and-forget memory extraction + conversation summarisation for council responses
        extractAndStoreMemories(bid, message, councilText, savedConvId).catch(() => {})
        if (savedConvId) {
          const _cid = savedConvId
          Promise.resolve(supabaseAdmin.from('aria_conversations').select('messages').eq('id', _cid).eq('business_id', bid).maybeSingle())
            .then(({ data: conv }) => {
              const msgs = Array.isArray((conv as { messages?: Array<{ role: string; content: string }> } | null)?.messages)
                ? (conv as { messages: Array<{ role: string; content: string }> }).messages
                : []
              // SUMMARIZER-FIX-1 Part 4: augCtx carries the AVAILABLE_GROUND_TRUTH anchors +
              // verified business numbers — the summarizer's numeric-grounding corpus
              summariseConversation(bid, msgs, _cid, augCtx).catch(() => {})
            }).catch(() => {})
        }
        return makeTurnResult('council', {
          // S6 PHASE 1 — drop any block that would render its header with nothing under it. The
          // council IS meant to return sections (council.ts:457-461 asks for them); when the model
          // returns one paragraph instead, `ask_blocks` can still carry an empty brain_readouts,
          // and the renderer would print COUNCIL READ + four role labels over nothing.
          blocks: (() => {
            const kept = dropContentFreeBlocks(councilBlocks as AskBlockType[] | null)
            return kept.length > 0 ? kept : [{ type: 'lead', content: councilText }]
          })(),
          followups: council.ask_followups ?? [],
          used_council: true,
          // S8 PHASE 2 — WHICH advisors were lost, so the owner is told the answer is narrower
          // rather than being handed a confident-looking partial. `meta.brains_failed` already
          // counted them, but that count only ever reached the council_runs table and the agents
          // dashboard. Empty array = a complete council; the field is never omitted, so a client
          // cannot read "absent" as "fine".
          advisors_lost: (council.advisors_lost ?? []).map(a => a.role),
          // S3 PHASE 1 — the anchors travel to the client so the renderer can tier the figures it
          // is about to draw. Null on paths that computed none; never fabricated to fill the field.
          provenance: turnProvenance,
          response: councilText,
          conversation_id: savedConvId ?? conversationId,
          intent: intent.type,
          action: null,
          cost_usd_cents: 0,
          downloads: null,
          tool_calls: [],
          // LOGGING-FIX-1 Part 3: serving-path observability (debug-only)
          served_by: council.served_from_cache ? 'council_cache' : 'council_fresh',
        })
      }
    } catch (e) {
      console.error('[aria/ask] council failed, falling back to single-model:', (e as Error).message)
    }
  }

  // The council failed, returned no briefing, or the gate did not open — DECLINE, and the spine
  // offers `main`. route.ts expressed this by logging "falling back to single-model" and running on.
  return null
}
