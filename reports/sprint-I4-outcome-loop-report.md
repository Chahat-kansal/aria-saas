# Sprint I4 — OUTCOME-LOOP-1 (wire the dormant outcome → learning loop)
**Date:** 2026-06-14
**Status:** SUPERSEDED IN PART by I4-VERIFY — see erratum below. PARTS 4 & 5 stand; PART 1's "already wired" claim was WRONG.

> **⚠️ ERRATUM (I4-VERIFY, 14 Jun, live DB):** This report claimed (a) aria_actions has no `'executed'`
> status and 'approved' is the terminal trigger, and (b) PART 1 (action→outcome) was already wired and
> "ZERO acted_on" was just a usage gap. **Both were wrong.** Live: statuses include `executed` (7 rows);
> lifecycle is pending→approved→executed; the PATCH route's `ALLOWED_STATUSES` excluded `'executed'`, and
> actions auto-execute via `plan/route.ts` **skipping** the 'approved' branch — so `onActionApproved`
> never fired and **zero** linked outcomes were ever created (the 6 aria_outcomes rows are legacy
> business-chat, action_id=null). Additionally `snapshotBaseline` returned **null** for the real action
> category `'sales'`, so even a created outcome had no baseline. **Fixed + proven live in
> `sprint-I4-VERIFY-report.md`** (new linked outcome `e965d21b…`, baseline 6900). The advice-weights
> (PART 4) and hypothesis-closure (PART 5) work in this report is unaffected and stands.

> The audit framed this as "infrastructure fully built, wiring missing." The pre-flight proved the
> wiring is **mostly already present and correct** — `onActionApproved`, `runOutcomeChecks`,
> `adjustAdviceWeight` all exist and work. The genuine gaps were two: (4) learned advice weights never
> reached the council's `available_ground_truth`, and (5) accepted hypotheses were never closed
> (`aria_hypotheses.outcome_verdict` stayed null forever). I implemented those two additively and did
> NOT rewrite the working PARTS 1–3 (doing so — e.g. swapping the weight formula to Laplace — would
> break the [0.3,2.0] multiplier frame that 4 downstream consumers depend on; see "RULE 0 calls").

---

## PRE-FLIGHT (mandatory, verbatim)

### 1. pwd
`C:\Users\kansa\aria-saas-audit` ✓

### 2. Every reference to the outcome tables (verbatim grep)
```
$ grep -rn "aria_outcomes\|aria_advice_weights" src --include="*.ts"
src/app/api/aria/ask/route.ts:1087:Profit Analysis: profit_leaks, aria_outcomes, aria_actions, daily_briefings
src/app/api/aria/outcomes/route.ts:28:    .from('aria_outcomes')
src/app/api/aria/outcomes/route.ts:64:    .from('aria_outcomes')
src/app/api/cron/memory-consolidate/route.ts:134:          .from('aria_outcomes')
src/lib/aria/ask/business-context.ts:329:    .from('aria_advice_weights')
src/lib/aria/get-business-context.ts:74:    db.from('aria_outcomes').select('recommendation_type, recommendation_detail, recommended_at')
src/lib/aria/get-business-context.ts:304:    recent_aria_outcomes: outs,
src/lib/aria/hypothesis/generate.ts:57:    supabaseAdmin.from('aria_advice_weights').select('category,weight,positive_outcomes,negative_outcomes').eq('business_id', businessId),
src/lib/aria/hypothesis/outcome-learning.ts:19:  await supabaseAdmin.from('aria_outcomes').insert({          # onActionApproved — WRITES acted_on=true + baseline
src/lib/aria/hypothesis/outcome-learning.ts:72:    .from('aria_outcomes')                                    # runOutcomeChecks — READS acted_on outcomes
src/lib/aria/hypothesis/outcome-learning.ts:136:      await supabaseAdmin.from('aria_outcomes').update(update) # WRITES verdict / 7d / 30d
src/lib/aria/hypothesis/outcome-learning.ts:319:      .from('aria_advice_weights')                            # adjustAdviceWeight — READS existing
src/lib/aria/hypothesis/outcome-learning.ts:329:        .from('aria_advice_weights')                          # adjustAdviceWeight — UPDATE counters+weight
src/lib/aria/hypothesis/outcome-learning.ts:340:        .from('aria_advice_weights')                          # adjustAdviceWeight — INSERT initial row
src/lib/aria/write-outcome.ts:10:    await supabase.from('aria_outcomes').insert({               # writeAriaOutcome — logs recommendation (no acted_on)
src/types/database.types.ts:751,2214 — generated Row/Insert/Update types
```

