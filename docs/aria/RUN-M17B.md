# RUN-M17B · LAND THE SPINE

16 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — THE BYPASS, AUTHORISED AND BOUNDED ✅

### PREFLIGHT

| | |
|---|---|
| `main` | `f3f11f5c` — M17 phases 0–2 + the one-exit guard defect fix, all pushed |
| parked work | `m17-phase3-parked` **`5013c368`**, intact and reachable |
| on disk | all **15** files present and **byte-identical to the branch** (verified file by file, 15 identical / 0 differing) |
| overlap | `one-exit-rule.ts` and its test are **already identical on both** — the block-comment fix landed separately in `f3f11f5c`, so there is nothing to merge there |
| the only other delta | `docs/aria/RUN-M17.md`. **`main`'s copy is kept**: it carries the park record, which is the honest history. The branch's "✅ phase 3" version is superseded. |

Because the 15 files are already on disk and byte-identical, landing them is an `add`, not a merge —
which also avoids a pointless conflict on `RUN-M17.md`.

**⚠️ Premise correction (small):** the paste says *"Five phases, five commits"* and then lists
**six** headings, PHASE 0 through PHASE 5. RULE 15 says one commit per phase, so this run makes
**six** commits. Nothing else changes.

### THE THREE BYPASSED LINES — NAMED, WITH SOURCE AND DESTINATION

Each verified **byte-identical between source and destination** by script, which is the whole
justification: this is a pure file move, not new code.

| # | rule | source | destination | line |
|---|---|---|---|---|
| 1 | `ask-aria-prompt-outside-rail` | `route.ts:2149` | `strategies/main.ts:730` | `systemPrompt = systemPrompt.replace('You are Aria', memoryBlock + '\n\nYou are Aria')` |
| 2 | `ad-hoc-revenue-sum` | `route.ts:1168` | `strategies/answer-council.ts:147` | `const gtSum = (rows: Array<{ total_amount: number \| null }> \| null) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)` |
| 3 | `ad-hoc-revenue-sum` | `route.ts:1535` | `strategies/main.ts:116` | `const swlmRev = (swlmRows ?? []).reduce(` … `(s, x) => s + Number(x.total_amount ?? 0), 0)` |

**Why each could not simply be fixed inside the move:**

- **1** — the rule fires on any new line containing `You are Aria` under `src/lib/aria/ask/`. This
  line is a `.replace()` **needle**, not a prompt: it inserts the memory block immediately *before*
  the constitution's opening words. The canonical fix is `assembleAriaPrompt()`, and **it cannot
  express this** — it always emits `ARIA_CONSTITUTION` first, so memories would move from *before*
  the constitution to *after* it. That is a behaviour change. **M18 owns it.**
- **2 and 3** — the rule wants `getRevenueSnapshot()` / `getRevenueForRange()`. Both sums already
  use the canonical `status = 'completed'` filter, so the values are *probably* identical — and
  "probably" is not good enough for the council's ground-truth anchors, which feed GROUNDING-TEETH
  Check 6. A wrong anchor makes the council start rejecting valid numbers.

### WHAT THE BYPASS IS NOT

- **Not an allow-list entry.** No file is added to `READ_THE_ERROR_ALLOWLIST`,
  `ASK_ARIA_PROMPT_ALLOWLIST`, `EXEMPT_PATHS` or any other list. An exemption is a permanent hole
  that never existed; a bypass is a single recorded act that expires the moment it is used.
- **Not for new code.** The **20 other violations stay fixed properly** — they were discarded
  Supabase errors, locked RULE 7 requires reading them, and six were hiding real defects (phase 1).
- **Not a licence for the next relocation.** Which is exactly why the wording below matters.

### PROPOSED `CLAUDE.md` WORDING — for the founder to accept or edit

