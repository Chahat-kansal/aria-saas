# RUN-M18 · BRAIN-2 — FILL THE TWO EMPTY STAGES

Branch `main` · autonomous run (RULE 20) · started 5 Oct 2026

---

## THE THREE THINGS TO KNOW

*(Written for someone who has been away all day. Updated as the run proceeds.)*

1. **The baseline `check:live` is RED on assertion 3, and that is the sprint's own target.** The
   stored turn carries **no provenance** — `5 passed · 1 failed · 4 skipped · exit 1`. Assertions
   4, 5 and 6 never ran because 3 failed ahead of them. Phase 4 is the phase that closes it. This is
   the first time this gate has produced a real baseline rather than running by luck (see below).
2. **Phase 1 is done: the grounding stage has a body.** `ground()` returned blank fields on every
   turn for seven weeks; it now returns a real anchor set — six named ground-truth queries, each
   recorded as ran / rows / none — for every lane that can put a dollar in front of an owner, and an
   **empty-but-present set with a reason** for every lane that cannot. Four mutations, all red.
3. **Phase 2 found the verifier this repo already had, and wired it up instead of writing a fifth
   one.** `src/lib/aria/verifier.ts` — pure, no model, 25+ tests, returns `pass | hedge | refuse`,
   which is the sprint's three verdicts word for word — has been called by **nothing but the eval
   harness** since MS15. Stage 5 now runs it on every turn. That also makes the **ALLERGEN HARD
   RULE** reachable from the ask path for the first time. Writing my own version first and deleting
   it was the sweep doing its job; the details, and the gap it exposed in that rule's regex, are
   under Phase 2.

**Two smaller things worth a minute each:** a mutation check failed to fail in Phase 1 because the
test omitted `onRecord`, and `opts.onRecord?.(recordOf(…))` short-circuits its own arguments — so the
regression lived in the gap between the test's wiring and the route's. And `ALLERGEN_RE` does not
catch `"any nuts in the banana bread?"`, only `"nut-free"` — founder queue item 6, not fixed here
because it is outside Lane A and widening a safety regex needs a human.

---

## 1 · WHAT IN THE BRIEF WAS WRONG

**This section is first because it is the part most likely to be skipped.** The brief itself asked
for it ("assume this brief still carries one"), and v2 of the brief exists precisely because v1's
premise did not survive Phase 0.

### Carried over: v1's premise, already corrected by the founder in v2

v1 claimed `aria_turn_records` and `ask_aria_router` existed in no schema and that
`aria_conversations` had no provenance column, and instructed that Phase 2 must not assume a turn
record was being stored. Phase 0 disproved it: **provenance lives in `aria_conversations.messages`
JSONB as `assistant.provenance`, not in a column**, so assertion 3 needs neither a new table nor a
new column; and `ask_aria_router` rows are written by `turn-record.ts` through `logAICallSafe` into
`aria_ai_calls`. v2 accepted all of it. Nothing further is owed here — it is restated only so the
chain is readable in one file.

### Found in v2: one correction, and it is a forecast rather than an error

> **`'none'` does not disappear from `ground()`, and it should not.**

M17's own comment forecast that M18 would make a lean envelope unconditional and that
`kind: 'none'` would therefore vanish. Taken literally it would have cost something real for no
behavioural gain, so it was **not** done, and the reason is in the code:

`kind` answers *what business CONTEXT this lane loads* — and the general lane still loads none. That
is still true, still flaw 2 of the logic read, and still worth saying in a value. The anchor set is
a **separate axis**. Keeping them separate means:

- `kind: 'none'` with a loaded anchor set is coherent, and five lanes are exactly that
  (`action_planner`, `inventory_agent`, `multi_domain`, `deliverable`, `background_task`);
- the turn record's `groundingKind` distribution stays **comparable with M17B's**, so Phase 5's
  replay can diff it like-for-like instead of discovering that every value changed name;
- no new `kind` had to be invented, so nothing downstream of `response_summary` shifts.

Collapsing the two axes into one enum would have been a rename dressed as a fix.

### Found in v2: the Phase 1 scope line is accurate but understates the diff by one function

The brief says *"The diff is the body of one function and its type."* It is the body of one function,
its type, **and three call sites that would otherwise double the work it does** — `act()` (which
calls `ground()` once per candidate, and five lanes decline and fall through), `ActOutcome` (which
must carry the grounding out so it is not rebuilt), and `runTurn`'s turn-record line (which called
`ground()` a second time). With M17's empty body all three were free. With a body in them they are
2× to 3× the ground-truth queries on exactly the slowest turns. Reported, not treated as licence to
widen scope: nothing else changed.

