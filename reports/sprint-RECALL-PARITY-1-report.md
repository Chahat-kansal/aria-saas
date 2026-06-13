# Sprint RECALL-PARITY-1 — Filter Parity Sweep for the Two Flagged Readers
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green
**Closes:** the two `aria_business_memory` filter-parity gaps flagged in PUSHBACK-FIX-1 Q4.

---

## Path correction
The spec cited `src/lib/aria/memory/memory-writer.ts`. The actual file is **`src/lib/aria/ask/memory-writer.ts`** (confirmed: `find src -name "memory-writer.ts"` returns only that path). PUSHBACK-FIX-1's Q4 citation (`ask/memory-writer.ts`) was correct.

## Files changed (2 + report)

| File | Change |
|---|---|
| `src/app/api/aria-os/status/route.ts` | Part 1: admin status memory query → `.eq('is_active', true).is('deleted_at', null)` |
| `src/lib/aria/ask/memory-writer.ts` | Part 2: dedup check → add `.is('deleted_at', null)` (already had `is_active`); Part 3: constitutional comment |

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — aria-os/status/route.ts (the Promise.all block, pre-edit; line 33 is the memory query)
```ts
  const [aiCalls, autopilot, memory, briefing, intel, compMon, custScore] = await Promise.all([
    supabase.from('aria_ai_calls').select('agent_key, model_id, input_tokens, output_tokens, created_at').eq('business_id', bid).gte('created_at', monthAgo).limit(2000),
    supabase.from('aria_autopilot_actions').select('id, action_type, status, created_at, details').eq('business_id', bid).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(50),
    supabase.from('aria_business_memory').select('id, kind, content, topic, importance').eq('business_id', bid).order('importance', { ascending: false }).limit(20),   // ← line 33, NO filters
    supabase.from('council_runs')…
```

### Q3 — ask/memory-writer.ts dedup check (pre-edit, :26-34)
```ts
    const { data: existing } = await supabaseAdmin
      .from('aria_business_memory')
      .select('id')
      .eq('business_id', businessId)
      .eq('kind', trigger.kind)
      .eq('topic', trigger.topic)
      .eq('is_active', true)                 // ← had is_active, MISSING deleted_at
      .ilike('content', '%' + content.slice(0, 30) + '%')
      .maybeSingle()
```

### Q4 — Inventory grep re-run (every `from('aria_business_memory')`)

| File:line | Role | is_active | deleted_at | Action |
|---|---|---|---|---|
| `api/aria/memory/route.ts:25` (GET list) | READER | ✓ | ✓ | none |
| `api/aria/memory/route.ts:46` | OTHER (select business_id by id for ownership) | n/a | n/a | none (single-row ownership lookup, not a content read) |
| `api/aria/memory/route.ts:52,82` | WRITER (DELETE sets both flags / POST insert) | n/a | n/a | none |
| **`api/aria-os/status/route.ts:33`** | **READER** | **✗→✓** | **✗→✓** | **FIXED (Part 1)** |
| `cron/memory-consolidate:51,63` | READER | ✓ | ✓ | none |
| `cron/memory-consolidate:82,88,126,150` | WRITER (archive/boost updates) | n/a | n/a | none |
| `cron/memory-extract:35` | IDEMPOTENCY GUARD (dedup by `source_id`+`source_type`) | — | — | **intentionally unfiltered** (see note) |
| `lib/aria/ask/business-context.ts:341` | READER | ✓ | ✓ | none |
| `lib/aria/ask/business-context.ts:357` | WRITER (last_referenced_at update) | n/a | n/a | none |
| **`lib/aria/ask/memory-writer.ts:27`** | **CONTENT DEDUP READ** | ✓ | **✗→✓** | **FIXED (Part 2)** |
| `lib/aria/hypothesis/generate.ts:56` | READER | ✓ | ✓ | none |
| `lib/aria/memory/extract.ts:195` | READER (content dedup) | ✓ | ✓ | none |
| `lib/aria/memory/extract.ts:230` | WRITER (insert) | n/a | n/a | none |
| `lib/aria/memory/onboarding-seed.ts:14` | IDEMPOTENCY GUARD (seed-once by `source_type`+content prefix) | — | — | **intentionally unfiltered** (see note) |
| `lib/aria/memory/onboarding-seed.ts:86` | WRITER (insert) | n/a | n/a | none |
| `lib/aria/memory/recall.ts:39` | READER | ✓ | ✓ | none (PUSHBACK-FIX-1) |

**No NEW readers** appeared since PUSHBACK-FIX-1. The two flagged remain the only content-reader gaps, both now fixed.

**Idempotency-guard note (deliberate non-filter — NOT a violation):** `memory-extract:35` (dedup by conversation `source_id`) and `onboarding-seed:14` (seed-once guard) are **source-level idempotency checks**, semantically distinct from content readers. They MUST see archived rows: re-processing a source whose extracted/seeded memories were later archived would re-pollute the table. This is the correct inverse of the content-dedup case (memory-writer), where archived rows must NOT block a fresh re-write of a fact the owner re-stated. The constitutional rule applies to READS that feed the AI brain or block legitimate writes — not to source-idempotency guards.

---

## Build — before/after diffs

### Part 1 — aria-os/status/route.ts:33
```diff
- supabase.from('aria_business_memory').select('id, kind, content, topic, importance').eq('business_id', bid).order('importance', …).limit(20),
+ supabase.from('aria_business_memory').select('id, kind, content, topic, importance').eq('business_id', bid).eq('is_active', true).is('deleted_at', null).order('importance', …).limit(20),
```
Admin status now shows the same ACTIVE-only memory set the AI brain uses (the spec's recommendation). The optional separate archived-count query was **not added** — kept to the "tiny, additive" scope and the DO-NOT "do not change any other code path"; the `memory` destructured value and its downstream count usage are unchanged in shape.

### Part 2 — ask/memory-writer.ts dedup
```diff
      .eq('is_active', true)
+     .is('deleted_at', null)
      .ilike('content', '%' + content.slice(0, 30) + '%')
```
A fact the owner re-states is no longer blocked from re-insertion by a soft-archived near-duplicate.

### Part 3 — constitutional comment (memory-writer.ts top)
```diff
+ // READS of aria_business_memory MUST filter both is_active=true AND deleted_at IS NULL.
+ // See PUSHBACK-FIX-1 + RECALL-PARITY-1 for the filter-asymmetry RCA.
  import { supabaseAdmin } from '@/lib/supabase-admin'
```
(recall.ts's existing comment left untouched, per DO NOT.)

## Additive-only confirmation
Three additions: two filter clauses on existing queries (narrow the result set to the correct rows — no behaviour removed, no logic branch changed) and one comment. No schema change, no archived/restored rows, no other code path touched, no dependencies. `is_active` was already present on the writer dedup, so only `deleted_at` was added there (no duplicate clause).

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy
```sql
with my_business as (select 'ff5055a0-c351-4ada-817a-1804961035f3'::uuid as id)
select 'active_only' as filter_mode, count(*) as visible_rows
from aria_business_memory, my_business
where business_id = my_business.id and is_active = true and deleted_at is null
union all
select 'no_filter', count(*)
from aria_business_memory, my_business
where business_id = my_business.id;
```
Pass: `active_only` equals what every reader (incl. now the admin status route + writer dedup) sees; the gap to `no_filter` is the count of soft-archived rows the two fixed paths would previously have leaked / matched against.