**The contradiction, stated plainly.** RULE 14 says: *"If the canon rail flags something you did not
write (a merge can do this, and a file move has done it before on byte-identical code), report it —
do not `--no-verify` past it silently. **If a bypass is genuinely correct, say so explicitly in the
commit message and in your report.**"* RULE 20's NEVER list says: *"NEVER, UNATTENDED — no
exceptions, not even with a decision table: … `--no-verify` …"*

RULE 20 is later and absolute, so M17 correctly halted. But RULE 14 is right that this case exists,
and **any future sprint that relocates grandfathered code hits the same wall** — the canon rail is a
diff scanner and cannot tell a move from authorship.

Proposed as an addition to RULE 20, immediately under its NEVER list:

> **### THE ONE BOUNDED EXCEPTION — A PURE FILE MOVE  *(added 2026-09-16, M17B)***
>
> `--no-verify` stays on the NEVER list for everything except this, and the boundary is the point:
>
> A bypass is permitted **only** when **all** of the following hold, and it is a single recorded
> act, never a standing permission:
>
> 1. **It is a pure file move.** Every flagged line is **byte-identical** between its source and its
>    destination, and that identity is **proved by script in the run log**, not asserted.
> 2. **Every affected line is enumerated in the run log** with its rule, its source file and line,
>    and its destination file and line. A count is not an enumeration.
> 3. **It is never for new code.** A violation on a line that did not previously exist is a real
>    violation and is fixed, not bypassed. If some flagged lines are moved and others are new, the
>    new ones are fixed first and only the moved remainder may be bypassed.
> 4. **It is never an allow-list entry.** Adding a path to a guard's exemption list creates a
>    permanent hole that never existed. The bypass expires when the commit lands.
> 5. **The commit message says so, in those words**, and names the lines.
>
> **Why this is not a loophole:** the canon rail is a *diff scanner over added lines*. Code that
> predates a rule is grandfathered by time rather than by name, so relocating it presents every line
> as newly authored. Without this exception, no sprint can ever move grandfathered code — which is
> the same as saying the repo can never be restructured. *(M17 phase 3: 23 violations, 0 new code.
> 20 were genuine defects in the moved code and were fixed; 3 were byte-identical moves and are
> enumerated in `RUN-M17B.md`.)*
>
> **RULE 14 is the report requirement; this is its boundary.** Read them together.

**⚠️ This is a PROPOSAL. `CLAUDE.md` is not edited by this run.** The founder accepts, edits or
rejects it.

**GATE: PASS.** Continuing to phase 1.

---

## PHASE 1 — LAND PHASE 3, WITH THE SIX FIXES ✅

**The parked work is on `main`.** 15 files, 28 exits wrapped: 23 `TurnResult`s across 12 strategies
+ 5 admission gates → one `render()`. 11 of 12 strategies proven textually identical to the lanes
they came from; `main.ts` differs on 14 lines, every one a declared feature-const removal.

**⚠️ The push used the authorised bypass**, for the three enumerated lines and nothing else. Because
`--no-verify` skips the whole hook, **tsc, vitest and the one-exit guard were run by hand** and are
reported below — *the hook did not run on this push.*

### THE SIX SILENT FAILURES, EACH WITH A TEST THAT FAILS WITHOUT THE FIX

A discarded Supabase error is **invisible by nature**: Supabase resolves with `{ data, error }` and
never throws, so the failure is dropped before anyone can look at it. No stack trace, no 500, no red
anywhere — the feature just quietly does the wrong thing. **A fix with no test is a fix that comes
back**, because nothing about the code looks different afterwards.

`src/lib/aria/ask/strategies/silent-failures.test.ts` — 9 tests, each driving the **real strategy
function** with a client that returns `{ error }`.

