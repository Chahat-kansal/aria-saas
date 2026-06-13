# Sprint I1 — HEALTH-SIGNALS-1 (diagnostic facts in groundTruth, no prompt rules)
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green
**RULE 0 (UPGRADE_ONLY) + RULE 9 (no scaffolds/prompt-rules)**

> Builds on commits `4c2d1a7f` (base signals + groundTruth wiring + council fact-pointer + logger) and
> `47d67603` (existing-table sourcing + `_anchor_numbers`). This run completes the full I1 spec:
> `INSUFFICIENT_SAMPLE` status, `last_sync_at` from the wiring check, the 6th known-unknown,
> a real **open-meteo** weather signal (cache-first, lat/lng-gated), and a dedicated DOW-baseline cache.

---

## Files changed this run (1 + report)
| File | Change |
|---|---|
| `src/lib/aria/health-signals.ts` | status enum → `INSUFFICIENT_SAMPLE`; `last_sync_at` ← wiring check; 6th known-unknown; weather via open-meteo (cache-first, lat/lng-gated); DOW-baseline cache write; weather `temp_c` into anchors |

(Already present & unchanged: `business_health` in groundTruth + `_anchor_numbers` spread + `health_signals` logger in `route.ts`; the ONE council fact-pointer line.)

---

## PRE-FLIGHT (verbatim)

### 1. pwd
`C:\Users\kansa\aria-saas-audit` ✓

### 2. groundTruth construction (ask/route.ts — the object computeHealthSignals joins)
```ts
ctxParsed.available_ground_truth = {
  note, revenue_today, revenue_this_week_calendar, revenue_last_week_calendar, same_week_last_month,
  payment_coverage_real_pct, payment_coverage_note, customer_count_with_consent, total_customer_count,
  top_customer_lifetime_values, tuesday_avg_revenue, tuesday_vs_average_gap_dollars, target_weekly_revenue,
  recent_promotion_actions,
  business_health: gtHealth ?? undefined,        // ← health signals
  diagnostic_facts_note: '…ask the owner about [known_unknowns] rather than asserting…',
  _anchor_values: anchorValues,                  // includes ...(gtHealth?._anchor_numbers ?? [])
}
```

### 3. council advisor input assembly (council.ts:880, with the I1 fact-pointer)
```ts
const diagnosticPointer = 'DIAGNOSTIC_FACTS: The system state is in business_health (within available_ground_truth). Reason from these facts. If you assert a cause (e.g. "POS broken"), it must be consistent with pos_health.status. known_unknowns lists what cannot be verified — ask the owner rather than asserting.'
const userPrompt = [verifiedFiguresBlock, learningContext, summaryBlock, memoryBlock, qualityCtx, diagnosticPointer, 'Business data:\n' + cleanContextStr].filter(Boolean).join('\n\n')
```
(Same single line also injected into `synthesisInput`.)

### 4. logAICallSafe import — CONFIRMED
`route.ts` imports `{ logAICallSafe } from '@/lib/aria/log-ai-call'` (LOGGING-AUDIT-3 helper).

### 5. wh_payments_coverage RPC (AUTOPILOT-FIX-1)
`wh_payments_coverage(p_business_id uuid, p_since timestamptz) RETURNS (total_sales, paid_sales)` — `status = 'completed'` only (the fixed denominator). Used as the authoritative live coverage.

