# Sprint I3 — PATTERN-MEMORY-1 (detect data patterns → aria_business_memory)
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green. RULE 0 UPGRADE_ONLY.

> aria_business_memory stores what the OWNER said. I3 adds what the DATA says: SQL-only (no LLM,
> deterministic) detection of DURABLE patterns, written as `kind='pattern'`, `source_type='signal'`,
> so future chats reason from compounding intelligence. Distinct from the EPHEMERAL `aria_signal_cache`
> (TTL-based) — patterns are durable distillations, superseded only on content change.

---

## Files changed (5 + report)
| File | Part |
|---|---|
| `supabase/migrations/20260614000001_pattern_memory_kind.sql` | NEW — Part 0: kind CHECK adds 'pattern' (DO NOT auto-exec; chat-Claude applies) |
| `src/lib/aria/pattern-detection.ts` | NEW — Part 1: `detectPatterns()` (5 SQL detectors) |
| `src/app/api/cron/pattern-memory/route.ts` | NEW — Part 2: weekly cron, insert/supersede |
| `vercel.json` | Part 2: cron entry `0 3 * * 1` (Mon 13:00 AEST) |
| `src/lib/aria/memory/recall.ts` | Part 3: DATA PATTERNS line (≤5, prioritized) |
| (cron) | Part 4: `pattern_detector` log |

---

## PRE-FLIGHT (verbatim)

### 1. pwd
`C:\Users\kansa\aria-saas-audit` ✓

### 2. aria_business_memory.kind CHECK — NEEDS-DB (audit-provided)
Current: `['preference', 'fact', 'tried', 'decision', 'concern', 'goal']`. The migration (Part 0) drops + re-adds with `'pattern'` appended. (The constraint isn't in `supabase/migrations/` — created via dashboard/older migration — so the exact name `aria_business_memory_kind_check` is the audit's; the migration uses `DROP CONSTRAINT IF EXISTS` to be safe.)

### 3. I1/I2 groundTruth pattern — confirmed
I1 (`computeHealthSignals`) + I2 (`computeGoalContext`) each add a structured fact to `available_ground_truth`. I3 differs: patterns are DURABLE (written to a table by a cron), surfaced via the existing memory-recall path — not recomputed per chat.

### 4. aria_signal_cache existing signal_types (avoid duplication)
`day_of_week_pattern`, `revenue_velocity_7d`, `churn_velocity`, `avg_basket_trend` (signal-engine, ephemeral) + I1's `weather_today`/`dow_baseline_health`. I3 writes to **aria_business_memory** (durable), NOT aria_signal_cache — zero overlap, signal-engine untouched.

### Schema confirmations
`aria_business_memory.superseded_by (string|null)` exists → used for supersession. `pos_sale_items` has `sale_id, product_name, quantity, customer_id`. vercel.json: **9 function configs (≤22 ✓)**; crons 54→55 (the cron is covered by the `src/app/api/cron/**/*.ts` maxDuration glob — no new function config). Weekly schedule = daily-max-compliant (≤ daily frequency).

---

## Part 1 — detectPatterns (5 SQL-only detectors, confidence ≥ 0.6 to emit)
1. **WEEKDAY_BASELINE** (56d): per-DOW avg revenue, ≥4 sale-days observed. `"Weekday revenue baseline (last 56 days): Saturday $X, Friday $Y, …"` topic=trading_patterns, importance 7.
2. **PEAK_HOUR** (30d, ≥20 sales): top 3 hours by txn count. `"Peak hours: 8:00 (~N txns/day), …"` topic=trading_patterns, importance 6.
3. **ITEM_CO_OCCURRENCE** (30d basket analysis, pos_sale_items ⋈ completed sales): top co-occurring pair, ≥5 co-occurrences AND ≥25% support. `""X" and "Y" sell together in ~N% of baskets…"` topic=product_patterns, importance 6.
4. **SEASONAL_TREND** (6mo, ≥3 months): avg MoM revenue change. `"Revenue trending +X% month-over-month…"` topic=revenue_trend, importance 7.
5. **CUSTOMER_RETENTION_PATTERN** (90d, ≥20 sales w/ customer_id): % revenue from repeat (≥2 visits) customers. `"N% of revenue comes from repeat customers…"` topic=customer_patterns, importance 7.
Each detector is independently try/caught (graceful); all bucket UTC→AEST (+10h). **No LLM** — fully deterministic.