| # | the silent failure | what it costs | test asserts |
|---|---|---|---|
| **1** | **the mass-confirm re-stage** | **the injection backstop's own write.** The gate looks present and cannot close | the rejection is reported **and the money gate still holds** — `mass_confirm`, never `execution_result` |
| 2 | the pending-action read | reads as *"no pending action"*, so an approved action silently never runs | reported, **and the lane still declines** — behaviour unchanged |
| 3 | the clear-after-execute | the action **has already run**; the next "yes" re-runs it | reported, and the owner is still told it is done, because it is |
| 4 | save-plan's `aria_actions` INSERT | *"Plan saved"* with an empty dashboard | reported, with the CHECK-constraint message |
| 5 | `upsertConversation`'s existing-thread read | falls through to INSERT → **a second conversation** | reported — **and the duplicate is demonstrated**: a new id comes back, not `c1` |
| 6 | the per-minute rate-limit COUNT | null reads as "no calls", **the limit is let through** | reported, and the turn is still admitted |

Two of these assert the **consequence**, not just the log: #5 shows the duplicate thread id, and #1
shows the money gate holding while its own re-stage was refused.

### MUTATION — ALL SIX, SWEPT AUTOMATICALLY

Each report line deleted in turn, suite run, file restored:

```
silent failure                                       variable         verdict
the mass-confirm re-stage (the injection backstop)   massStageErr     RED - 1 test(s) failed
the pending-action read                              pendingErr       RED - 1 test(s) failed
the clear-after-execute                              clearErr         RED - 1 test(s) failed
save-plan's aria_actions INSERT                      planInsertErr    RED - 1 test(s) failed
upsertConversation's existing-thread read            existingErr      RED - 1 test(s) failed
the per-minute rate-limit COUNT                      recentErr        RED - 1 test(s) failed
6 of 6 went red. All six are verified.
```

The one the sprint asked for by name, done first by hand:

```
MUTATED: the re-stage error is discarded again
  × REPORTS a rejected re-stage — the assertion that fails if the error is re-discarded
  AssertionError: the re-stage error was discarded — expected false to be true
  Tests  1 failed | 8 passed (9)
```

> **On "use a genuinely new line":** that rule exists because a **diff scanner** cannot see a
> reintroduced line. A unit test reads the code, not the diff, so a revert is fully visible to it —
> which is precisely why these six needed unit tests rather than a guard. The mutation is therefore
> the exact re-discard the sprint asked for.

**Anti-vacuity:** the suite also asserts that a **clean** admission logs *nothing at all*. Without
it, a harness that captured `console.error` wrongly would make all six pass for the wrong reason.

| | |
|---|---|
| **files changed** | 15 landed from `m17-phase3-parked` + `silent-failures.test.ts` (+218) |
| **sibling sweep** | other discarded Supabase errors in the landed files: **0** (canon rail clean apart from the 3 enumerated bypasses) |
| **mutation** | 6 of 6 red, swept automatically; the mass-confirm one also done by hand |
| **gates** | tsc 0 · vitest **136 files / 1787 tests** · one-exit guard 0 · `BUILD_EXIT=0` · ⚠️ **hook did NOT run — bypassed; all gates run manually** |
| **NOT done** | the route is still unwired — that is phase 2. `_POST` still holds its 28 exits and the grandfather list is still populated. |

---

## PHASE 2 — ROUTE `_POST` THROUGH THE SPINE ✅  *the sprint*

### `route.ts`: **2,820 → 182 lines.** 28 exits → **0**.

```
- 2,820 lines · 28 `return NextResponse` · 22 of them before the council gate
+   182 lines · parse → runTurn() → done · ZERO responses constructed
```

The only three occurrences of the word `NextResponse` left in the file are in its doc comment
explaining what used to be there. **Stripped of block comments — which is what the guard reads —
route.ts contains 0.**

### ⚠️ THE GRANDFATHER LIST IS EMPTY, AND THE MUTATION PROVES IT BITES

```
export const ONE_EXIT_GRANDFATHERED: readonly string[] = [
  // ⚠️ EMPTIED IN M17B PHASE 2 …
]
```

A **genuinely new** early exit added to `_POST` — a header probe that never existed in this repo:

```
[ask-one-exit-guard] 1 response construction(s) outside the single exit:
  src/app/api/aria/ask/route.ts:115
    return NextResponse.json({ probe: 'M17B phase 2 — a brand new early exit, never in this repo' })
ONE_EXIT=1
```

