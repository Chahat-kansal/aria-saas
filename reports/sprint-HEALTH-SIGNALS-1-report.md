# Sprint HEALTH-SIGNALS-1 — Diagnostic Facts So Aria Reasons From System State
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green

> The principle this session proved: every win = ADD CORRECT FACTS, never add prompt rules. Aria said
> "POS payment sync is broken" not because the data was wrong (real $7) but because it couldn't SEE
> that POS is healthy — so it inferred "broken" from low revenue. Fix = expose the diagnostic facts
> (pos_health=OK, day-of-week baseline, known_unknowns). A "POS broken" claim is now structurally
> inconsistent with the context, and the things Aria can't verify are listed so it asks instead.

---

## Files changed (3 + report)

| File | Parts |
|---|---|
| `src/lib/aria/health-signals.ts` | NEW — Part 1: `computeHealthSignals(businessId)` |
| `src/app/api/aria/ask/route.ts` | Parts 2/4/5: surface to groundTruth + `_anchor_values` + diagnostic note + `health_signals` log |
| `src/lib/aria/council.ts` | Part 3: ONE neutral fact-pointer in advisor + synthesis input |

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — groundTruth construction (ask/route.ts, post-V2, the object the signals join)
```ts
ctxParsed.available_ground_truth = {
  note: 'VERIFIED LIVE QUERIES THIS TURN — these numbers are SAFE TO CITE…',
  revenue_today, revenue_this_week_calendar, revenue_last_week_calendar, same_week_last_month,
  payment_coverage_real_pct, payment_coverage_note, customer_count_with_consent, total_customer_count,
  top_customer_lifetime_values, tuesday_avg_revenue, tuesday_vs_average_gap_dollars,
  target_weekly_revenue, recent_promotion_actions, _anchor_values,
}
```

### Q3 — council advisor input assembly (council.ts:880, pre-change)
```ts
const userPrompt = [verifiedFiguresBlock, learningContext, summaryBlock, memoryBlock, qualityCtx,
  'Business data:\n' + cleanContextStr].filter(Boolean).join('\n\n')
```
`cleanContextStr` = `businessContext` (= `augCtx`) minus `aria_facts_packet`. Since `available_ground_truth.business_health` lives inside `businessContext`, the advisors and synthesis **already receive the health facts as data** — Part 3 only adds the one-line pointer.

### Q4 — weather_history table — NEEDS-DB
Could not verify from repo (no migration found). `computeHealthSignals` queries it inside try/catch; on any error returns `weather_context: { available: false, reason: 'weather_history not yet implemented' }` — **never blocks** (per DO NOT). When the table is added later, the rainy/clear averages can be populated in the marked spot.

### Q5 — pos_sales timestamp columns (database.types.ts)
`created_at`, `sale_completed_at`, `last_edited_at`, `xero_synced` (boolean). **No dedicated sync-timestamp column** → `last_sync_at` uses the newest recorded completed sale's `created_at` as the freshness proxy (documented in code).

---

## Part 1 — `computeHealthSignals` (5 signals)
- **pos_health**: `wh_payments_coverage` RPC (the AUTOPILOT-FIX-1 completed-only coverage) + newest completed sale. Status rules match AUTOPILOT-FIX-1's small-sample guard exactly: `NO_DATA` (<5 completed/7d — "low revenue does NOT imply broken POS"), `DEGRADED` (≥10 sample AND coverage<95%), `OK` (≥95% coverage AND <48h since sale); any other case defaults `OK` ("quiet trade is not a system failure" — never asserts broken on thin/quiet data).
- **day_of_week_context**: 56-day completed sales bucketed to AEST days → per-DOW average, rank (1=best,7=worst), today's baseline, today's actual (excluded from its own baseline), deviation %.
- **weather_context**: `{ available: false }` (table not present — graceful).
- **data_freshness**: newest sale + last executed `aria_actions`.
- **known_unknowns**: the fixed 5 ("shop physically open", "staff present", "local event/closure", "payment-provider outage", "marketing/promo running") — the explicit list of what Aria CANNOT verify.