## Part 2 — weekly cron (`/api/cron/pattern-memory`, `0 3 * * 1`)
SEC-1 `CRON_SECRET` bearer auth; active+trialing businesses; 260s deadline guard. Per business: gate on **≥30 days pos_sales history** (oldest completed sale ≤ 30d ago) AND **skip if a pattern was written <7 days ago**. For each detected pattern: if an active pattern with the same `topic` has identical `content` → skip (no duplicate); else insert the new pattern, and if an old same-topic active pattern existed → set it `is_active=false, deleted_at, deleted_reason='superseded', superseded_by=<new id>` (history preserved, RECALL-PARITY-1 archive convention).

## Part 3 — recall prioritization (recall.ts)
`formatMemoriesForPrompt` gains a FIRST line: `DATA PATTERNS (detected from your sales — durable, data-grounded intelligence): …` capped at **5** patterns (token-bloat guard), ordered by the upstream importance sort. **RECALL-PARITY-1 NOT broken**: `recallMemories` still applies `is_active=true AND deleted_at IS NULL` (+ `confidence ≥ 0.6`) upstream — patterns flow through that exact filter; I only added a render line for the already-fetched `kind='pattern'` group. No filter changed.

## Part 4 — log
`logAICallSafe({ agent_key:'pattern_detector', role:'data', provider:'other', response_summary:{patterns_detected, patterns_written, patterns_superseded, skipped} })` — valid CHECK values (role 'data' ∈ list, provider 'other' ∈ list).

## DO-NOT compliance
- Confidence threshold 0.6 (default) — patterns below are dropped. ✓
- No duplicates — supersede on content change, skip on identical. ✓
- aria_signal_cache untouched; patterns are durable in aria_business_memory. ✓ signal-engine cron unaffected. ✓
- SQL-only, deterministic — no LLM pattern generation. ✓

## Migration SQL (FOR CHAT-CLAUDE TO APPLY)
```sql
ALTER TABLE aria_business_memory DROP CONSTRAINT IF EXISTS aria_business_memory_kind_check;
ALTER TABLE aria_business_memory ADD CONSTRAINT aria_business_memory_kind_check
  CHECK (kind = ANY (ARRAY['preference', 'fact', 'tried', 'decision', 'concern', 'goal', 'pattern']));
```
**Apply BEFORE triggering the cron** — inserts with `kind='pattern'` are rejected until the CHECK allows it (and, post LOGGING-AUDIT-3, the rejection would be surfaced, not silent).

## Sample patterns for Sip (NEEDS-DB — after migration + cron run)
```
kind='pattern' source_type='signal':
  trading_patterns  | "Weekday revenue baseline (last 56 days): Saturday $..., Friday $..., Tuesday $327, ..."  imp 7
  trading_patterns  | "Peak hours (last 30 days): 8:00 (~N txns/day), 9:00 ..."                                imp 6
  product_patterns  | ""Big Breakfast" and "Flat White" sell together in ~78% of baskets…"                     imp 6
  revenue_trend     | "Revenue trending +X% month-over-month (last 6 months)."                                  imp 7
  customer_patterns | "62% of revenue (last 90 days) comes from repeat customers; N identified customers."      imp 7
```

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- vercel.json: **9 function configs (≤22)** ✓; new cron weekly (daily-max) ✓
- Commit: **STOP BEFORE PUSH**

## Verify post-deploy
1. Apply the migration (chat-Claude).
2. `GET /api/cron/pattern-memory` with `Authorization: Bearer $CRON_SECRET`.
3. `select kind, source_type, topic, left(content,80), importance from aria_business_memory where business_id='ff5055a0-…' and kind='pattern' order by importance desc;` → 3-5 real-data pattern rows.
4. Fresh chat "what patterns do you see in my sales?" → Aria cites the detected patterns from memory.