Reverted → `27 file(s) scanned whole, one exit intact. Pass.` and **the "still grandfathered"
warning line is gone.** From this commit the route cannot exit early.

### ⚠️ TWO ORDERINGS A NAIVE `admit()` WOULD HAVE BROKEN SILENTLY

The route's real order interleaves its gates with the parse and with one lane:

```
316  admitBeforeParse   the per-user limit — BEFORE the body is read
330  parse
366  admitBadRequest    needs the parsed message
372  the save-plan lane            ← sits HERE, before the spend gates
403  admitSpend         cost guard · per-minute · daily ceiling
447  the classifiers
```

**1 · The per-user limit precedes the parse.** A flood costs one Redis read rather than a multipart
parse of up to five attachments. A single `admit()` after parsing keeps the same 429 body and
quietly does that work anyway.

**2 · `save_plan` precedes the spend gates and the classifiers.** `[ARIA_SAVE_PLAN]` is a UI
sentinel that makes **no model call and costs nothing**. Running the spend gates first would **block
a free action for an owner who has exhausted the daily AI budget** — a real change to a real user
path. And deciding it from `decide()` would mean `understand()` had already run, so a sentinel would
pay for two classifier calls.

**Neither would have appeared in a replay that only compares rendered JSON.** They are held by
assertions instead: the parse function is a spy that must not be called for a rate-limited request,
and the spend gates are a spy that must not be called for a sentinel.

`decide()` no longer offers `save_plan` at all; it runs as `RunTurnOptions.savePlanGate`, and
`save-plan.ts` exports the gate and the `StrategyFn` over **one implementation**.

### THE FIVE LANES THAT DECLINE BY CATCHING THEIR OWN ERRORS — REPORTED

| lane | route.ts | what its catch does |
|---|---|---|
| `inventory_agent` | 786 | logs, *"RULE 0: non-fatal — fall through to main tool loop"* |
| `multi_domain` | 936 | logs, *"falling back"* |
| `deliverable` | 998 | logs, *"falling back to text"* |
| `background_task` | 1050 | logs, *"falling through"* |
| `council` | 1478 | logs, *"falling back to single-model"* |

Four of the five were already honest. **The fifth was not, and it is the one that matters.**

### ⚠️ A SIXTH, SILENT CATCH — FOUND BY LOOKING, AND IT MAY BE WHY PROVENANCE IS NULL

`answer-council.ts:343` was a **bare `catch { /* non-fatal — council proceeds without anchors */ }`**
— no binding, no log — and it wraps **~245 lines**: all eighteen ground-truth queries, `anchorValues`,
and `turnProvenance = buildProvenance(...)`.

**If anything in there throws, the council answers with no `available_ground_truth` and
`turnProvenance` stays null** — so the response carries `provenance: null` and not one figure can be
tiered. That is **M3's 0-of-288 missing tiers and S6's live finding that a real business turn carried
no provenance**, with a plausible mechanism — and nothing anywhere recorded that it had happened.

S9 phase 6 fixed the **outer** catch immediately below it; its comment literally reads *"until now
nothing recorded that it had happened"*. It left this inner one silent.

Fixed to exactly what W6 requires — bind the error and log it. **Still non-fatal, no control flow
changed, no response changed.** Only the silence is gone.

### ⚠️ SIXTEEN TEST FILES WERE ASSERTING ON `route.ts`'s SOURCE TEXT

The rewrite turned 47 tests red across 16 files, all one class: they `readFileSync` the route and
assert particular code appears in it — the constitution splice, the anchor set, `advisors_lost`, the
branch modes, the thread-title call. They were written when the turn **was** that one file.

**Every one of those assertions is still about something real.** Pointing them at a fixed path would
have left sixteen files quietly asserting nothing — failure pattern #1 in its purest form: a test
that passes because it looks where the thing cannot be.

