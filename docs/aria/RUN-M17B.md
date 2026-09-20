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
