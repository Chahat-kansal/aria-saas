# RUN-M11B · THE PLAN GETS A SURFACE

3 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE ✅

**Commit:** `<phase-0>` · `supabase/migrations/20260903010832_m11_aria_plans.sql` (new),
`docs/aria/M11-MIGRATION-PROPOSAL.sql` (updated to match what ran).

### All seven objects verified live, with my own query

```
table aria_plans .............. 1        aria_plans columns ........... 12
apa.plan_id + step_index ...... 2        indexes (5 named) ............. 5
paired CHECK .................. 1        RLS enabled ................... true
RLS policy .................... 1
aria_autopilot_actions rows ... 819      of those with plan_id ......... 0
aria_plans rows ............... 0
```

Definitions dumped and compared one by one: `aria_plans_status_check` allows exactly
`proposed | approved | running | reported | abandoned`; `aria_autopilot_actions_plan_step_together`
is `CHECK (((plan_id IS NULL) = (step_index IS NULL)))`; `aria_autopilot_actions_plan_step_uniq` is
`UNIQUE (plan_id, step_index) WHERE plan_id IS NOT NULL`; both FKs are `ON DELETE CASCADE`; the
policy is `FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))`.
**Everything matches the proposal.**

### Production was ahead of `supabase/migrations/` again — it no longer is

The applied migration is `20260903010832_m11_aria_plans` and it existed **only in production**. Its
exact SQL was read back from `supabase_migrations.schema_migrations` and committed byte-identical;
a check in this phase's own commit confirms the migration file and the proposal document's SQL body
are character-for-character equal.

**Two differences between the proposal and what ran, recorded rather than absorbed:**

1. `add constraint` and `create policy` had **no existence guard** and would fail on any re-run.
   Each is now wrapped in `do $$ … end $$` checking `pg_constraint` / `pg_policies` first. (Stated
   in the hand-over; **verified by reading the applied SQL**, not taken on trust.)
2. ⚠️ **Not stated in the hand-over, found by comparing:** the two `comment on column` texts were
   **shortened** when applied. The proposal's longer versions ("— the case for every row created
   before M11", "The pair is unique — see aria_autopilot_actions_plan_step_uniq") are **not in
   production**. The committed file carries the live text, so the repo does not claim comments the
   database does not have.

### Preflight — what already exists

| thing | state |
|---|---|
| `works/plan.ts`, `works/capabilities.ts`, `works/report.ts` | live (M11), 50 tests green |
| `/api/aria/works/plan` | live, authorised, **wrote nothing and nothing called it** |
| `createDecision` | the canonical propose path — **extended** with `plan_id`/`step_index`, not duplicated |
| `executeAction` | 11 action types, kill switch, role gate, mass-mutation backstop, `aria_action_log` undo |
| `?c=` thread URL | live (M11 phase 1) — phase 5 reuses it |
| `business_events` | ⚠️ **already has the job lifecycle**: `entity_type` allows `job`, `event_type` allows `job_created` / `job_completed` / `job_failed`, and 31 `job` rows exist. **No CHECK is extended anywhere in this sprint.** |

**Premise corrected before building on it:** M11's planner returns `{capability, title, detail}` and
**no payload** — so a step had no product id, no quantity, nothing to execute with. A plan of steps
that cannot carry arguments cannot be executed at all, which would have made phase 3 vacuous. Steps
now carry a `payload`, following `planAction`'s established pattern (model proposes arguments →
`executeAction` validates them behind its own backstops). **The payload never influences the gate**,
and that is asserted.

---

## PHASE 1 — THE PLAN ON THE SURFACE ✅

**Commit:** `<phase-1>` · `src/lib/aria/works/persist.ts` (new),
`src/components/ask-aria-ax/PlanCard.tsx` (new), `src/lib/aria/works/plan-surface.test.ts`
(new, 27 tests), plus `plan.ts` (+payload), `createDecision.ts` (+2 optional params),
`recordEvent.ts` (reads its error), `ax-context.ts` / `ax-context-types.ts` (+`businessId`),
`AskAriaTransition.tsx` (Delegate control + plan turn), `works/plan/route.ts` (persists).