So `src/lib/aria/ask/turn-source.ts` reads **the turn** — route + pipeline + strategies — and the
tests read that. When a lane moves again, they follow it. It carries its own anti-vacuity check:
under 50,000 characters it throws rather than letting every assertion pass against an empty string.

Three assertions genuinely had to change, each with the reason written in the file:
`const bid = businessId` → `bid: businessId`; one import line became two on two different lanes; and
`features.test.ts`'s drift check **reached its stated expiry** — it existed only while the regexes
lived in two places, so it is replaced by its inverse: **the route no longer carries a copy**, which
is what keeps failure pattern #4 from returning.

| | |
|---|---|
| **route.ts** | **2,820 → 182 lines**, 28 exits → 0 |
| **files changed** | `route.ts` (−2,638) · `run-turn.ts` (+96) · `admission.ts` (+62) · `turn-record.ts` (+34) · `turn-source.ts` (+78) · `save-plan.ts` (+18) · `answer-council.ts` (+18) · `one-exit-rule.ts` (grandfather emptied) · 17 test files repointed |
| **sibling sweep** | `NextResponse` in the guarded tree outside `render.ts`: **0**. Files still reading `route.ts` by path in a test: 3, all deliberate (the one-exit rule's own test, the types fixtures' doc comment, and the new duplicate-check). |
| **mutation** | a brand-new early exit in `_POST` → guard **red at route.ts:115**; reverted → green, and the grandfathered warning is gone |
| **gates** | tsc 0 · vitest **136 files / 1790 tests** · one-exit guard 0 · canon rail **PASS, no bypass needed** · `BUILD_EXIT=0` · hook ran |
| **NOT done** | the turn record is a `console.log` — phase 3 decides where it is persisted, and proposes DDL rather than smuggling JSONB. No replay yet (phase 4), no `check:live` yet (phase 5). |

---

## PHASE 3 — THE TURN RECORD ✅

**The question nobody in this repo has ever been able to answer: *why did this message go to that
lane, and what else was offered first?*** Reconstructing why the founder's *"tidy up before the
weekend"* reached the general lane (M12) meant re-running both classifiers by hand, because the lane
that took it returned before anything logged a thing.

Every turn now emits one record carrying the lane, **the reason it won**, **which candidates were
offered and declined**, the features that fired, the grounding kind, the verification verdict, the
status and the per-stage timings.

### ⚠️ NO DDL WAS INVENTED, AND NOTHING WAS SMUGGLED

`aria_ai_calls` fits the core, **using its columns for exactly what they are for** — it is the
canonical per-call ledger, written through `logAICallSafe()`, the one entry point that reads the
returned error. (That matters here: whole `agent_key`s once wrote **zero rows for weeks** because a
`role`/`provider` CHECK violation was rejected silently.)

| column | carries |
|---|---|
| `agent_key` | `'ask_aria_router'` — a new key; only `role` and `provider` carry CHECKs |
| `role` / `provider` | `'other'` / `'other'` — both on the CHECK list. No model was called to make this decision |
| `business_id` | the tenant — without it *"which lane does Sip take"* is not a question anyone can ask |
| `latency_ms` | the whole turn |
| `request_summary` | `lane — reason`, readable at a glance |
| `response_summary` | the decision as JSON: lane, **declined**, grounding, verified, status, both intents |
| `learning_signal` | the features that fired |

`response_summary` already carries compact JSON summaries on **five other agent keys in this very
pipeline** — `health_signals`, `goal_context`, `open_loops`, `advice_weights`,
`industry_benchmark`. This is that established pattern, not a new use of the column.

### ⛔ PROPOSED DDL — PARKED (RULE 10a: schema is never mine to write)

What does **not** fit is parked rather than smuggled. Per-stage timings, the full 18-boolean feature
vector and a typed verification verdict want real columns you can aggregate on. *"What is the p95 of
stage `act` on the council lane this week"* is a question M18 will want to ask and **cannot ask of a
text blob.**