---

## 2 · PHASES

### PHASE 0 — BASELINE AND PREFLIGHT  ·  commit `pending`

**SCOPE** · establish the `check:live` baseline before any code moves, and verify the brief's
premises against the live database rather than against the M17B report.

**files changed**

| path | +/− | why |
|---|---|---|
| `playwright.check-live.config.ts` | +24 / −2 | the gate could not start its own web server on Windows |

**⚠️ FINDING — RULE 3a's GATE HAS NEVER ONCE STARTED ITS OWN SERVER ON THIS MACHINE.**

`npm run check:live` died before a single assertion ran:

```
[WebServer] 'NODE_OPTIONS' is not recognized as an internal or external command
Error: Process from config.webServer was not able to start. Exit code: 1
```

`package.json`'s `build` and `start` scripts carry a POSIX `NODE_OPTIONS="…" ` prefix, which
`cmd.exe` cannot parse. And because `reuseExistingServer` is on, **S6 and M17B only ran this gate
because a server happened to already be listening** — the broken command was never executed, so the
breakage was invisible for two sprints. RULE 3a makes `check:live` the last line of every sprint's
gate list; a gate that runs by luck is failure pattern #1 in its purest form.

Fixed by invoking `npx next` directly and moving the memory limit into `webServer.env`, which
Playwright applies cross-platform. **It still fails rather than skips**: a server that cannot start
exits Playwright non-zero with no tests run. `package.json` is outside this sprint's file domain and
was not touched — it is in the founder queue.

**Proven exercised, not masked:** the baseline run was started with **nothing listening on port
3000** (checked), so the new command is what built and served the app.

**VERIFY — the baseline, pasted**

```
  ok  1 … global-setup / seed
  ok  5 [chromium] › ask.spec.ts:82  › 1. the request LEFT the client and reached the route (10.9s)
  ok  6 [chromium] › ask.spec.ts:109 › 2. the answer STREAMED and SETTLED — M4: the watchdog (8.8s)
  x   7 [chromium] › ask.spec.ts:157 › 3. the STORED TURN carries provenance anchors (145ms)
  -   8 [chromium] › ask.spec.ts:182 › 4. an anchored figure RESOLVES TO REAL ROWS — the moat
  -   9 [chromium] › ask.spec.ts:216 › 5. the answer was CONSTITUTION-GOVERNED
  -  10 [chromium] › ask.spec.ts:248 › 6. the ledger records WHICH PROVIDER served it

  1) ask.spec.ts:157 › 3. the STORED TURN carries provenance anchors
     Error: the stored turn carries no provenance — every figure in it renders unanchored
     expect(received).not.toBeNull()
     Received: null

  1 failed
  4 skipped
  5 passed (21.3m)
CHECKLIVE_EXIT=1
```

**⚠️ THE WRAPPER LIED AGAIN — 7th OCCURRENCE.** The task notification read
`completed (exit code 0)`. The log read `CHECKLIVE_EXIT=1`. The log is the truth and the gate is
RED. This is the standing instruction working exactly as intended; it is recorded again because the
count is the argument for never trusting the wrapper.

**gates** · n/a (no `src/` change) · canon rail: clean

**NOT done, and why** · `package.json`'s POSIX prefix is the real root cause and sits outside Lane A.
Parked to the founder queue rather than taken.

**discovered**

- Assertions 4–6 are **serially dependent** on 3. One red assertion hides three others, so "1 failed"
  understates how much of this gate is currently unmeasured. Phase 4 should expect 4 assertions to
  change state, not 1.
- The baseline directly confirms the brief's Phase 4 premise against a real build. No inference.

---

### PHASE 1 — `ground()` GETS A BODY  ·  commit `pending`

**SCOPE** · the stage already ran on every turn and returned nothing. Give it a typed anchor set.

**NOT-SCOPE** · stage order (already correct, and the brief says so) · reachability · the council's
own 18-query block · `aria_turn_records` · any new model call · the verifier (Phase 2) · provenance
writing (Phase 4).

**files changed**

| path | +/− | what |
|---|---|---|
| `src/lib/aria/ask/pipeline/anchors.ts` | **new**, 196 | the lean loader + `ANCHOR_PLAN`, the lane-by-lane decision |
| `src/lib/aria/ask/pipeline/types.ts` | +62 / −4 | `LabelledFigure`, `AnchorQuery`, `TurnAnchorSet`; `TurnGrounding` extended |
| `src/lib/aria/ask/pipeline/run-turn.ts` | +72 / −22 | `ground()` body; `act()` memoises; `ActOutcome.grounding`; the gate path |
| `src/lib/aria/ask/pipeline/ground.test.ts` | **new**, 232 | 7 behavioural tests |
| `src/lib/aria/ask/pipeline/run-turn.test.ts` | +48 / −9 | the M17 `kind` test updated, reason written in-file |
| `src/lib/aria/ask/pipeline/turn-record.test.ts` | +9 | loader stubbed so unit tests stay offline |