### Delegation is an explicit gesture

A **🗂 Delegate** control in the composer, beside Skills. Nothing infers a delegation from the
wording of a message — that guess would silently change every turn rather than the one the owner
pressed. Asserted as an absence (`looksLikeDelegation|isDelegation|detectIntent` must not appear).

**No approve button ships in phase 1.** `PlanCard` renders one only when handed an `onApprove`, and
the surface does not hand it one until phase 2. A control that looks live and does nothing is the
fake control this surface was cleaned of ten times over.

### Live proof — real rows, real guards, real rendering

A plan and three steps written to production with the marker `M11B-PROOF-7f3a`, replaying exactly
the statements `savePlan` issues:

```
plan_id 846a4b3d-5476-4e69-a618-39d245c34e74   steps_written 3

step_index | status  | requires_stepup | action_type       | domain | gate         | links_to_plan
     1     | pending |      false      | read_loss_signals | growth | auto         | true
     2     | pending |      false      | adjust_stock      | supply | auto         | true
     3     | pending |      TRUE       | create_promotion  | money  | propose_only | true
plan_status: proposed
```

**1-based, in order, and only the money step carries `requires_stepup`.**

**Both database guards fired, with real sqlstates:**

```
23505: duplicate key value violates unique constraint "aria_autopilot_actions_plan_step_uniq"
       DETAIL: Key (plan_id, step_index)=(846a4b3d…, 2) already exists.

23514: new row violates check constraint "aria_autopilot_actions_plan_step_together"
       (plan_id set, step_index null)
```

Idempotency is the database's, exactly as the sprint requires. **No preceding SELECT anywhere.**

**Rendered from the three stored rows, through the real renderer:**

```
⚠️ 1 of these 3 steps need your go-ahead before anything happens.

M11B-PROOF-7f3a Long weekend prep

1. Look at where money is leaking — Aria can do this, and undo it
   Checks takings, stock and reviews.
2. Correct the oat milk count — Aria can do this, and undo it
   Sets it to 24.
3. Set up a long-weekend offer — NEEDS YOU — it moves money, so Aria proposes it and never does it
   10% off pastries.

Nothing has run. This is the plan.

MARK PER STEP (what PlanCard shows)
  1. GREEN — Aria can do this, and undo it
  2. GREEN — Aria can do this, and undo it
  3. AMBER — NEEDS YOU — it moves money, so Aria proposes it and never does it
counts: {"total":3,"runnable_by_aria":2,"needs_approval":1,"needs_person":0}
```

**Teardown, and residue under two independent markers:**

```
marker M11B-PROOF in aria_plans ......... 0     STRUCTURAL: any aria_plans row .......... 0
marker M11B-PROOF in apa ................ 0     STRUCTURAL: any apa row with plan_id .... 0
marker M11B-PROOF in events ............. 0     apa total (was 819) ................... 819
```

### No error is discarded

The decision table's rule, applied to every write in the phase:

- `savePlan` destructures and reads the error on **every** insert and update, logs it, and a
  **partial write is a failure**: if any step fails, the plan is marked `abandoned` with the reason
  and `ok: false` is returned. The route then answers **500**, never a `plan_id` for a plan missing
  step 3. Handing back a plan id for a broken plan is the council's "complete having done nothing"
  shape.
- ⚠️ **`recordEvent` had the bug, and it is fixed.** The spine's *one* writer did
  `await supabaseAdmin.from('business_events').insert({…})` inside a `try` that only catches
  throws — but Supabase **resolves** with `{ error }`, so a CHECK violation landed in a variable
  nobody read and the catch never ran. Fixed to read and log it. **Still non-fatal, deliberately and
  unchanged** — the spine must never block a real flow; only the silence changed. This is fixed
  rather than merely avoided because M11B writes `job_created` through it, and "do not repeat their
  shape" cannot be satisfied by calling a helper that has it.