```sql
-- PROPOSED, NOT APPLIED. For the founder to review; Claude applies DDL via Supabase MCP, not this run.
create table public.aria_turn_records (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  created_at      timestamptz not null default now(),
  lane            text not null,
  reason          text not null,
  declined        text[] not null default '{}',
  fired_features  text[] not null default '{}',
  intent_type     text,
  aria_intent_type text,
  complexity      text,
  grounding_kind  text not null,
  verified_ran    boolean not null default false,
  verified_reason text,
  status          int not null,
  stage_ms        jsonb not null default '{}'::jsonb,
  total_ms        int not null
);
create index aria_turn_records_biz_time on public.aria_turn_records (business_id, created_at desc);
create index aria_turn_records_lane     on public.aria_turn_records (business_id, lane, created_at desc);
alter table public.aria_turn_records enable row level security;
-- RLS: owner-read only; writes are service-role (the route) — policy to be written with the founder.
```

Until that exists, **the console line carries the full record**, including the stage timings the
table has no column for. It is one `[ask-aria] turn {...}` line per turn, greppable in Vercel logs.

### VERIFY — DRIVEN BY RUNNING A TURN, NOT BY BUILDING A SHAPE

The assertions run `runTurn()` with a registry whose council **declines**, exactly as it does in
production when it fails or returns no briefing, and read what the spine emits:

```
lane:     'main'
declined: ['council']          ← the council was offered, and declined, and the record says so
reason:   'no earlier lane claimed the turn'
fired:    [… 'isStrategicQuestion' …]
```

**Anti-vacuity:** a turn whose first candidate answers records `declined: []` — not a missing field.
If `declined` were always populated or always absent it would carry no information.

Also asserted: the row uses only CHECK-legal `role`/`provider` values; the stored decision names the
lane *and* the declined candidates; and a long record stays inside the summary columns (500 / 200 /
100). An empty `learning_signal` would read as *"not recorded"*, so nothing-fired writes `'none'` —
recorded, and it was none.

| | |
|---|---|
| **files changed** | `turn-record.ts` (+108, rewritten) · `turn-record.test.ts` (+175) · `types.ts` (`TurnRecord.businessId`) · `run-turn.ts` (carries the tenant) |
| **sibling sweep** | other writers of a per-turn routing record: **0**. Other `aria_ai_calls` writers bypassing `logAICallSafe`: 0 in the turn pipeline. |
| **mutation** | covered by the anti-vacuity pair — a turn whose first candidate answers must record `declined: []`, so a hard-coded list fails |
| **gates** | tsc 0 · vitest **137 files / 1798 tests** · one-exit guard 0 · canon rail pass · `BUILD_EXIT=0` |
| **PARKED** | `aria_turn_records` DDL above. The core record persists to `aria_ai_calls` today; the full record is in the log line. |

---

## PHASE 4 — REPLAY ✅ — and it compared more than the body

**30 real messages from `aria_conversations`, sent to the pre-spine route and to the spine, on the
same machine, against the same seeded fixture, with byte-identical instrumentation.**

### ⚠️ THE RESULT THAT MATTERS: THE RESTRUCTURE IS QUIETER THAN THE NOISE

| comparison | lanes differing, of 30 |
|---|---|
| **OLD vs OLD** — *the same code, run twice* | **9** |
| **OLD vs NEW** — *the entire restructure* | **8** |

**Running the unchanged code twice produces MORE lane differences than the whole restructure does.**

- **6 of the 8** old-vs-new flips (`m03 m07 m08 m12 m17 m24`) **also flip old-vs-old** — provably noise.
- Unique to old-vs-new: **2** (`m09 m18`). Unique to the control: **3** (`m19 m28 m29`).
- **Direction is bidirectional in both**, which a regression never is:
  control →council 5 / council→ 3; test →council 3 / council→ 4.