**Who writes / who reads (documented):**
| Table | Writer | Reader |
|---|---|---|
| `aria_outcomes` (recommendation log) | `writeAriaOutcome` (33 AI endpoints) → these are the "6 rows, ZERO acted_on" (recommendations made, not acted on) | `aria/outcomes/route.ts`, `get-business-context.ts`, `memory-consolidate` |
| `aria_outcomes` (acted-on tracking) | `onActionApproved` (sets `acted_on=true`, `baseline_metric_cents`) | `runOutcomeChecks` |
| `aria_outcomes` (verdict) | `runOutcomeChecks` (`outcome_verdict`, `outcome_7d/30d_cents`) | hypothesis closure (NEW, I4) |
| `aria_advice_weights` | `adjustAdviceWeight` (counters + weight) | `business-context.ts:329` → system-prompt; `hypothesis/generate.ts:57`; **council groundTruth (NEW, I4)** |

### 3. outcome-check cron — why it looked like it "failed"
The cron (`src/app/api/cron/outcome-check/route.ts`) calls `runOutcomeChecks` + `runAutopilotOutcomeChecks` per business and writes `cron_logs.status = 'completed' | 'failed'`. **It never writes the literal `'success'`** — so the audit's "27 runs, all status NOT 'success'" is a status-vocabulary mismatch, not a code failure. The deeper reason there are ZERO verdicts: `runOutcomeChecks` only processes outcomes with `acted_on=true`, and **no owner had approved an aria_action**, so the verdict machinery had no input. That is a usage/data gap, not a code bug.

