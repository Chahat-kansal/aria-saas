# Sprint I1 — HEALTH-SIGNALS-1 (existing-table sourcing + full anchor coverage)
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green

> Note: the base HEALTH-SIGNALS-1 feature shipped in commit `4c2d1a7f` (groundTruth.business_health,
> the 5 signals, the council fact-pointer, and the `health_signals` logger). The named prompt file
> `prompts/I1-health-signals.md` does not exist in the repo, so this run follows the typed I1 spec,
> which adds two requirements the base sprint omitted: **read the EXISTING precomputed
> `aria_wiring_health_checks` + `aria_signal_cache` tables**, and **push EVERY numeric into
> `_anchor_values`**. Both done additively (RULE 0).

---

## Files changed (2 + report)

| File | Change |
|---|---|
| `src/lib/aria/health-signals.ts` | I1: read `aria_wiring_health_checks` + `aria_signal_cache`; `wiring_health_status` on pos_health; real `stale_signals_count`; new `_anchor_numbers` (every numeric) |
| `src/app/api/aria/ask/route.ts` | I1: `healthAnchors = gtHealth._anchor_numbers` (was a manual 4-field list) |

(Already present from `4c2d1a7f`, unchanged this run: `business_health` in groundTruth, the council fact-pointer line, the `health_signals` logAICallSafe logger, the `diagnostic_facts_note`.)

---

## PRE-FLIGHT

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Data-source tables (database.types.ts — verbatim columns)
`aria_wiring_health_checks`: `business_id, check_name, status, value, threshold, details(Json), checked_at, id` — written by the daily `aria-health-monitor` cron; `check_name` includes `payments_coverage_pct`, `headless_sales`, `pending_aria_actions`, `briefing_table_writes_24h`; `status` ∈ green/amber/red; `value` is the numeric metric.
`aria_signal_cache`: `business_id, cache_key, signal_type, payload(Json), created_at, expires_at, id` — existing signal cache; staleness = rows past `expires_at`.
Both confirmed present (`grep -c` → 1 each).

### `wh_payments_coverage` RPC
The AUTOPILOT-FIX-1-fixed completed-only coverage — used as the authoritative LIVE coverage; the wiring check's `payments_coverage_pct` status corroborates it.

---

## What I1 added (additive)

### health-signals.ts — three sources now feed the signals
- `Promise.all` extended with two reads: latest 20 `aria_wiring_health_checks` rows (newest-first) and all `aria_signal_cache` rows for the business.
- **pos_health.wiring_health_status** — the daily cron's latest green/amber/red verdict on `payments_coverage_pct`, appended to the reasoning ("(daily wiring check: green)"). The live RPC remains the authoritative coverage number + the small-sample guard (NO_DATA<5 / DEGRADED≥10&<95% / else OK) unchanged.
- **data_freshness.stale_signals_count** — now the REAL count of expired `aria_signal_cache` rows (was hardcoded 0); reasoning notes the last health-check date from wiring.
- **`_anchor_numbers: number[]`** — every numeric the signals expose: coverage %, completed_7d, hours_since_last_sale, dow baseline, dow rank, today's actual, deviation %, stale count, AND every `aria_wiring_health_checks.value` (finite-filtered). This is the "push EVERY numeric into _anchor_values" requirement.

### route.ts — full anchor coverage
`healthAnchors` was a manual 4-field list; now `gtHealth?._anchor_numbers ?? []` — spread into `_anchor_values` so V2 Check 6 validates ANY figure derived from ANY health signal (not just the 4 hand-picked ones).

## RULE 0 / RULE 9 compliance
- **Extended, never removed**: the base computeHealthSignals computation (live RPC + dow + weather + known_unknowns) is intact; I added the two table reads and folded their values in. ✓
- **NO prompt rules (RULE 9)**: the council change is still the single neutral fact-pointer from `4c2d1a7f` — untouched this run, no new rules, no phrasing scripts. ✓
- Logger unchanged: `health_signals`, role=`analysis`, provider=`other` (valid CHECK values, lands). ✓
- No dependencies; weather still non-blocking (`available:false` when `weather_history` absent).

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH**

## Verify post-deploy
Fresh chat "How am I doing this week?":
- `pos_health.status='OK'` with `wiring_health_status` corroboration → NO "POS broken" assertion
- V2 anchors + all health numerics in `_anchor_values` → any figure Aria derives from the signals is validatable
```sql
select agent_key, response_summary from aria_ai_calls
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
  and agent_key='health_signals' and created_at > now() - interval '5 minutes';
```
Pass: a `health_signals` row with `{pos, dow_baseline, weather_avail}`; the response cites POS as healthy + asks the `known_unknowns`.