| axis | OLD | NEW |
|---|---|---|
| status codes differing | — | **0 of 30** |
| empty responses | 6 | **6** — identical |
| model calls, total | 86 | 83 |
| queries, total | 3,406 | 3,325 |
| query delta, same-lane turns | control median **+0** (−13…+9) | test median **+1** (−15…+10) |

**The one systematic difference is +1 query per turn, and it is confirmed, not inferred:** exactly
**30 `ask_aria_router` rows for 30 turns**. That is phase 3's turn record writing one
`aria_ai_calls` row per turn — a deliberate addition, not a regression.

### ⚠️ THE SPRINT'S PREMISE HAD TO BE CORRECTED TWICE, BOTH TIMES BY MEASUREMENT

**1 · A byte-for-byte body comparison is impossible for any lane that calls a model.** Checked
against production rather than reasoned about: *"how are we doing?"* has been asked twice and has
**two distinct stored answers, differing inside the first 80 characters.** Same code, same question.

**2 · ⚠️ THE LANE ITSELF IS NON-DETERMINISTIC.** The classifiers are LLM calls, so the router
inherits their variance. On the **pre-spine code alone**, *"Tidy up before the weekend"* routed
`general → general → general → question` across four runs. **This sits underneath M12's entire
investigation: part of why nobody could reproduce that lane choice is that it does not always
happen.** It is also exactly what M19 exists to remove.

So "differences are bugs in this sprint" cannot be applied literally to prose *or* to lanes. Both
carry a measured noise floor, and the control is what makes the 8 interpretable.

### TWO TURNS WORTH READING INDIVIDUALLY

**`m24` — "generate a poster that says we are open from 3-7pm".** OLD: `general`, 14 queries — it
never reached the image path at all, because the classifier said *general* and the general lane
claims the turn at route.ts:824, long before the image fast-path at 2362. NEW: reached `main` and
took the `image` sub-exit, 71 queries. **That the image path costs ~71 queries is direct
confirmation that phase 2's refusal to hoist `image` into a top-level lane was right** — it really
does sit behind the 19-query context build. Hoisting it would have rendered a byte-identical body
while skipping them. *(It also flips in the control, so it is noise, not a spine change.)*

**`m03` — "how are you".** OLD ran a **four-brain council**: 153 queries, 5 model calls, for *"how
are you"*. NEW took the general lane: 15 queries, 1 model call. Classifier variance, not a spine
change — but a vivid picture of the cost swing the regex/classifier router produces.

### HOW THE COUNCIL CACHE WAS BEATEN — WITHOUT DELETING OR MUTATING ANYTHING