**WHAT IT NOW RETURNS**

Six named queries, every figure-bearing lane, once per turn:

| query | source | label |
|---|---|---|
| `revenue_today` | `getRevenueSnapshot()` | Completed sales, today. |
| `revenue_week_to_date` | `getRevenueForRange()` | Completed sales, this week to date. |
| `revenue_last_week` | `getRevenueForRange()` | Completed sales, last week. |
| `customers_on_record` | `pos_customers` count | Customers on record. |
| `customers_consented` | `pos_customers` count | Customers who have consented to marketing. |
| `weekly_revenue_target` | `businesses` | Your weekly revenue target. |

Three decisions inside that table are load-bearing:

- **Revenue comes from the two canonical helpers, never a hand-rolled `pos_sales` query.** RULE 6
  names them; the audit counted ~120 call sites that re-derived the `status='completed'` /
  AEST-boundary rule by hand and got it wrong. This file adds none.
- **The six labels are copied character-for-character from `answer-council.ts:213.`** Six of its nine
  are reused verbatim so the two anchor sets speak one vocabulary. A second wording for "Completed
  sales, today." would be failure pattern #4 committed on purpose.
- **GROUNDING-TEETH: an unset weekly target is ABSENT with a note, never `0`.** A `0` anchor is what
  lets "you are at 0% of target" through a verifier as grounded, and a fabricated target is the
  precise shape of the $999,999 briefing bug.

**WHY LEAN, AND NOT THE COUNCIL'S EIGHTEEN QUERIES** — the decision the brief left open:

1. The council's block lives inside a `try` whose `catch` falls back to the single-model path.
   Hoisting it in front of the lane changes what happens when `getBusinessContext()` throws. The
   brief forbids re-architecting reachability, and M17 recorded that constraint before it.
2. **On that fall-back path there are no anchors at all** — which is exactly the turn a verifier is
   for. A grounding stage that only works when the council's own block worked would be the
   "exists, looks correct, does nothing" shape this repo has seven instances of.

So the council keeps its wider block for the model's SAFE-TO-CITE text, and this lean set — which
`main` and six other lanes have **never had in any form** — is what the answer gets checked against.

**COST, stated plainly:** +6 indexed reads per figure-bearing turn (3 sums, 2 counts, 1 single-row),
on paths that already run 18–19 queries and a model call. **Memoised once per turn**, so a council
turn that declines and falls through to `main` pays for them once, not twice. **No LLM call is added
or changed, so RULE 11's cost-model entry does not apply** — and that is a claim about this phase
only, checked rather than assumed.

**VERIFY — pasted**

```
 Test Files  3 passed (3)
      Tests  44 passed (44)
```

and the full suite:

```
 Test Files  138 passed (138)
      Tests  1806 passed (1806)
```

The seven new assertions are behavioural, not presence checks — which matters here more than usual,
because **M17's stage would have passed every presence check ever written against it**: every field
was there and every field was empty. So:

- a question-lane turn is handed the **actual values** the revenue helpers returned (`822.4`,
  `3310.75`, `2904.1`, `240`, `61`, `4200`), matched by label, plus all six query names and the row
  count each returned;
- the general lane gets an empty-but-present set **and runs not one query — counted**, via a database
  double that records every call. An empty set produced by running six queries and discarding the
  answers would pass every other assertion in that test;
- a failed query is in the set as `ran: false` carrying the thrown message, and **the other five
  still produced figures** — a set that collapsed on one failure would silently un-anchor the whole
  answer;
- an unset weekly target is absent, with no `0` anywhere in the figures;
- the stage runs **once** per turn;
- an admission gate also leaves with an empty-but-present set, and pays for no query.

**MUTATION CHECK — four reverts, and the third one is the finding**

```
mutation                                                       verdict
----------------------------------------------------------------------------------------------
ground() returns M17's empty sets again                        RED - 6 tests failed
the turn record re-grounds instead of reusing outcome.grounding RED - 1 tests failed
an unset weekly target becomes 0 instead of absent             RED - 1 tests failed
the general lane loads anchors it cannot use                   RED - 2 tests failed
----------------------------------------------------------------------------------------------
4 of 4 went red. All verified.
```

