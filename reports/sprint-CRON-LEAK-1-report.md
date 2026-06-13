# Sprint CRON-LEAK-1 — hypothesis_engine Fire-Pattern Audit
**Date:** 2026-06-13 · AUDIT-AND-FIX → resolved **Outcome A (NO FIX)**

> **Diagnosis: the 16-fires-in-3.5-min burst is an intentional once-daily batched per-business loop.**
> Code structurally guarantees `fires == distinct_businesses` per run. No bug, no schedule violation,
> no runaway. Docs-only commit; zero code changes.

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — Locate (grep)
```
src/app/api/cron/hypothesis-engine/route.ts   ← the cron handler
src/lib/aria/hypothesis/generate.ts           ← generateHypothesesForBusiness (agentKey:'hypothesis_engine')
```
(`outcome-check/route.ts` matched on the word "hypothesis" but does not fire the engine — it reads outcomes.)

### Q4 — vercel.json cron config (verbatim, lines 107-108)
```json
    {
      "path": "/api/cron/hypothesis-engine",
      "schedule": "0 15 * * *"
    }
```
**Daily at 15:00 UTC = 01:00 AEST.** Daily-max compliant → **rules out Outcome C** (schedule misconfiguration).

### Q3 — The handler (`hypothesis-engine/route.ts`, the loop, verbatim)
```ts
const { data: businesses } = await supabaseAdmin
  .from('businesses').select('id')
  .eq('is_active', true).in('subscription_status', ['active', 'trialing'])
…
const DEADLINE_MS = 260_000  // 260s — stop before Vercel's 300s kill
const cronStart = Date.now()
for (const biz of businesses) {
  if (Date.now() - cronStart > DEADLINE_MS) { errors.push({…'approaching Vercel timeout'}); break }
  try {
    const { hypotheses, evidence_payload } = await generateHypothesesForBusiness(biz.id)
    const inserted = await persistHypotheses(biz.id, hypotheses, evidence_payload)
    totalHypotheses += inserted; processed++
  } catch (e) { errors.push({ business_id: biz.id, error: (e as Error).message.slice(0, 200) }) }
}
```
Structural facts:
- **Sequential `await`** per business — NOT `Promise.all`, no parallel fan-out → no burst-in-parallel.
- **One Anthropic call per business:** `generateHypothesesForBusiness` (generate.ts) makes exactly ONE `callAnthropic(... agentKey: 'hypothesis_engine' ...)` at line 132. The `Promise.all` at generate.ts:50 is the 7 data-fetch reads (DB, not LLM); the `for`/`.map` at :84-125 are in-memory aggregation. → `aria_ai_calls` rows for this agent_key == number of businesses processed.
- **Single caller:** `grep generateHypothesesForBusiness` → only the cron (route.ts:42). No API route, no second scheduler, no recursion, no self-scheduling, no retry loop. → rules out **Outcome B**.
- **Bounded:** 260s deadline guard + `break` → cannot run away even with many businesses.

### Q5/Q6 — DB diagnostics (NEEDS-DB — chat Claude runs; expected result stated)
The code makes the DB query a **confirmation, not a discovery**: `fires_per_hour` must equal `distinct_businesses` for `agent_key='hypothesis_engine'` in any given hour, because the loop fires once per distinct business in one daily run.
```sql
-- Q5: per-hour shape
select date_trunc('hour', created_at) as hour, count(*) as fires,
  count(distinct business_id) as distinct_businesses
from aria_ai_calls
where agent_key='hypothesis_engine' and created_at > now() - interval '7 days'
group by 1 order by fires desc limit 20;
-- EXPECTED: one row per day at the 15:00 UTC hour, fires == distinct_businesses (~16). Other hours empty.

-- Q6: cross-cron burst sweep
select agent_key, count(*) as fires_in_burst, min(created_at) as burst_start,
  max(created_at) as burst_end, count(distinct business_id) as distinct_businesses
from aria_ai_calls
where created_at > now() - interval '7 days'
group by agent_key having count(*) > 50 order by count(*) desc;
-- EXPECTED: every high-volume agent_key is a per-business batched loop → fires ≈ N×distinct_businesses
-- where N = LLM calls per business for that agent (council_* fire ~5/business; ask_aria varies).
-- FLAG only an agent_key where fires >> distinct_businesses AND it is NOT a known multi-call-per-business
-- agent (council, heal) AND the burst recurs sub-daily. None expected from the cron family — all use the
-- same sequential per-business loop shape (daily-briefing-submit, signal-engine, customer-scoring, etc.).
```

---

## DIAGNOSIS — Outcome A (intentional batched loop)

`hypothesis-engine` runs **once daily** (`0 15 * * *`, 01:00 AEST). In that single run it iterates active+trialing businesses **sequentially**, making **exactly one** `hypothesis_engine` Anthropic call per business (generate.ts:132), each immediately persisted to `aria_hypotheses`. With ~16 qualifying businesses, that is 16 `aria_ai_calls` rows clustered in ~3.5 minutes (~13s/business: one LLM call + 7 context reads + 2 writes), then silent for 24h until the next daily run. This is the textbook batched-cron shape used across the whole cron family — `fires == distinct_businesses` is guaranteed by the single sequential caller. **No loop bug (B ruled out: single caller, sequential await, deadline-bounded, no recursion/retry). No schedule violation (C ruled out: daily-max). No code change warranted.**

## Outcome → action
**NO FIX.** Per the spec's Outcome A path: document and stop. The `aria_hypotheses` feature (1,423 rows) and its readers are untouched, as required.

## Function/cron count (informational — AUDIT-1 context, not this sprint's remit)
`vercel.json`: **9 function configs** (the "locked 22" rule → compliant ✓) and **54 cron entries**. AUDIT-1 already flagged the 54-vs-plan-limit question + 8 orphan cron folders for **CRON-1** — out of scope here (this sprint validated a fire pattern, not the cron census). No schedule touched.

## No build gate
No code changed → `npx tsc --noEmit` / `npm run build` not required (BUILD GATE is gated on "if fix lands"; none did). Working tree: report-only.

## Commit
`docs(cron-leak-1): hypothesis_engine burst is intentional batched loop - no fix needed` — STOP before push.

## Verify (founder, anytime)
Run the Q5 SQL — pass = one burst/day at the 15:00 UTC hour with `fires == distinct_businesses` (~16), nothing in between. If a future run ever shows `fires >> distinct_businesses` for this agent_key, THAT is the regression to investigate (would indicate a new second caller or a parallelisation refactor) — not the current behaviour.