### 4. Where `aria_actions.status` becomes the commit point
This codebase has **no `'executed'` status** on aria_actions — `ALLOWED_STATUSES = {pending, approved, ignored, completed, edited}` ([actions/[id]/route.ts:8](src/app/api/aria/actions/[id]/route.ts#L8)). The commit/trigger point is **`status='approved'`**, and it is **already wired**: [actions/[id]/route.ts:54-62](src/app/api/aria/actions/[id]/route.ts#L54-L62) fires `onActionApproved` on approval, and [hypotheses/[id]/route.ts:77-84](src/app/api/aria/hypotheses/[id]/route.ts#L77-L84) fires it when a hypothesis is accepted (it first creates the linked aria_action). PART 1 is therefore **already satisfied**; adding an `'executed'` path would require a status-enum change the spec itself forbids.

### 5. Hypothesis generator + its outcome-check logic
`hypothesis-engine` cron → `generate.ts` writes `aria_hypotheses` nightly (reads `aria_advice_weights` to bias generation, line 57). **No code closed the hypothesis loop** — `runOutcomeChecks` touched only `aria_outcomes`, never wrote back to `aria_hypotheses.outcome_verdict`. This was the real PART 5 gap.

### 6. CHECK constraints — NEEDS-DB (chat-Claude pulls)
`aria_outcomes.outcome_verdict` values written by existing code: `worked | backfired | neutral | partial`. `aria_outcomes.category` mirrors `aria_actions.category`. I4 **writes no new verdict/category values** — PART 5 copies the verdict the existing `runOutcomeChecks` already produced. No CHECK risk introduced.

---

## RULE 0 calls (why PARTS 1–3 were NOT rewritten)
- **Spec PART 1 wanted the trigger on `status='executed'`.** This codebase commits at `'approved'` and has no `'executed'` status. The wiring already exists at the correct point. Adding `'executed'` = a forbidden schema/enum change. → Kept existing `'approved'` trigger.
- **Spec PART 3 wanted `weight` recomputed via Laplace `(positive+1)/(total+3)` → [0,1].** The stored `weight` is a **[0.3, 2.0] multiplier** (1.0 = neutral) consumed by **4 sites**: [business-context.ts:451](src/lib/aria/ask/business-context.ts#L451), [system-prompt.ts:32-33](src/lib/aria/ask/system-prompt.ts#L32-L33), [ask/route.ts:1174](src/app/api/aria/ask/route.ts#L1174), [hypothesis/generate.ts:57](src/lib/aria/hypothesis/generate.ts#L57). Swapping the scale to a [0,1] probability would silently reinterpret every one of them (a neutral 1.0 category would read as a weak 0.5). That is a regression under RULE 0. **Honored the Laplace intent additively instead:** I surface a Laplace-smoothed `success_rate` in the groundTruth payload (computed read-side from the stored counters), leaving the working multiplier + its 4 consumers untouched.
- **Verdict timing (7d vs 30d):** existing `runOutcomeChecks` writes the verdict at the 30-day mark (more conservative than the spec's 7-day floor, which it satisfies: 30d > 7d). Left unchanged — it is the stricter, correct behavior, and the actual gap (no acted-on inputs) is unrelated to timing.

---

## BUILD (additive only) — what I4 actually changed

### Files changed (3 + report) — NO schema changes
| File | Part |
|---|---|
| `src/lib/aria/hypothesis/outcome-learning.ts` | PART 5 — NEW exported `runHypothesisOutcomeClosure(businessId)` |
| `src/app/api/cron/outcome-check/route.ts` | PART 5 wiring + run log (`logAICallSafe agent_key='outcome_check'`) |
| `src/app/api/aria/ask/route.ts` | PART 4 — advice_weights → `available_ground_truth` + audit log |

### PART 4 — advice_weights surfaced to the council groundTruth
- Added a 15th query to the existing groundTruth `Promise.all` (`gtWeights`): selects `category,weight,positive_outcomes,negative_outcomes,neutral_outcomes` for the business.
- Built `adviceWeightsGT = [{ category, weight, total_outcomes, success_rate }]` (filtered to `total_outcomes > 0`), where:
  - `weight` = the stored [0.3,2.0] multiplier (unchanged).
  - `success_rate` = **Laplace** `(positive + 1) / (total + 3)` — read-side only.
- Added `available_ground_truth.advice_weights` + `advice_weights_note` ("LOWER weight / success_rate = be more cautious recommending that category again").
- **Deliberately NOT pushed into `_anchor_values`** — these are meta-confidence multipliers, not citeable dollar/% business figures; polluting the GROUNDING-TEETH-V2 Check-6 anchor set with them would weaken the fabrication guard.
- Audit log: `logAICallSafe({ agent_key:'advice_weights', role:'analysis', provider:'other' })` (both valid CHECK values).

### PART 5 — hypothesis outcome closure
New `runHypothesisOutcomeClosure(businessId)`:
- Finds `aria_hypotheses` WHERE `status='accepted'` AND `action_id IS NOT NULL` AND `outcome_checked_at IS NULL`.
- For each, reads the **linked `aria_outcomes` row by `action_id`** that already has a non-null `outcome_verdict` (single source of truth — the verdict `runOutcomeChecks` produced; no recomputation, no divergence).
- Propagates `outcome_verdict`, `outcome_7d_cents`, `outcome_30d_cents`, `outcome_checked_at` onto the hypothesis. If the outcome isn't resolved yet, the hypothesis is left open for a later run.
- Wired into the outcome-check cron loop **after** `runOutcomeChecks` (so it reads verdicts resolved in the same pass); tallied as `total_hypotheses_closed` in `cron_logs` and the response JSON.

---

## Diff of outcome-check cron (before → after)
```diff
-import { runOutcomeChecks, runAutopilotOutcomeChecks } from '@/lib/aria/hypothesis/outcome-learning'
+import { runOutcomeChecks, runAutopilotOutcomeChecks, runHypothesisOutcomeClosure } from '@/lib/aria/hypothesis/outcome-learning'
+import { logAICallSafe } from '@/lib/aria/log-ai-call'
@@
-    let totalChecked = 0, totalMemories = 0, totalBackfilled = 0, totalResolved = 0
+    let totalChecked = 0, totalMemories = 0, totalBackfilled = 0, totalResolved = 0, totalHypClosed = 0
@@
         const [{ checked, memories_written }, { backfilled, resolved }] = await Promise.all([
           runOutcomeChecks(biz.id),
           runAutopilotOutcomeChecks(biz.id),
         ])
+        const { closed } = await runHypothesisOutcomeClosure(biz.id)
         totalChecked    += checked
         ...
+        totalHypClosed  += closed
@@
       errors: {
         total_outcomes_checked: totalChecked,
         ...
+        total_hypotheses_closed: totalHypClosed,
       },
@@
+    void logAICallSafe({ business_id: null, agent_key: 'outcome_check', role: 'analysis', provider: 'other', ... })
-    return ...{ ok: true, ... autopilot_resolved: totalResolved })
+    return ...{ ok: true, ... autopilot_resolved: totalResolved, hypotheses_closed: totalHypClosed })
```

## Confirmation: NO schema changes
Every I4 write is an **insert/update to existing columns of existing tables**:
- `aria_advice_weights` — read only (PART 4); writes still via the pre-existing `adjustAdviceWeight`.
- `aria_hypotheses.outcome_verdict / outcome_7d_cents / outcome_30d_cents / outcome_checked_at` — all pre-existing columns (verified in `database.types.ts:1706`).
- `aria_outcomes` — read only in PART 5.
No migration file. No new table. No new column. No CHECK touched.

## Sample weight calculation (Laplace smoothing — PART 4 read-side `success_rate`)
```
Category "pricing": positive=1, negative=3, neutral=0  → total=4
  success_rate = (1 + 1) / (4 + 3) = 2/7 = 0.286   → "be cautious with pricing"
  stored weight (multiplier, unchanged) = e.g. 0.55  (drifted down by 3× backfired)

Category "marketing": positive=4, negative=0, neutral=1 → total=5
  success_rate = (4 + 1) / (5 + 3) = 5/8 = 0.625   → "marketing has worked"
  stored weight (multiplier, unchanged) = e.g. 1.40

Unseen category: total=0 → filtered out (no row surfaced; Laplace prior would be 1/3 but
  we suppress zero-evidence rows so the council never reasons from a phantom rate).
```

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `NODE_OPTIONS=--max-old-space-size=6144 npx next build` → **PASS (exit 0)** ✓
- vercel.json: **unchanged** (no new cron, no new function config) — outcome-check already exists at `0 17 * * *` (daily) ✓
- Commit: **ONE**, **STOP BEFORE PUSH**.

## VERIFY POST-DEPLOY (NEEDS-DB / NEEDS-LIVE — I cannot exec these in this env)
1. **Approve a test action** (or `update aria_actions set status='approved' where id=<test>`): `onActionApproved` fires.
   `select id, acted_on, baseline_metric_cents from aria_outcomes where business_id='ff5055a0-c351-4ada-817a-1804961035f3' and acted_on=true;` → **PASS**: row with `baseline_metric_cents` set.
2. **Backdate** `acted_on_at` to 31 days ago, then `GET /api/cron/outcome-check` with `Authorization: Bearer $CRON_SECRET`:
   `select category, outcome_verdict from aria_outcomes where business_id='ff5055a0-…' and acted_on=true;` → **PASS**: `outcome_verdict` set.
   `select category, weight, positive_outcomes from aria_advice_weights where business_id='ff5055a0-…';` → **PASS**: row, `weight ≠ null`.
3. **Hypothesis closure**: accept a hypothesis (creates linked action) → approve → backdate → run cron twice:
   `select id, status, outcome_verdict, outcome_checked_at from aria_hypotheses where business_id='ff5055a0-…' and action_id is not null;` → **PASS**: `outcome_verdict` + `outcome_checked_at` set.
4. **groundTruth surfacing**: fresh council chat after weights exist → `available_ground_truth.advice_weights` present (verify via the `advice_weights` row in `aria_ai_calls`, or council reasoning that hedges a low-weight category).

## DO-NOT compliance
- No new tables ✓ · existing `aria_outcomes` / `aria_advice_weights` schema unmodified ✓
- No `outcome_verdict` written before the (≥7d, actually 30d) floor — PART 5 only copies an already-floored verdict ✓
- SEC-1 `CRON_SECRET` bearer gate preserved ✓