**⚠️ THE SECOND MUTATION FAILED TO FAIL ON THE FIRST RUN, AND THE CAUSE IS WORTH MORE THAN THE FIX.**

First run: `STILL GREEN — NOT VERIFIED`. Putting the second `ground()` call back — the one that
doubles every ground-truth query on every answered turn — changed nothing in the suite.

Cause: `runTurn` builds the record as

```ts
opts.onRecord?.(recordOf(envelope.bid, …, outcome.grounding, …))
```

**An optional call short-circuits its own arguments.** With no `onRecord`, the entire `recordOf(…)`
expression — including a `ground()` call placed inside it — is never evaluated. The test helper
omitted `onRecord`; production always passes it (`onRecord: recordTurn`, route.ts). So the test was
not reproducing the wiring the route uses, and the regression lived in the gap.

Fixed by passing `onRecord: () => {}` in the helper, with the reason written into the test file so
the next person does not quietly remove it again. Re-run: **RED, 1 test failed.** This is the second
time in this codebase a mutation check has turned out to be the more valuable half of the phase.

**SIBLING SWEEP**

| searched for | hits | what was done |
|---|---|---|
| `undefined as never` | **0 in code** (6 in comments, all describing the one removed) | the cast this phase deleted was the only one in the repo |
| `TurnGrounding` literals built outside `ground()` | **2** | `run-turn.ts` gate path — given an anchor set, with the reason from `ANCHOR_PLAN`; `silent-failures.test.ts:97` — a stub cast `as any`, **left alone** (see below) |
| production callers of `ground()` | **0** outside the spine | nothing else to update |
| strategies destructuring `grounding` | **0** of 12 | the whole type has one consumer, `turn-record.ts`, which reads `kind` |

`silent-failures.test.ts:97` builds `grounding: { kind: 'none' as const }` inside an object cast
`as any`, for a strategy that never reads it. `tsc` therefore does not flag it and nothing behaves
differently. Declined under `aria-minimal-change` — tidying adjacent test scaffolding is not this
phase's job — and recorded here so it is a known 1, not an unknown 0.

**That 0-of-12 sweep is also what made the type change safe.** Widening `kind: 'full'`'s `ctx` from
`AskAriaContext` to `AskAriaContext | null` is a nullable widening, which RULE 20's response-shape
rule parks **when a consumer could be a cached PWA bundle**. Applying the CONSUMER TEST rather than
the shape of the diff: every consumer of `TurnGrounding` is inside this repo, the sweep finds all of
them, and they change in the same commit. **PROCEEDS.** Nothing on an HTTP response shape moved.

**gates** · `tsc` 0 errors (read from tsc's own exit, not a piped `head`'s) · `vitest` 1806 passed ·
`next build` — see below · canon rail clean · hook: ran

**NOT done, and why**

- The council's 18-query block was not hoisted into the stage. Two measured reasons, above. The
  follow-on — letting the council lane *read* `grounding.anchorSet` instead of rebuilding its own —
  is a real simplification and belongs to whichever sprint owns the lane's internals, not this one.
- `kind` was not collapsed into one axis. See §1.
- `pending_action` loads no anchors. Its text restates an action the owner already approved, so its
  figures came from the stored row. If Phase 4 finds it emitting a figure derived from this turn,
  that is a Phase 4 finding and one line in `ANCHOR_PLAN`.

**discovered**

- **`ANCHOR_PLAN` is typed `Record<LaneName, string | null>` on purpose: a lane added to
  `LANE_NAMES` without a decision is a `tsc` error.** Every allow-list in this repo written as a
  plain object or array has drifted; this one cannot, because the compiler counts it. Worth copying.
- `decide()` never offers `image`, `stopped` or `total_outage` — they are sub-exits of `main`. They
  are in `ANCHOR_PLAN` only because the `Record` must be total, and that is noted in the file so the
  next reader does not go looking for the routing that offers them.

---

### ⚠️ PHASE 4 IS NOT THE PHASE THE BRIEF DESCRIBES — FOUR MEASURED FINDINGS ABOUT THE GATE ITSELF

Found while establishing the Phase 0 baseline, against the live database and the shipped spec file.
They are here rather than in Phase 4 because they change what Phase 4 *is*, and because one of them
is a correction to something I asserted earlier in this run and got wrong.