## Part 2 — surfaced to groundTruth (ask/route.ts)
`computeHealthSignals(bid)` added to the existing anchor `Promise.all`; result → `available_ground_truth.business_health`. **Per-anchor entry into `_anchor_values`**: `pos_health.payment_coverage_pct`, `day_of_week_context.today_baseline_revenue`, `…actual_revenue_so_far`, `…deviation_from_baseline_pct` (finite-filtered) — so V2 Check 6 can validate any figure Aria derives from the diagnostic facts.

## Part 3 — council fact-pointer (ONE line, no rules)
Added to the shared advisor `userPrompt` AND the synthesis input (same single line):
> `DIAGNOSTIC_FACTS: The system state is in business_health (within available_ground_truth). Reason from these facts. If you assert a cause (e.g. "POS broken"), it must be consistent with pos_health.status. known_unknowns lists what cannot be verified — ask the owner rather than asserting.`

This is a fact-pointer, not a phrasing script — it tells advisors WHERE the facts are and that a cause must be consistent with them; Aria still decides what to say. No advisor *system* prompt (buildGrowthPrompt/Risk/Strategy/CONTEXT_PROMPT) was modified — the pointer lives in the shared input, satisfying "ONE neutral fact-pointer line."

## Part 4 — diagnostic note (sibling of the pending-actions framing)
`available_ground_truth.diagnostic_facts_note`: "business_health describes verifiable system state… known_unknowns lists what CANNOT be verified — ask the owner about those rather than asserting them. Any asserted cause must be consistent with pos_health.status."

## Part 5 — `health_signals` logging
`logAICallSafe({ agent_key:'health_signals', role:'analysis', provider:'other', request_summary: businessId, response_summary: {pos,dow_baseline,weather_avail} })` — fire-and-forget after the anchors build. role/provider are valid CHECK values (post LOGGING-AUDIT-3) so the row lands.

## Additive-only / DO-NOT compliance
New module + new groundTruth fields + new anchors + ONE shared pointer line + one log row. No prompt RULES added (the pointer is a fact-locator, not a phrasing directive); no "ask vs assert" scripting; no advisor system prompt touched; no downstream stripping of qualitative claims (the facts make a wrong cause structurally inconsistent — V2 Check 6 still only touches numbers); weather non-blocking; no dependencies. RULE 0 ✓.

## Sample healthSignals (Sip — NEEDS-DB to confirm live values)
Expected shape on the live test (chat Claude confirms):
```json
{ "pos_health": { "status": "OK", "payment_coverage_pct": 100, "completed_sales_7d": 6,
    "hours_since_last_sale": ~2, "reasoning": "100% payment coverage on 6 completed sales; last sale ~2h ago — POS is healthy." },
  "day_of_week_context": { "today_dow": "<today>", "today_baseline_revenue": ~327.07,
    "today_baseline_rank": 7, "actual_revenue_so_far": 7.00, "deviation_from_baseline_pct": ~-97.9,
    "reasoning": "<dow> averages $327.07 (rank 7/7). Today's $7.00 is -97.9% vs that baseline." },
  "weather_context": { "available": false, "reason": "weather_history not yet implemented" },
  "data_freshness": { … }, "known_unknowns": [5 items], "computed_at": "…" }
```

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH**

## Verify post-deploy
Fresh chat "How am I doing this week?":
- $7 + $4,446.90 + LTVs preserved (V2 anchors intact)
- NO "POS payment sync is broken" as fact (pos_health.status='OK' in context)
- Aria states POS healthy + asks known_unknowns ("Was the shop open? Local disruption? Promo active?")
- Uses Tuesday/dow baseline to frame the anomaly
```sql
select agent_key, response_summary from aria_ai_calls
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
  and agent_key='health_signals' and created_at > now() - interval '5 minutes';
```
Pass: a `health_signals` row with `{pos, dow_baseline, weather_avail}` summary.