- A test asserts there is **no unassigned write** in `persist.ts` — the exact shape that gave
  `council-executor.ts` zero audit inserts against 819 rows.

### Reuse, not duplication

- Steps are written through **`createDecision`**, the canonical propose path, which gained two
  optional params and nothing else. There is no second insert site.
- **One event per plan, not one per step.** Steps are created `emit: false, notify: false`; the plan
  emits one `job_created`. Five `proposed` events would make the moat count one plan as five pieces
  of advice, and five pushes would be noise.
- `entity_type: 'job'` and `job_created` are **already in the CHECK constraints** and 31 `job` rows
  already exist. No CHECK extended, no DDL.
- `ax-context` now returns `businessId` — one additive field, rather than a **seventh** copy of the
  "which business is this user in" resolver (failure pattern #4 counted six).

### Mutation check

`{markFor(step)}` → `{step.title}` in the real `PlanCard.tsx`:

```
MUTATED: an approval-needing step now renders with no mark
 × the card renders markFor — the SAME function the server renderer uses
 × MUTATION — rendering a step without its mark makes this suite RED
Tests  2 failed | 25 passed (27)
```

Reverted; 27/27.

### Sibling sweep

- **Response-shape changes** — `/api/aria/works/plan` (+`plan_id`, +`stored`) and
  `/api/aria/ax-context` (+`businessId`). Both purely additive; every consumer is in this repo
  (`AskAriaTransition` only, for both) and changes in the same commit; neither is a cached PWA.
  **Proceeds unattended** under the settled consumer test.
- `createDecision` — 2 new optional params, defaulting to null. **34 existing call sites unchanged**
  and every one of the 819 existing rows stays a standalone decision, which is what the paired CHECK
  makes safe.

### NOT done, and why

- **The browser was never opened.** The plan's storage, its guards and its rendering are proven
  above against production and through the real renderer; the React card and the Delegate button are
  held by source rails only. Same limitation as M11 phase 1, same reason: vitest here is
  `environment: 'node'` with no testing-library.
- **The planner still has not run against a live model.** Every proof above uses the model's output
  shape, hand-written. Plan *quality* remains unverified.

### Gates

tsc **0** · vitest **106 files / 1406 tests, exit 0** · `next build` **BUILD_EXIT=0**, read from
`build.log:1965`.

### ⚠️ THE BUILD FAILED FIRST, AND THE WRAPPER SAID IT PASSED

The first build of this phase ended `BUILD_EXIT=1` while the task notification reported **"exit
code 0"**. That is the third time the wrapper has lied; only the `echo "BUILD_EXIT=$?" >> build.log`
line was true. **Nothing was committed on the strength of it.**

```
Module build failed: UnhandledSchemeError: Reading from "node:path" is not handled by plugins
Import trace: node:path → @anthropic-ai/sdk/lib/credentials/types.mjs → model-router.ts
              → works/plan.ts → PlanCard.tsx → AskAriaTransition.tsx → dashboard/ask-aria/page.tsx
```

A real defect, and the build was right to refuse it: `PlanCard` is a **client** component, and
importing `markFor` from `plan.ts` dragged `buildWorkPlan` in with it — and through that,
`model-router` and the Anthropic SDK, whose credentials module imports `node:path`.

**Fixed by splitting along the line that actually exists**, not by loosening anything:
`plan-shape.ts` holds everything pure (types, the registry lookup, `assemblePlan`, `renderPlan`,
`markFor`, `planStepSegments`); `plan.ts` keeps `buildWorkPlan` and the prompt, and **re-exports
every symbol**, so all existing imports and M11's 29 tests keep working unchanged. The client
imports `plan-shape`. `markFor` is still the one function both sides call — the whole reason the
card imports it rather than re-deriving the mark in JSX.

**One M11 test moved with the code and was rewritten, not deleted:** `no second notion of "verified"
was invented` read `plan.ts`; it now checks `plan-shape.ts` **and** `plan.ts` (so the tier logic
cannot reappear in the server half either) plus the re-export line, with the reason written in the
file.