**First, the retraction.** I read the baseline's turn record, saw
`action_planner — planTrigger`, and reported that the `check:live` question routes to
`action_planner`. **That was wrong.** `extractFeatures()` run against the actual question string
returns `isStrategicQuestion: true` and `planTrigger: false` for both `aria_intent` values — so that
row cannot be the question. It is `action.spec.ts`'s proposed action
(`"Raise the price of Flat White by 10%"`), which runs **before** `ask.spec.ts` in a
`workers: 1` run. My first query had `limit 6` and I read a neighbouring turn as this one. Observed
output corrected static reasoning, in the direction the standing rule predicts.

**What is actually true**, from `aria_ai_calls` for the fixture business across the baseline run:

| time (UTC) | agent_key | meaning |
|---|---|---|
| 23:58:35 | `ask_aria` | action.spec's model call |
| 23:58:38 | `ask_aria_router` | `action_planner — planTrigger`, status 200 — **action.spec's turn** |
| 23:58:51 | `aria_intent_classifier` + `intent_classifier` | **the question's** classifiers |
| 23:58:54 / :55 | `health_signals`, `goal_context` | the council lane's own anchor block |
| 23:59:01 | `council_context` | 6,039 ms — completed |
| *(nothing after)* | — | **no `ask_aria_router` row, no conversation row** |

So the question **did** route to `council`, exactly as the features predict. And then:

**FINDING 1 — the question's turn never completed.** `council_context` finished at 23:59:01 and the
advisor/synthesis calls that follow it never happened. The suite had already run assertion 3, skipped
4–6, and Playwright killed the web server — roughly 8 seconds into the council's advisor phase. The
turn was aborted by the gate's own teardown. **Phase 4 cannot close assertion 3 by making lanes write
provenance, because on this question nothing reached the point of writing anything.**

**FINDING 2 — assertion 2 is a FALSE GREEN, and it is green for the reason S6 warned about.**
`2. the answer STREAMED and SETTLED` passed in 8.8s on a turn that produced no answer. It polls
`page.locator('main').innerText()` until the text stops growing for three polls, then asserts that
the text after the question exceeds 60 characters. `main` contains the whole surface — suggestion
chips, chrome, the question echo — so it settles and clears 60 characters with no answer present.
The file's own comment explains that reading a bubble class had caused a false RED, and the fix for
that created this false GREEN. S6's standard was *"a check that can be satisfied without the feature
working is worthless"*; this one can be.

**FINDING 3 — assertion 3 is reading the wrong turn.** It takes the business's **latest conversation
by `last_message_at`**, not the conversation this turn created. In the baseline that was
action.spec's `action_planner` turn. Its failure message — *"the stored turn carries no
provenance"* — is true of the row it read and says nothing about the question. A gate that reports on
a neighbouring turn is failure pattern #5 with the diagnostic shipped rather than thrown away.

**FINDING 4 — the non-serial fix for "one red assertion hides three" did not take.** `ask.spec.ts`
deliberately splits the DB assertions into a non-serial describe, with a comment saying *"Each of
these now reports for itself."* Assertions 4, 5 and 6 nonetheless reported **skipped** in the
baseline, because each one guards itself with `test.skip(!turn.storedProvenance?.anchors?.length, …)`.
The dependency moved from the describe into the guards; the silence is identical. Present, correct
on its face, does nothing.

**What this means for Phase 4, stated now so it is not discovered late:** closing assertion 3 needs
(a) the question's turn to be allowed to finish, (b) assertion 3 to read the conversation **this
turn** created, and (c) assertion 2 to assert on the answer rather than on the page. Only then does
"every lane writes provenance" become the thing being measured. Phase 4 is in Lane A for the lane
writes; `tests/check-live/**` is a separate call and is raised, not taken, until the phase reaches it.

---

### PHASE 2 — `verify()` STOPS STAMPING `{ran:false}`  ·  commit `pending`

**SCOPE** · stage 5 runs on every result and decided nothing. Make it decide.

**NOT-SCOPE** · no new model call · no rewriting of owner-facing prose · no change to any HTTP
response · `main.ts`'s existing model-based `ask_aria_verifier` (untouched) · provenance writing
(Phase 4).

**⚠️ THE BIGGEST THING IN THIS PHASE IS WHAT I DID NOT SHIP.**

I wrote a verifier here — anchor matching, three verdicts, nine green tests, all five mutations red.
Then I ran the sibling sweep RULE 16 #2 requires, and it found that I had written **a fifth
implementation of a rule this repo already has six copies of**:

| where | tolerance | note |
|---|---|---|
| `response-validator.ts:77` `stripUngroundedNumbers` | 2%, sentence-level, owner-citation bypass | the council + the briefing cron |
| `response-validator.ts:338` | 2% | a second copy in the same file |
| `validate-summary.ts:31` | 2% | a third, identical |
| `ground-guard.ts:14` `guardOutput` | 2%, `strip`/`redact`/`flag` modes | **~25 call sites** — the widely-adopted one |
| `manager/review.ts:40` `matchesAnyAnchor` | 2% + 0.01 absolute, `>= 100` only | the manager |
| `aria/verifier.ts:100` `matchesAnyAnchor` | **0.5%** | MS15's verifier |

**And the last one is this stage's job description.** `src/lib/aria/verifier.ts`, from MS15, header
verbatim: *"PURE ON PURPOSE. Ground truth is passed in; nothing here queries, and nothing here calls a
model… IT SITS AFTER GENERATION… on failure it REFUSES or HEDGES."* It returns
`action: 'pass' | 'hedge' | 'refuse'` — **the sprint's three verdicts, word for word.** It has 25+
assertions in its own test file.

**The only thing that has ever called it is `evals/run.ts`.** Never a production answer path. It is
the seventh instance of this repo's #1 pattern: exists, well made, correct, unreached — and it has
been sitting one function call away from the stage that needed it since MS15.

So the file I had written was **deleted and replaced by a delegation**. Stage 5 now builds a
`GroundTruth` from Phase 1's anchor set and hands it to `verifyResponse()`. That is both the smaller
diff and the larger capability gain, because wiring it makes these reachable from Ask Aria **for the
first time**:

- **the ALLERGEN HARD RULE.** `CLAUDE.md` locks it — no model output may answer allergen or
  dietary-safety questions on any surface, gated or disclaimed or not. `verifyResponse` fires it on
  the QUESTION. Nothing on the ask path had ever asked it.
- the unknown-entity rule · the weak-cost-provenance rule · the house-rule-conflict rule.

**files changed**

| path | +/− | what |
|---|---|---|
| `src/lib/aria/ask/pipeline/verify.ts` | **new**, 151 | the delegation, plus the two hedges `verifyResponse` cannot know about |
| `src/lib/aria/ask/pipeline/verify.test.ts` | **new**, 190 | 13 tests |
| `src/lib/aria/ask/pipeline/types.ts` | +26 / −1 | `verdict` union widened by `'hedged' \| 'refused'` |
| `src/lib/aria/ask/pipeline/run-turn.ts` | +28 / −12 | `verify()` runs it; the question is threaded through for the allergen rule |
| `src/lib/aria/ask/pipeline/turn-record.ts` | +6 / −1 | stores the VERDICT, not the word `'ran'` |
| `src/lib/aria/ask/pipeline/run-turn.test.ts` | +44 / −7 | the M17 pass-through test rewritten, reason in-file |
| `src/lib/aria/ask/pipeline/turn-record.test.ts` | +22 / −2 | updated, plus anti-vacuity for the new branch |

**WHAT IS GENUINELY NEW HERE, AND IT IS THIN ON PURPOSE** — two hedges the delegated verifier cannot
derive, because only the spine knows them:

1. **A failed anchor query hedges, never refuses.** If `revenue_today` threw, today's revenue is not
   in the anchor set — so a perfectly correct `$822.40` looks unverified. Refusing it would report the
   loader's outage as the answer's dishonesty. **This is what Phase 1's per-query `ran` flag was for**,
   and it is the reason that flag was worth carrying.
2. **An empty anchor set hedges, and repeats the set's own reason.** "Unverifiable" and "wrong" are
   different findings, and the anchor set already knows which it is.

The allergen refusal is checked **before both**, so neither hedge can soften a locked rule. There is a
mutation for exactly that.

**DECISION 10 IS SETTLED: the verifier lives INSIDE THE SPINE, AT STAGE 5, BEFORE `render()`** — not
behind a lane's booleans, not after an early return, not conditional on complexity or on which model
served the turn. Every result passes through it, 429s included, and every one comes out `ran: true`.
`{ ran: false }` is **not deleted** from the type: it stays legal, still requires a reason, and
`types.test.ts` still holds that line. What changed is that this stage never produces it.

**VERIFY — pasted**

```
 Test Files  139 passed (139)
      Tests  1821 passed (1821)
```

Not one assertion checks that `verified.ran` is true and stops there — `ran: true` is one word away
from M17 and would be a verifier that runs on every turn and decides nothing. Every test puts a real
answer and a real anchor set in and asserts on the verdict and the counts.

**MUTATION CHECK — 6 of 6 red**

