# Sprint PUSHBACK-FIX-1 — Filter Symmetry + Pushback in Brevity Suppression
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green

> ⚠️ MATERIAL PRE-FLIGHT FINDING: **Part 1's premise was false.** `recall.ts` ALREADY filters
> `deleted_at IS NULL` — at line 39, present since commit `77a34ddb` (pre-session), verified
> against the audit-time tree (`git show 298e6d2f:…recall.ts`). PUSHBACK-AUDIT-1's "filter
> asymmetry" was an artifact of its own grep pattern (`is_active|archived|kind` — no
> "deleted_at" term, so line 39 never printed). Part 1 is therefore a NO-OP; an ERRATUM was
> appended to audits/PUSHBACK-AUDIT-1.md. Parts 2 and 3 applied as specified.

---

## Files changed (3)

| File | Change |
|---|---|
| `src/lib/aria/council.ts` | Part 2: `pushback` added to the BREVITY suppression list (one-word edit) |
| `src/lib/aria/memory/recall.ts` | Part 3: 3-line filter-parity convention comment at top (no logic change) |
| `audits/PUSHBACK-AUDIT-1.md` | ERRATUM appended correcting the false Mechanism-A finding |

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — Every aria_business_memory query in recall.ts (file read in full, 131 lines)

ONE query touches the table — `recallMemories`, lines 34-42, verbatim:
```ts
const { data } = await supabaseAdmin
  .from('aria_business_memory')
  .select('kind, content, topic, importance, confidence, created_at')
  .eq('business_id', businessId)
  .eq('is_active', true)
  .is('deleted_at', null)          // ← ALREADY PRESENT (line 39)
  .gte('confidence', 0.6)
  .order('importance', { ascending: false })
  .limit(limit * 3)
```
**Before/after diff for Part 1: NONE — the filter the sprint was written to add is already there.** Verified three ways: (1) full-file Read above; (2) `git show 298e6d2f:src/lib/aria/memory/recall.ts` (the PUSHBACK-AUDIT-1 commit) shows the identical chain — it was present AT audit time; (3) `git log --oneline -- recall.ts` shows last touches `57312bfc`/`77a34ddb`, both predating this session. (`fetchRecentSummaries` at :101-107 queries `aria_conversation_summaries`, not business_memory — out of scope, no archive columns exist there.)

### Q3 — council.ts BREVITY suppression line (exact, pre-edit)

> `When BREVITY fires: NEVER emit council_split, comparison_table, alert_card, or ai_reasoning. These are advisory-mode blocks only.`

Confirmed `pushback` NOT in it. Post-edit:

> `When BREVITY fires: NEVER emit council_split, comparison_table, alert_card, ai_reasoning, or pushback. These are advisory-mode blocks only.`

### Q4 — All `from('aria_business_memory')` readers (full grep run; verbatim output in session; summarised)

| File:line | Filters | Verdict |
|---|---|---|
| `lib/aria/memory/recall.ts:35-39` | is_active ✓ deleted_at ✓ (+confidence≥0.6) | symmetric ✓ |
| `lib/aria/ask/business-context.ts:341-345` | is_active ✓ deleted_at ✓ | symmetric ✓ |
| `app/api/aria/memory/route.ts:25-29` (GET list) | is_active ✓ deleted_at ✓ | symmetric ✓ |
| `app/api/cron/memory-consolidate/route.ts:51-54, 63-67` | is_active ✓ deleted_at ✓ | symmetric ✓ |
| `lib/aria/hypothesis/generate.ts:56` | is_active ✓ deleted_at ✓ | symmetric ✓ |
| `lib/aria/memory/extract.ts:195-199` (dedupe read) | is_active ✓ deleted_at ✓ | symmetric ✓ |
| **`app/api/aria-os/status/route.ts:33`** | **NEITHER flag** — selects top-20 by importance incl. archived rows | ⚠️ flag for **RECALL-PARITY-1** (admin/status surface; NOT edited per spec) |
| **`lib/aria/ask/memory-writer.ts:27-34`** (insert-dedup check) | is_active ✓, **no deleted_at** | ⚠️ flag for RECALL-PARITY-1 (minor: may dedupe against soft-deleted rows, suppressing a legitimate re-write; NOT edited) |
| `app/api/cron/memory-extract/route.ts:35-38` (source_id dedup) | none — intentional (prevents re-extracting from the same conversation even if memories were archived) | OK as designed; noted |
| Writers (memory/route.ts POST/DELETE, extract.ts:230, onboarding-seed.ts, memory-writer insert, consolidate updates) | n/a | writers — consolidate correctly sets BOTH `is_active:false` + `deleted_at` (:83, :89, :127), as does the DELETE route (:52-56) — archive convention already consistent |

## Additive-only confirmation
One word added to one council prompt line; one 3-line comment added; one docs erratum appended. Zero logic changes, zero removals. recall.ts query chain untouched. business-context.ts untouched. conversation_summarizer untouched (SUMMARIZER-FIX-1 next). No other aria_business_memory reader edited. No dependencies; vercel.json untouched.

## What actually explains the persistence (corrected RCA)
With Mechanism A disproven, the pushback persistence is fully attributed to **Mechanism B**: `aria_conversation_summaries.key_decisions` (7-day window, no archive flag) feeding the council synthesis — which chat Claude has already cleaned at the data layer per this sprint's preamble. Part 2 adds the belt-and-braces prompt suppression; rows also age out naturally in ≤7 days.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy
1. "how am I doing this week?" — no "19% reconciliation"/"5× higher"; no Tuesday Bundle in any pushback. (If "$78" still shows where calendar-week truth differs: that is the council week-figure path, NOT this sprint — flag separately.)
2. "just tell me revenue today" — ONE block, NO pushback panel.
```sql
select created_at, agent_key, left(coalesce(request_summary,''),60) as q
from aria_ai_calls
where created_at > now() - interval '10 minutes'
order by created_at desc;
```