### 6. aria_signal_cache signal_types — NEEDS-DB (chat-Claude)
Audit reports existing: `day_of_week_pattern` (3 rows), `revenue_velocity_7d`/`churn_velocity`/`avg_basket_trend` (16 each). I1 reads cache staleness from all of them, reads/writes its OWN `weather_today` + `dow_baseline_health` types (dedicated, to avoid clobbering `day_of_week_pattern`'s anomaly payload — RULE 0).

### Schema confirmations
`businesses.lat` + `businesses.lng` (number|null) — present ✓. open-meteo already used by `flash-revenue-agent`/`labour-optimisation-agent` (free HTTP, no new dep) ✓. `aria_signal_cache` Insert = `{business_id, cache_key, signal_type, payload, expires_at}` ✓.

---

## Parts 1–4 (additive)

### Part 1 — computeHealthSignals reads existing tables (does NOT recompute what exists)
- **pos_health**: live `wh_payments_coverage` RPC (coverage) + `max(created_at)` completed sale; `last_sync_at` = `max(checked_at)` from `aria_wiring_health_checks` where `check_name='payments_coverage_pct'` (fallback newest sale); `wiring_health_status` = that check's latest green/amber/red. Status: **OK** (≥95% & ≥5 sample & <48h), **DEGRADED** (<95% & ≥10 sample — AUTOPILOT-FIX-1 baseline), **INSUFFICIENT_SAMPLE** (<5 — "low revenue does NOT imply broken POS"), else OK ("quiet trade is not a failure").
- **dow_context**: 56-day completed sales bucketed to AEST days → per-DOW avg, rank (1=best…7=worst), today's baseline (today excluded), actual, deviation %. Baselines cached 24h under dedicated `dow_baseline_health` signal_type.
- **weather_context**: cache-first `aria_signal_cache.weather_today` (6h TTL); miss → **open-meteo** current weather (gated on `businesses.lat/lng`; null → `{available:false, reason:'no_location'}`); writes 6h cache. Surfaces conditions text + temp_c + rain_pct. (Historical rainy/clear averages stubbed null — no weather-history table yet.)
- **data_freshness**: last sale, last executed action, **real** `stale_signals_count` (expired `aria_signal_cache` rows), last health-check date.
- **known_unknowns**: 6 items (added "Whether private events / catering / wholesale moved revenue off-POS").

### Part 2 — surfaced to groundTruth (route.ts)
`business_health = computeHealthSignals(bid)`; `_anchor_numbers` (coverage, completed_7d, hours-since-sale, dow baseline/rank/actual/deviation, stale count, **weather temp**, every wiring-check value) spread into `_anchor_values` → V2 Check 6 validates any figure Aria derives.

### Part 3 — advisors + synthesis (council.ts), the ONE fact-pointer line (verbatim)
> `DIAGNOSTIC_FACTS: The system state is in business_health (within available_ground_truth). Reason from these facts. If you assert a cause (e.g. "POS broken"), it must be consistent with pos_health.status. known_unknowns lists what cannot be verified — ask the owner rather than asserting.`

NOT a phrasing rule — a fact-locator. No advisor system prompt (buildGrowthPrompt/Risk/Strategy/CONTEXT_PROMPT) modified. RULE 9 ✓.

### Part 4 — logAICallSafe
`{ agent_key:'health_signals', role:'analysis', provider:'other', request_summary: bid, response_summary: JSON({pos, dow_baseline, weather_avail}) }` — valid CHECK values (lands).

## Sample healthSignals for Sip (NEEDS-DB to confirm live)
```json
{ "pos_health": { "status": "OK", "payment_coverage_pct": 100, "completed_sales_7d": 6,
    "hours_since_last_sale": ~2, "last_sync_at": "2026-06-13T05:00:…", "wiring_health_status": "green",
    "reasoning": "100% payment coverage on 6 completed sales; last sale ~2h ago — POS is healthy. (daily wiring check: green)" },
  "dow_context": { "today_dow":"<today>", "today_baseline_revenue":~327.07, "today_baseline_rank":7,
    "actual_revenue_so_far":7.00, "deviation_from_baseline_pct":~-97.9 },
  "weather_context": { "available": true, "conditions_today":"rain 9°C, …", "temp_c":9, "rain_pct":80 }
    // OR { available:false, reason:'no_location' } if lat/lng unset,
  "data_freshness": { "stale_signals_count": <real>, … }, "known_unknowns": [6 items], "_anchor_numbers":[…], "computed_at":"…" }
```

## Additive confirmation (Parts 1-4)
New table reads + open-meteo fetch + two dedicated cache writes + folded fields — the base live computation, RPC, dow, known_unknowns all intact. No prompt rules (RULE 9). No advisor system prompt changed beyond the one fact-pointer (added in 4c2d1a7f, untouched). Weather non-blocking on missing location. No dependencies. RULE 0 ✓.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH**

## Verify post-deploy
1. `select * from aria_ai_calls where agent_key='health_signals' and business_id='ff5055a0-…' and created_at > now() - interval '5 minutes';` → row with `{pos, dow_baseline, weather_avail}`.
2. Fresh chat "how am I doing this week?" → NO "POS payment sync is broken" (pos_health.status='OK'); Aria states POS healthy / asks known_unknowns; dow context surfaces ("Tuesday baseline $327, today's $7 still ~98% below").