```
mutation                                                     verdict
----------------------------------------------------------------------------------------------
verify() stamps {ran:false} again, as M17 did                RED - 5 tests failed
verifyAnswer never consults the real verifier                RED - 10 tests failed
a failed anchor query refuses instead of hedging             RED - 1 tests failed
an empty anchor set refuses rather than hedging              RED - 1 tests failed
the allergen refusal loses precedence over the hedges        RED - 1 tests failed
the turn record stores 'ran' instead of the verdict          RED - 1 tests failed
----------------------------------------------------------------------------------------------
6 of 6 went red. All verified.
```

**⚠️ FINDING — A GAP IN THE ALLERGEN GUARD, FOUND BY MY OWN TEST, NOT FIXED**

Writing the anti-vacuity test for the allergen precedence turned up this:

```
"any nuts in the banana bread?"   → NOT caught   (verdict: ok)
"is the banana bread nut-free?"   → caught       (verdict: refused)
```

`verifier.ts`'s `ALLERGEN_RE` requires a **qualifying phrase** around the allergen noun — `nut-free`,
`peanut`, `contains nuts`, `gluten-free`. **A bare allergen noun does not match.** Those are the same
question from an owner's point of view, and the uncaught phrasing is the closer one to what a worried
customer says at the counter.

**NOT FIXED HERE, and the reason is not laziness:** `src/lib/aria/verifier.ts` is outside this
sprint's file domain, and widening a safety regex needs a human to weigh the false-positive cost —
every "vegan" and "vegetarian" in an ordinary menu conversation is a candidate. It is **founder queue
item 6**, and the suite now carries a loudly-labelled test asserting the current behaviour so the gap
is visible in CI rather than only in this document. That test goes red the moment the regex is
widened, which is the right signal to delete it.

**⚠️ TWO TOLERANCES NOW DISAGREE, RECORDED RATHER THAN QUIETLY PICKED**

`verifyResponse` matches within **0.5%**; the council's own synthesis guard uses **2%**. A figure the
council shipped can therefore be recorded as `refused` by the spine. Two tests assert that boundary
explicitly ($826.00 passes, $834.70 refuses) rather than smoothing it over — a disagreement nobody
wrote down is how six copies of one rule happened in the first place. It is harmless **today** only
because this stage records and never edits. It stops being harmless the moment a phase applies the
verdict.

Same for the **owner-citation bypass**: `response-validator.ts` never strips a sentence citing the
owner, because the owner stating a figure *is* grounding. `verifier.ts` has no such rule, so
"You mentioned a $5,000 target" records as `refused`. A test asserts that, with a note that this is
the case which would wrongly withhold an answer if the verdict were ever applied.

**SIBLING SWEEP**

| searched for | hits | what was done |
|---|---|---|
| callers of `verify()` | 1 production (`run-turn.ts`) + tests | both call sites threaded with the grounding and the question |
| places producing `{ ran: false }` | **0 in stage 5**; 1 unrelated route (`works/plan/[id]/run`) with its own meaning | left alone |
| anchor-matching rules | **6 copies, 3 engines** | reused the purpose-built one; the other five untouched and tabulated above |
| does verification reach an HTTP body? | **no** — `render.ts` serialises `result.body` and nothing else | so no response-shape question arises at all |
| existing verifier modules | **2** (`aria/verifier.ts`, `aria/ground-guard.ts`) | `verifier.ts` is now wired; `ground-guard.ts` left to its ~25 callers |

**gates** · `tsc` 0 errors · `vitest` 1821 passed in 139 files · canon rail clean · one-exit guard
clean (32 files scanned whole) · `BUILD_EXIT` — see the gate line in the commit

**NOT done, and why**

- **`safeResponse` is ignored.** `verifyResponse` returns replacement prose for a non-pass verdict.
  Applying it would change what an owner reads, which is a customer-facing behaviour change and
  PARKS under RULE 18. Phase 2 wires the DETECTION; the substitution needs a human present. The body
  the client receives is byte-identical.
- **Entities are passed empty.** `verifyResponse`'s entity rule is guarded by `known.size > 0`, so an
  empty list disables it rather than flagging every Title-Case phrase. Populating it needs product,
  supplier and staff names in the anchor set — a Phase 1 widening, not a Phase 2 smuggle.
- **The six tolerance copies were not unified.** Rail-first work spanning `src/lib/manager/**` and
  `src/lib/aria/*`, both outside Lane A. Founder queue item 7.
- **`main.ts`'s `ask_aria_verifier` model call was not removed.** It flags contradictions a pure check
  cannot see, and removing it would be a downgrade (RULE 0). The two are complementary: one is
  arithmetic on every turn, the other is a model on complex turns.

