# Sprint I5 — PLAN-PERSISTENCE-1 (close the conversational loop on executed actions)
**Date:** 2026-06-14
**Status:** COMPLETE — tsc 0 errors, build PASS. RULE 0 UPGRADE_ONLY. **STOP before push.**

> The owner executes an Aria suggestion ("test the smoothie bundle"). Three weeks later Aria has
> forgotten it — the owner feels unseen and the outcome data point is lost. I4 wired the automatic
> outcome loop; I5 adds the **conversational** loop: detect executed-but-unfollowed actions, surface
> them to the council as facts (not rules), turn them into a clickable "how did it go?" suggestion,
> and give the owner a route to answer — which overrides the cron's automatic verdict and feeds the
> advice weights.

---

## PRE-FLIGHT (verbatim)

### 1. pwd
`C:\Users\kansa\aria-saas-audit` ✓

### 2. I1 + I4 groundTruth additions (read)
`available_ground_truth` already carries `business_health` (I1), `goal_context` (I2), `advice_weights` (I4) plus `_anchor_values`. I5 appends `open_loops` + `open_loops_note` in the same block, and logs `open_loops` via `logAICallSafe` mirroring the I1/I2/I4 audit logs.

### 3. ask_suggestions generator — signature (quoted)
[src/lib/aria/ask/suggestions.ts](src/lib/aria/ask/suggestions.ts): `export async function generateSuggestions(businessId: string): Promise<string[]>` — LLM (Haiku) generated, 4 suggestions, cached 4h in `aria_suggestions`. Called only from [src/app/api/aria/ask/suggestions/route.ts:24](src/app/api/aria/ask/suggestions/route.ts#L24).

### 4. `aria_actions` schema reality (RULE 2)
`status`, `executed_by_user_id`, `created_at`, `updated_at`, `rolled_back_at` exist — **there is NO `executed_at` column** (verified `database.types.ts:680`). The spec's `executed_at` is therefore mapped to **`updated_at`** (the moment status flipped to 'executed'). `SELECT count(*) ... where status='executed' GROUP BY business_id` is **NEEDS-DB** (chat-Claude pulls) — the audit reports 434 aria_actions rows with statuses incl. 'executed'.

---

## BUILD — files changed (4 modified, 2 new, +report)
| File | Part |
|---|---|
| `src/lib/aria/open-loops.ts` | **NEW** — Part 1: `getOpenLoops()` |
| `src/app/api/aria/ask/route.ts` | Part 2 (groundTruth `open_loops`) + Part 6 (log) |
| `src/lib/aria/council.ts` | Part 3 (synthesis `openLoopsPointer`) |
| `src/lib/aria/ask/suggestions.ts` | Part 4 (clickable follow-up suggestion) |
| `src/app/api/aria/actions/[id]/outcome/route.ts` | **NEW** — Part 5: owner-provided outcome |
| `src/lib/aria/hypothesis/outcome-learning.ts` | Part 5: `export` `adjustAdviceWeight` (was private) |

### Part 1 — `getOpenLoops(businessId): Promise<OpenLoop[]>`
Returns `aria_actions` WHERE `status='executed'` AND `executed_by_user_id IS NOT NULL` AND `updated_at > now()-60d` AND `rolled_back_at IS NULL`, **excluding** any action that already has an acted-on `aria_outcomes` row (the `id NOT IN (SELECT action_id FROM aria_outcomes WHERE acted_on=true)` filter, done in JS via a Set — Supabase has no NOT-IN-subquery). Revenue windows are computed from **one** `pos_sales` query (oldest-executed − 7d → now), bucketed in JS:
- `baseline_revenue` = Σ total_amount in `[executed−7d, executed)`
- `current_revenue` = Σ in `[executed, executed+7d)` if ≥7d elapsed, else `[executed, now)`
- `observed_delta` = current − baseline (dollars; `total_amount` is dollars per RULE 6)
- `outcome_status` = `too_soon` (<7d) | `ready_to_review` (≥7d). (`closed` is in the type for completeness but won't arise here — verdict'd/acted-on actions are excluded by the tracked-Set filter.)
Fully try/caught → `[]` on any failure (never blocks the council).

### Part 2 — groundTruth.open_loops (ask/route.ts)
Added `getOpenLoops(bid)` to the existing groundTruth `Promise.all`; surfaced **only** `outcome_status==='ready_to_review'`, **5 most recent** (DO-NOT: `too_soon` is suppressed — statistical floor). Added `available_ground_truth.open_loops` + `open_loops_note` ("observed_delta is an early read, not a verdict; ask, don't assert"). **Deliberately NOT added to `_anchor_values`** — `observed_delta` is a loop-scoped early estimate, not a safe-to-cite anchor; keeping it out means GROUNDING-TEETH-V2 Check 6 will strip any number Aria tries to assert from it, which is the desired "ask, don't claim" behavior.

### Part 3 — synthesis fact-pointer (council.ts)
Added `openLoopsPointer` next to `goalPointer` in `synthesisInput` (synthesis-only, NOT injected into the 4 advisor prompts — same discipline as I2). It says: if `outcome_status="ready_to_review"`, ask naturally how it went, weave into the response (don't interrupt the main question), never assert worked/failed from `observed_delta`. **No phrasing rule (RULE 9)** — a neutral pointer at the facts.

### Part 4 — clickable follow-up (suggestions.ts)
`openLoopSuggestion()` builds `How did "<title>" work out?` from the most-recent `ready_to_review` loop; `mergeOpenLoop()` prepends it and caps the list at **4** (suggestion count unchanged). Merged on **both** the cache-hit and fresh-generation paths (and the fallback), and the open loop is intentionally **not** baked into the 4h `aria_suggestions` cache — so a just-executed action surfaces immediately rather than waiting up to 4h.

### Part 5 — owner-provided outcome route (NEW)
`POST /api/aria/actions/[id]/outcome` `{ worked?: boolean, notes?: string }`:
- Auth: action's business must belong to the caller (`businesses!inner(user_id)` — same ownership pattern as `actions/[id]/route.ts`).
- Verdict is set **only** from the explicit `worked` boolean (`true→'worked'`, `false→'backfired'`) — **never parsed from notes text** (DO-NOT). `notes` is free text, always saved.
- Updates the existing outcome row (sets `notes`, `acted_on=true`, `acted_on_at` if missing, and `outcome_verdict`+`outcome_checked_at` only if explicit), or inserts a new `recommendation_type='owner_reported'` row.
- When an explicit verdict is given, calls `adjustAdviceWeight(businessId, category, verdict)` so owner feedback feeds the I4 learning loop. This is the **owner override** of the cron's automatic 7d/30d verdict.

### Part 6 — log
`logAICallSafe({ agent_key:'open_loops', role:'analysis', provider:'other', response_summary:{ open_count, ready_to_review_count } })` (both valid CHECK values), emitted only when ≥1 open loop exists.

---

## RULE 0 / RULE 9 compliance
- All changes additive: 2 new files, 4 append-only edits, 1 visibility widening (`adjustAdviceWeight` private→export — no behavior change to existing callers). No feature removed, no schema changed.
- `aria_actions` schema **untouched** (read-only; `executed_at`→`updated_at` mapping is a read-side decision, no column added).
- No prompt RULES added — Part 3 is a neutral fact-pointer, consistent with I1/I2.
- DO-NOT honoured: `too_soon` suppressed; open loops surface in **context + suggestions only** (never override the main answer — `responseText`/synthesis own the reply); verdict never inferred from notes; `aria_actions` schema not modified.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `NODE_OPTIONS=--max-old-space-size=6144 npx next build` → **PASS (exit 0)** ✓; new route registered: `ƒ /api/aria/actions/[id]/outcome` ✓
- vercel.json: **unchanged** — the new route is a normal API route (covered by the `src/app/api/**/*.ts` 60s glob); no new function config, no new cron.
- Commit: **ONE**, **STOP BEFORE PUSH**. (Only I5 files staged — unrelated working-tree changes left alone.)

## VERIFY POST-DEPLOY (NEEDS-DB / NEEDS-LIVE — cannot exec here)
1. `update aria_actions set status='executed', executed_by_user_id='<owner>', updated_at = now() - interval '10 days' where id='<sip action>';` (no acted-on outcome for it).
2. Fresh council chat "how am I doing this week?" → Aria weaves in *"Last week you tried \"<title>\" — how did it go?"* (verify the `open_loops` row in `aria_ai_calls`, and `available_ground_truth.open_loops` in the council input).
3. `GET /api/aria/ask/suggestions` → list includes *How did "<title>" work out?* as the first suggestion.
4. `POST /api/aria/actions/<id>/outcome { "worked": true, "notes": "smashed it, sold out by noon" }` →
   `select notes, outcome_verdict, acted_on from aria_outcomes where action_id='<id>';` → **PASS**: `notes` populated, `outcome_verdict='worked'`, `acted_on=true`; and `aria_advice_weights` for that category nudged up.
5. Re-run chat → the loop no longer appears (now tracked / acted-on → excluded).
