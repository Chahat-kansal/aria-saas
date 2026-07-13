# Intelligence Sprints I1–I5 — Evidence Audit (read-only, no changes)
**Date:** 2026-06-14 · **Scope:** prove state with code quotes + DB facts · **No edits/migrations/commits/push.**

> ⚠️ **Two premises in the audit brief are out of date** — the stack moved this session:
> 1. The brief expects a **6-commit pre-fix stack**. The actual stack is **8 commits**: two reconciliation
>    commits already landed — `3880ce0b` (I3-FIX: dropped the migration) and `a0a1119e` (I4-VERIFY: wired +
>    proved the action→outcome link). This audit reflects the **current HEAD**, not the pre-fix snapshot.
> 2. The brief says "**I2 GOAL-AWARE was SKIPPED — verify it's absent.**" **It is NOT absent — I2 is built
>    and wired** (commit `32833796`, `goal-context.ts`, `goal_context` in groundTruth, `goalPointer` in
>    council synthesis). Evidence below. So "I2 = the true next sprint" does not hold.

---

## Pre-flight
1. `pwd` = `C:\Users\kansa\aria-saas-audit` ✓
2. `git log origin/main..HEAD --oneline` (full stack, current):
```
a0a1119e fix(I4): wire action->outcome at executed + baseline          ← I4-VERIFY (reconciliation)
3880ce0b fix(I3): drop unneeded kind CHECK migration + weather as_of/TTL ← I3-FIX (reconciliation)
407cf520 feat(i5-plan-persistence): surface executed-action follow-ups
e535ad0a feat(i4-outcome-loop): wire aria_advice_weights + hypothesis closure
5fb116ad feat(i3-pattern-memory): detect data patterns -> aria_business_memory
32833796 feat(i2-goal-aware): surface weekly target + trajectory to groundTruth   ← I2 IS PRESENT
597b98ba feat(i1-health-signals): diagnostic facts in groundTruth
47d67603 feat(i1-health-signals): source wiring/signal tables + anchors
```
- **`dd87b298` (GROUNDING-TEETH-V2):** present — `git merge-base --is-ancestor dd87b298 HEAD` → **YES** (it's already on `origin/main`, an ancestor of HEAD; that's why it isn't in the `origin/main..HEAD` *ahead* range).
- **I2 absent?** NO — `32833796` is in the stack.

## Live DB re-query (read-only, this session) vs the brief's 14-Jun snapshot
| metric | brief (14 Jun) | live now | why |
|---|---|---|---|
| aria_outcomes total | 6 | **7** | +1 = the I4-VERIFY proof row |
| linked_to_action | 0 | **1** | `e965d21b…` (action `e2f54cba`, baseline 6900¢) |
| acted_on=true | 0 | **1** | same row |
| with baseline | 0 | **1** | same row (6900¢) |
| verdicted | 0 | **0** | verdict is time-gated (30d) — unchanged |
| aria_advice_weights | 0 | **0** | no verdict yet → no weight — unchanged |

The brief's snapshot was accurate **pre-session**; the single delta is the linked+baselined row I4-VERIFY
created as its mandatory live proof. The **input** side of the loop now works; the **output** (verdict→weight)
remains 0 because it cannot fire until the 7/30-day window elapses. (Not a contradiction of the brief — a
documented, verified mutation made this session.)

---

## 1. Stack table — commit → sprint → verdict
| commit | sprint | verdict |
|---|---|---|
| 47d67603 + 597b98ba | **I1 HEALTH-SIGNALS** | ✅ FINE |
| 32833796 | **I2 GOAL-AWARE** | ✅ FINE — **BUILT** (brief premise wrong) |
| 5fb116ad | **I3 PATTERN-MEMORY** (Parts 1–4) | ✅ FINE |
| 5fb116ad → 3880ce0b | I3 migration (Part 0) | ✅ RESOLVED — already dropped in `3880ce0b` |
| e535ad0a | **I4 PARTS 4&5** (weights→GT, hypothesis closure) | ✅ FINE (additive reads) |
| e535ad0a → a0a1119e | I4 PART 1 (action→outcome link) | ✅ FIXED & PROVEN in `a0a1119e` (was ❌) |
| 407cf520 | **I5 PLAN-PERSISTENCE** | ⚠️ FIX (3 refinements; no active breakage) |

---

## 2. Per-sprint evidence + verdict

### I1 HEALTH-SIGNALS — ✅ FINE
- **weather_context** (`health-signals.ts:177-215`): cache-first → open-meteo. Cache read of
  `aria_signal_cache.weather_today`; on miss, gated on location: `else if (loc && loc.lat != null && loc.lng != null)`
  → `fetch('https://api.open-meteo.com/v1/forecast?...')`. **TTL = 2h** (`expires_at: new Date(now + 2 * 3600000)`,
  line 215 — tightened from 6h by I3-FIX). `as_of` stamp added to the object + payload (line 207/214). No location → `{available:false, reason:'no_location'}` (never blocks).
- **temp_c in anchors:** `const weatherTemp = weather_context.available ? (weather_context.temp_c ?? null) : null` →
  pushed into `anchorNumbers` (`health-signals.ts:231-235`). ✓ travels with `as_of`.
- **dow baseline cache:** writes `signal_type:'dow_baseline_health'` (line 168) — comment explicitly avoids
  signal-engine's `day_of_week_pattern`. **No clobber.** ✓
- **INSUFFICIENT_SAMPLE:** status union `'OK'|'DEGRADED'|'INSUFFICIENT_SAMPLE'` (line 8); set at line 107. ✓
- **known_unknowns:** `KNOWN_UNKNOWNS` array = **6 items** (lines 54-61), incl. "private events/catering/wholesale moved revenue off-POS". ✓
- *Minor imprecision (not a defect):* cached `temp_c` can be up to 2h old, but now carries `as_of` so any surface can render staleness. Acceptable.

### I2 GOAL-AWARE — ✅ FINE (BUILT; brief said skipped)
- `src/lib/aria/goal-context.ts` exists. Reads the real column:
  `supabaseAdmin.from('businesses').select('weekly_revenue_target')...` (goal-context.ts:35); never invents a default.
- Surfaced to groundTruth: `goal_context: gtGoal ?? undefined` (ask/route.ts:814) inside `available_ground_truth`.
- Synthesis fact-pointer: `goalPointer` (`GOAL_CONTEXT: …`) in council.ts. **Built and wired.** The brief's
  "confirm NOT BUILT / true next sprint" is incorrect — **remove I2 from the backlog.**

### I3 PATTERN-MEMORY — ✅ FINE; migration already dropped
- **Migration (Part 0):** `supabase/migrations/20260614000001_pattern_memory_kind.sql` **does not exist at HEAD**
  (`ls` → not found). It survives only in `5fb116ad`'s tree (`git cat-file -e 5fb116ad:…` → exists). It was
  removed by `3880ce0b`. Its body (from history) `DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT … CHECK (kind = ANY
  (ARRAY['preference','fact','tried','decision','concern','goal','pattern']))` — a **7-value** CHECK on a
  **free-text** column = a RULE-0 narrowing that would also reject `business_fact`/`intent`/`outcome` (code writes
  9 kinds). **Correctly dropped.** No `src/` code depends on the constraint (the cron just `insert({kind:'pattern'})`).
- **Detectors** (`pattern-detection.ts`): 5 SQL-only/deterministic detectors, `confidence >= 0.6` to emit, no LLM.
- **Cron** (`cron/pattern-memory/route.ts`): weekly `0 3 * * 1`, `CRON_SECRET` bearer gate, 260s deadline; writes
  `aria_business_memory` (durable), **not** `aria_signal_cache`. ✓ Verdict: migration FIX = **already done**; Parts 1–4 fine.

### I4 OUTCOME-LOOP — PART 1 ✅ FIXED & PROVEN; PARTS 4&5 ✅; verdict tail ⚠️ time-gated
- **Linked-outcome creation:** two creators, both insert `aria_outcomes` with `action_id`:
  - `onActionApproved` (outcome-learning.ts:19) — trigger `if (body.status === 'approved' …)` (actions/[id]/route.ts:56).
  - `onActionExecuted` (outcome-learning.ts, NEW in a0a1119e) — fired at terminal `'executed'`
    (actions/[id]/route.ts on `status==='executed'`, and plan/route.ts auto-execute). **Idempotent** (skips if an
    acted_on outcome with that action_id exists). Sets `acted_on=true` + `baseline_metric_cents`.
  - **Root cause it fixed:** before a0a1119e, `ALLOWED_STATUSES` excluded `'executed'` and auto-execute skipped the
    'approved' branch → onActionApproved never fired → 0 linked outcomes ever. Also `snapshotBaseline` returned null
    for the real category `'sales'` (now revenue is the default branch).
  - **Live proof:** `e965d21b…` (action_id set, acted_on=true, baseline 6900). ✓
- **runOutcomeChecks predicate** (outcome-learning.ts:71-78): `.eq('business_id').eq('acted_on', true)
  .is('outcome_verdict', null).not('acted_on_at','is',null)` — no action_id/baseline requirement. Correct; its
  input was simply empty until now. With 1 baselined row present, it will verdict at the 30-day mark.
- **PARTS 4 & 5 (e535ad0a):** advice_weights surfaced to groundTruth as **additive reads** — `weight` NOT rescaled
  (Laplace `success_rate` is a separate read-side field), and advice_weights are **NOT** in `_anchor_values`. Hypothesis
  closure (`runHypothesisOutcomeClosure`) propagates the resolved outcome verdict to `aria_hypotheses`. ✓
- **Verdict:** link is **fixed & proven** (was the broken core). The verdict→weight tail is **0 by design until the
  window elapses** — provable only via a 30-day wait or a backdated `acted_on_at` test (not yet done).

### I5 PLAN-PERSISTENCE — ⚠️ FIX (3 refinements; nothing actively broken)
- **getOpenLoops** (`open-loops.ts`): keys on `.eq('status','executed').not('executed_by_user_id','is',null)
  .is('rolled_back_at',null).gt('updated_at', sixtyDaysAgo)`, then **excludes acted-on outcomes** via a JS Set of
  `aria_outcomes.action_id where acted_on=true`. ✓ ready_to_review gate at ≥7d; too_soon suppressed in ask/route.ts.
- ⚠️ **executed_at → updated_at proxy:** there is no `executed_at` column, so `getOpenLoops` uses `updated_at` as
  the executed time AND for `days_since_executed`. **`updated_at` moves on ANY later update** (status edit, payload
  change), which can reset a loop from `ready_to_review` back to `too_soon`. Real imprecision (a stable source would
  be `aria_action_log.executed_at`).
- ⚠️ **PART 5 insert is incomplete on baseline** (`actions/[id]/outcome/route.ts:62-75`): the INSERT branch sets
  `action_id, acted_on=true, acted_on_at, category, notes` and verdict *only if explicit* — but **does NOT set
  `baseline_metric_cents`**. An owner-reported row created before the execute hook has null baseline → not
  cron-verdictable (only the owner's explicit verdict would resolve it). The brief's "writes a COMPLETE row
  (action_id, baseline, acted_on, verdict)" → **baseline is missing.**

---

## 3. Cross-sprint conflicts — I4 × I5 outcome write collision (critical check)

**Both write sites, side by side:**

*I4 `onActionExecuted` (outcome-learning.ts):*
```ts
const { data: existing } = await supabaseAdmin.from('aria_outcomes').select('id')
  .eq('business_id', businessId).eq('action_id', actionId).eq('acted_on', true).limit(1).maybeSingle()
if (existing) return                          // guard: skip if acted_on row exists
… insert({ action_id, acted_on:true, baseline_metric_cents: baseline, … })   // CREATE w/ baseline
```

*I5 PART 5 `POST .../outcome` (actions/[id]/outcome/route.ts):*
```ts
const { data: existing } = await supabaseAdmin.from('aria_outcomes').select('id, acted_on_at, outcome_verdict')
  .eq('business_id', businessId).eq('action_id', params.id).order('recommended_at',{ascending:false}).limit(1).maybeSingle()
if (existing) { … update(…) }                 // UPDATE existing
else { insert({ action_id, acted_on:true, /* NO baseline */ … }) }            // CREATE w/o baseline
```

**Do they collide / duplicate?** **Not in the normal flow** — both guard on `action_id` first, forming an
insert-or-update pair: executed-then-reported → I5 finds I4's row and UPDATEs; reported-then-executed → I4's guard
sees the acted_on row and skips. **No duplicate row is produced in either order.** However three real issues remain:
1. **Asymmetric guard:** I4 filters `acted_on=true`; I5 does not. If any non-acted_on linked row ever existed, I5
   would update it while I4 wouldn't see it → a latent duplicate path (currently no code creates such a row).
2. **TOCTOU race:** if execute and owner-report run near-simultaneously, both existence checks can miss → **two
   inserts → duplicate**. Low probability (owner reports days later), but real (no unique constraint on action_id).
3. **Divergent completeness:** I4 inserts WITH baseline; I5 inserts WITHOUT. The same logical row has different
   completeness depending on which path created it.

**One-path design recommendation:** make `onActionExecuted` the **sole creator** (always with baseline); the
owner-outcome route should **UPDATE-only**, and if no row exists, call `onActionExecuted` first (create-with-baseline)
then apply the owner's notes/verdict. Add a DB **unique index on `aria_outcomes(action_id) where action_id is not
null`** to make duplication impossible. This collapses two insert sites into one and closes the race.

---

## 4. Push-readiness call
**The 8-commit stack is PUSHABLE as-is.** Nothing at HEAD is actively broken:
- Migration narrowing — **already dropped** (`3880ce0b`); `kind='pattern'` inserts on free-text. ✓
- I4 link — **fixed & proven live** (`a0a1119e`, row `e965d21b`). ✓
- I2 — present and wired. ✓ · dd87b298 — present. ✓ · All sprints built green per their reports.

**No hard push-blocker.** The ⚠️ items (I5 baseline omission, updated_at proxy, I4×I5 consolidation + unique index)
are **refinements**, not breakage — they don't fail the build or corrupt data in the normal flow.

**Two caveats to note (not blockers):**
- `scripts/i4-verify-executed-outcome.mjs` is committed (`a0a1119e`) and **writes to the prod DB when executed**
  (gated on service-role creds). Harmless unless run; consider it a verification artifact.
- The I4 verdict→weight tail is unproven (time-gated). Push doesn't depend on it, but I4 isn't "fully closed" until
  a backdated/30-day test shows a verdict + a non-zero `aria_advice_weights` row.

**Order to push:** all 8 together (they're a coherent stack; the two fix commits sit correctly on top of the features they correct).

---

## 5. Recommended fix order (my call)
1. **Push the 8-commit stack now** — it's clean; deferring only delays the proven I1–I5 value.
2. **I6 — outcome write consolidation (the one real design debt):** single creation path
   (`onActionExecuted` sole creator w/ baseline; owner route UPDATE-only or create-via-hook), align the I4/I5
   guards, and add the `aria_outcomes(action_id)` partial unique index to kill the race. (~½ day.)
3. **I6b — I5 executed-time source:** replace the `updated_at` proxy with `aria_action_log.executed_at` (or a stable
   executed marker) so the ≥7d open-loop gate can't be reset by later edits.
4. **I4 verdict-tail proof:** backdate one baselined outcome's `acted_on_at` to ≥31 days and run `outcome-check` →
   confirm a verdict + a non-zero `aria_advice_weights` row. Only then mark I4 fully closed.
5. **I2:** **already built — remove from the roadmap as a pending sprint.** (If anything, a small follow-up could add
   `goal_context` numerics to `_anchor_values`, but that's optional polish, not a sprint.)

*No code was changed, no migration applied, no commit made. Reading + reporting only.*