**discovered**

- The brief's three verdicts came from `aria/verifier.ts`'s `action` union. They are not new
  vocabulary — they are the existing vocabulary of a module nobody had wired up.
- `verifyResponse` skips `value === 0` ("$0.00 states an absence, not a measurement"), which means a
  dormant business's honest zeros never trip the verifier. That is the right call and worth knowing
  before anyone reads a `refused` count.

---

## 3 · `check:live` — PHASE 0 AND END, SIDE BY SIDE

| assertion | phase 0 (baseline) | end of run |
|---|---|---|
| 1 · the request reached the route | ✓ | *pending* |
| 2 · the answer streamed and settled | ✓ | *pending* |
| 3 · the stored turn carries provenance | **✗ null** | *pending* |
| 4 · an anchored figure resolves to real rows | ⊘ skipped (3 failed) | *pending* |
| 5 · the answer was constitution-governed | ⊘ skipped (3 failed) | *pending* |
| 6 · the ledger records which provider served it | ⊘ skipped (3 failed) | *pending* |
| **exit code** | **1** | *pending* |

---

## 4 · FOUNDER QUEUE

| # | item | blocks | note |
|---|---|---|---|
| 1 | **Anthropic credit top-up** | Phase 5's replay, and any model-backed check | exhausted 07:09 on 20 Sep by M17B's replay |
| 2 | `package.json`'s POSIX `NODE_OPTIONS="…"` prefix on `build`/`start` | nothing now; it is the root cause Phase 0 worked around | outside Lane A. `npx next` + `webServer.env` is the local fix; the scripts themselves still break any `cmd.exe` caller |
| 3 | The `CLAUDE.md` bypass wording proposed in `RUN-M17B.md` | nothing | still unapplied |
| 4 | `aria_turn_records` DDL | nothing — **M18 does not need it** | parked proposal, see `RUN-M17B.md` |
| 5 | `TEST_USER_PASSWORD` reset | the smoke suite's positive half | authorisation action, parked under RULE 20 |
| 6 | **`ALLERGEN_RE` does not catch a bare allergen noun** — `"any nuts in the banana bread?"` passes, `"nut-free"` is caught | the completeness of a LOCKED rule | `src/lib/aria/verifier.ts:81`, outside Lane A. Widening a safety regex needs someone to weigh the false positives — every "vegan"/"vegetarian" in a menu conversation. A labelled test in `verify.test.ts` holds the current behaviour and goes red when it is fixed. |
| 7 | **Six copies of the 2% anchor tolerance, across three engines** (table in Phase 2) | nothing today; it is why the spine and the council can disagree about one figure | rail-first unification spanning `src/lib/manager/**` and `src/lib/aria/*`, both outside Lane A |
| 8 | **`aria/verifier.ts` was unreachable in production until this sprint** — `evals/run.ts` was its only caller | — | now wired at stage 5. Worth knowing that its rules (entities, cost provenance, house rules) are running against owner answers for the first time, so their false-positive rate has never been observed live |

---

## 5 · DECISIONS SETTLED AND EXPOSED

| decision | status after Phase 1 |
|---|---|
| Where does grounding live? | **Settled.** Inside the spine, stage 2, before `act()` — and it now returns something. |
| Is "nothing to ground" a value or an absence? | **Settled.** A value: an empty set with a required reason. `emptyAnchorSet('')` throws. |
| Does `kind` carry the anchor set, or is it a second axis? | **Settled — second axis.** See §1 for what collapsing them would have cost. |
| Does the council's block move into the stage? | **Exposed, not settled.** Two measured reasons not to do it here; the follow-on is named above. |
| Decision 10 — verifier placement | **Settled. Inside the spine, stage 5, before `render()`** — every result, 429s included, and none of them `{ ran: false }`. |
| Which anchor-matching engine is canonical for the ask path? | **Exposed, and it is worse than it looked.** Six copies, three engines. The spine delegates to the purpose-built one; the other five are tabulated and untouched. Founder queue 7. |
| Does the verifier edit the answer? | **Settled: no.** It records. `safeResponse` is ignored — substituting owner-facing prose needs a human present. |

---

## 6 · FOUND ALREADY BUILT

| # | what the brief asked for | what was already true |
|---|---|---|
| 20 | v1's Phase 1: re-order so `decide()` precedes `ground()` | Already built in M17 phase 2, and M17's header already explained why. Accepted by the founder in v2. |
| 21 | Phase 0: a `check:live` baseline | The command existed and had "run" for two sprints — **by luck.** Its web server had never started on this machine. Present, not working. |