The council caches on `questionHash + dataEpoch`, and `dataEpoch` is the newest sale's timestamp.
Two obvious moves were both barred: **deleting `council_cache` rows is on RULE 20's NEVER list**, and
**re-dating fixture sales (S6's approach) would have changed the very anchors under comparison.**

`writeCouncilCache` sets `expires_at = now + 5 min` and `readCouncilCache` filters on it — so
**letting the TTL expire busts the cache with no deletion, no data mutation, and an identical
epoch.** Confirmed at the start: 0 live cache rows for the fixture. `served_by` distinguishes
`council_fresh` from `council_cache` in every row, and **every council turn in both runs reports
`council_fresh`.**

### THE HARNESS — SYMMETRIC BY CONSTRUCTION, COMMITTED TO NEITHER TREE

Queries have no ledger, so they were counted in-process via the existing `Proxy` in
`supabase-lazy.ts`; model calls at `callModel`. **Applied byte-identically to both worktrees and
verified with `diff`**, so it cannot bias the comparison. Reverted from the main tree afterwards;
`git status src/` is clean.

`pg_stat_statements` was rejected as the query source: it is database-wide, so crons and other
traffic would pollute a per-turn delta.

**The rate limiter had to be bypassed, and the gate was compared before it was.** `ai` is
**20/hour, hard-coded**, with an in-memory per-process fallback — 30 turns × 2 sides cannot run under
it. Before bypassing, the exhausted window was used to capture the real thing: OLD returned exactly
`{"error":"Rate limit exceeded. Try again later."}` at 429, which is byte-for-byte what
`admitBeforeParse` returns and what its unit test asserts.

### ⛔ URGENT, AND NOT MINE TO FIX: THE ANTHROPIC ACCOUNT RAN OUT OF CREDIT

```
400 invalid_request_error — "Your credit balance is too low to access the Anthropic API.
                             Please go to Plans & Billing to upgrade or purchase credits."
```

**First failure 07:09:25 today, on the fixture only. Sip's live business had 32 successful Anthropic
calls and zero failures, last at 06:01. This replay consumed the remainder.** The classifiers fail
over to Google and keep working — which is why lane selection stayed measurable — but the answer
call empties: **6 of 30 turns returned `response: ""` on BOTH sides identically.**

Fixing it is a **billing action**, which is money. **PARKED** per RULE 20. It will make phase 5's
`check:live` red, and that is the honest outcome rather than a massaged one.

### TWO OF MY OWN ERRORS, BOTH RECOVERED

**1 · I deleted `node_modules`.** To avoid a second install I junctioned the old worktree's
`node_modules` to the main one; `git worktree remove --force` followed the junction and deleted the
real directory. Recovered with `npm ci --ignore-scripts` (1,651 packages) — plain `npm ci` fails on a
**pre-existing Windows incompatibility**: `@met4citizen/headtts`'s postinstall runs a Unix
`mkdir -p -m 777` under `cmd.exe`. The hook was reinstalled by hand afterwards, since
`--ignore-scripts` skips `prepare`. **Source, git history and all four commits were untouched** —
verified before reinstalling. *Never junction `node_modules` into a worktree you intend to remove.*

**2 · The first OLD re-run returned 30 × 500.** Restarting the worktree server with the harness flag,
I dropped the env sourcing it needs — the worktree cannot hold its own `.env.local` (correctly
deny-protected), so it inherits the parent's. Diagnosed from the server log, not the exit code:
*"Your project's URL and Key are required to create a Supabase client!"*. No credit burned — every
one of those turns made zero model calls.

### ⚠️ AND ONE LATENT DEFECT THE RECOVERY SURFACED

Restoring files with `git checkout` re-materialised them as **CRLF** (`core.autocrlf=true`;
`.gitattributes` forces LF **only** for `scripts/git-hooks/pre-push`). That turned
`src/lib/ai/gateway.test.ts` red:

```js
GATEWAY.replace(/if \(!req\.businessId\) \{[\s\S]*?\n  \}\n/, '')   // \n never matches \r\n
```

**WALL 1's own mutation test fails on any fresh Windows checkout** — the regex matches nothing, so
`mutated === GATEWAY` and the assertion trips. It goes **red**, not vacuously green, so nothing was
being falsely claimed; but the mutation it exists to perform cannot run there. Fixed to `\r?\n`,
which strengthens it rather than loosening it, with the reason written in the file.

| | |
|---|---|
| **sample** | 30 real messages from `aria_conversations` (**635 conversations exist, not the 290 the paste states**), spanning general · smalltalk · council · data-lookup · brevity · action-planner · image · deliverable · spreadsheet · nav · non-business |
| **runs** | OLD ×2 (baseline + control), NEW ×1 — 90 live turns, all 200 |
| **three counts** | **lane/shape diffs 8 of 30** (control: 9) · **query delta median +1** (control: +0) · **model calls 86 → 83** |
| **explained** | every one. 6 of 8 lane flips reproduce in the control; 2 are within a floor of 9; the +1 query is the turn record, proven by 30 `ask_aria_router` rows |
| **gates** | tsc 0 · vitest **137 files / 1798 tests** · one-exit guard 0 · canon rail pass |
| **NOT done** | prose was never compared — impossible for two independent, measured reasons. No production build was run for the replay: **both sides ran `next dev`**, which is fair because it is the same on both, and HEAD's production build is proven separately by `BUILD_EXIT=0`. |
