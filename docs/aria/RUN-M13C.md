# RUN-M13C · THE COUNCIL THAT SAYS STEADY STATE

**7 September 2026 · autonomous run, RULE 20 · five phases, five done, none parked as work, five
commits. All pushed. Build verified green.**

**"All systems are in steady state" is gone.** It had been the answer to 94 consecutive mornings in
which the council produced nothing, and it is now six sentences — one per thing that can actually
happen overnight, each built from counts the council took of its own run.

## THE THREE THINGS YOU MOST NEED TO KNOW

**1. ⚠️ The whole feature is broken by ONE FIELD, and it is not the one the sprint expected.**

```ts
// src/lib/agents/base-agent.ts:11
protected supabase = createServerSupabaseClient();   // anon key + cookies. A cron has no cookies.
```

RLS is on. So **every agent's decisions and run-logs have been silently rejected since 4 June** —
which is the day these last ran from a browser, with a real session. `agent_decisions` holds 2 rows;
`agent_runs` holds 7. And for three agents (`reorder`, `pricing`, `schedule`) their **reads** go
through it too: Sip has **74 active products, 2 outlets, 5 staff and 1,802 completed sales**, and
those three cannot see one of them.

**PARKED, because changing it is an authorisation change (RULE 18), not because it is hard.** The
fix is to *inject* the client — service-role for cron and council, the caller's for a route — not to
swap it for `supabaseAdmin`, which would make every agent bypass RLS inside six user-facing routes.

**2. The sprint's premise about `logRun` was wrong, and the truth is better.** The brief says it
"failed silently inside a try/catch that cannot catch a resolved `{ error }`". The try/catch part is
true; the conclusion is not. **The exact insert `logRun` performs was ACCEPTED by production** in a
rolled-back probe. It was never failing — it was never *allowed*. Same for the proposal insert. Two
more corrections in the same class: **`business_events` cannot be the interim home** (its CHECK
rejects `entity_type='council_session'` with SQLSTATE 23514 — writing there would have re-created
this sprint's own silent-failure bug), and **there was nothing to remove from the W6 override list**,
which has three entries and never contained either file.

**3. The first real diagnosis arrives on its own tonight.** Phase 2 made `saveDecisions` **throw**
with the rejection message instead of returning `[]`. Phases 1–3 are deployed. At 20:00 UTC the
council will record, per agent, what happened and why — into `agent_runs` and into the session row —
and the narrative will say *"N of 14 checks did not report"* instead of "steady state". The two
queries to run afterwards are at the end of the phase 5 section.

## THE SIX SENTENCES — rendered from real data, not described

```
quiet        All 14 overnight checks reported and nothing needs you today.

incomplete   2 of 14 overnight checks reported. The other 12 did not, so last night's check is
  ← what     incomplete — I have logged it and will flag it again if it repeats. Nothing in what
    last     did report needs you today.
    night
    was

nothing_ran  None of the 14 overnight checks reported back, so I have nothing to tell you about
             last night. That is a fault, not a quiet night — it has been logged and I will flag
             it again if it repeats.

proposed     Reviewed 3 recommendations and approved the highest-impact actions for today.

lost         Overnight checks produced recommendations but they could not be saved, so there is
             nothing to show you. This is a fault on my side, not a quiet night — it has been
             logged.

unknown      This session did not record which overnight checks ran, so I cannot tell you whether
             nothing needed doing or nothing reported.
```

There is no literal `14` in the function — every count comes from the health block, so a fifteenth
agent changes the sentence with no code edit. The 96 historical sessions read **-1 (unknown)**, never
0: a session that did not record its agents did not run zero of them.

## WHAT IT COSTS AND WHETHER TO KEEP IT

| | |
|---|---|
| model calls, 5 Jun → 6 Sep | 281 |
| `aria_ai_calls` says it cost | **$0.00** — and that is rounding, not free |
| **actually cost, priced from real tokens** | **≈ US$0.20** |
| calls that failed | 144 (51%) — **all one cause**: "credit balance is too low", last seen 26 Aug |
| proposals produced, ever | **2**, both 4 June. 0 executed. |

**RECOMMENDATION: FIX, DO NOT RETIRE.** The machinery is complete — 14 registered agents all with
real model call sites, a chair, a conflict detector, an executor, a settings surface, and an owner
with all nine configured agents switched on. Four agents demonstrably reach the model and answer.
Nothing here is a stub. It costs twenty cents a quarter to leave running while it is fixed. **A
feature that has never worked because of one mis-wired client is not a feature nobody wants; it is a
feature nobody has seen.**

## THE NUMBERS THE SPRINT ASKED FOR

| | before | after |
|---|---|---|
| W6 override list | **3** | **3** — it never contained these files; W6 grandfathers by diff, not by list |
| unread Supabase errors in the two files | 7 of 10 | **0 of 10** — 3 named by the sprint, **6 more found by the sweep, all fixed** |
| presence tests under the walls | 20 | **19**, alongside **44** behaviour tests (13 of them new) |
| presence tests elsewhere in the repo | — | **393 across 70 of 123 files** — reported, out of scope |

## TWO THINGS THAT DID NOT GO TO PLAN, REPORTED RATHER THAN SMOOTHED OVER

- **⚠️ The sprint's phase-2 mutation failed to fail.** *"Re-silence one → the W6 rule goes red."* It
  does not, in either guard mode. W6 scans **added** lines; re-silencing restores the *original*
  text, so the line stops being a change at all. **A regression that returns a file to exactly how it
  was is invisible to this rail by construction.** Proven non-vacuous with a probe that *is* a new
  line (1 violation, correct file and rule, then removed). The protection against un-fixing those
  nine lines is the unit tests, not the guard.
- **⚠️ I could not trigger a live run** — it needs `CRON_SECRET` and a production cron trigger, which
  is not something to do unattended. Everything in phase 5 is measured from the live database and
  the code paths instead, and the one question only a run can answer is named with the query for it.

## MY OWN ERRORS THIS RUN

- **I over-stated phase 0's finding and corrected it in phase 5.** I wrote that "the agents' reads go
  through the anon client". Measured per file, that is true of **3 of 14**, not all of them — the
  other eleven read with `supabaseAdmin` and see the data fine. The *writes* are anon for all
  fourteen, which is the part that stands. Corrected in place rather than left to be re-reported.
- **My anti-vacuity probe asserted the wrong outcome** and went red on its first run: I gave the
  legacy provider shape a body that did not parse, so `unparseable` was the correct answer and my
  expected `ok` was wrong. The probe was fixed, not the code.

---

Written incrementally as the run went — a halted run still leaves a readable log.

---

## PHASE 0 — GATE

### ✅ The DDL premise checks out exactly

`aria_ai_calls.retry_of` — **column present, index `aria_ai_calls_retry_of_idx` present, 13,366 rows
intact.** M13B's parked item is closed. Verified against `information_schema` / `pg_indexes`, not
assumed.

### ⚠️ FOUR PREMISE CORRECTIONS, ALL PROVEN AGAINST PRODUCTION

**1. `business_events` CANNOT be the interim home, and writing there would have reproduced this
sprint's own bug.** The brief says *"log to `business_events` in the meantime so the information is
not lost again."* That table carries

```
CHECK (entity_type = ANY (ARRAY['decision','job']))
CHECK (event_type  = ANY (ARRAY['proposed','approved','declined','expired',
                                'job_created','job_completed','job_failed']))
```

An `entity_type='council_session'` row is **REJECTED with SQLSTATE 23514** — measured inside a
rolled-back `DO` block, not inferred. Supabase resolves with `{ error }` rather than throwing, so it
would have failed **silently**: information lost again, by the very fix meant to stop losing it.

**`agent_runs` is the right home and already exists** — one row per agent run, with an `errors`
jsonb column built for exactly this. The same probe confirmed both the `logRun` row shape and an
errors-array row **ACCEPTED**.

**2. ⚠️ `logRun` is NOT failing. It is not being reached — and neither are the agents' data reads.**
The brief says *"`logRun` has failed silently since [4 June], inside a `try/catch` that cannot catch
a resolved `{ error }`."* The `try/catch` observation is true and the conclusion is not: **the exact
insert `logRun` performs was ACCEPTED by production** in the rolled-back probe.

The real cause is one line, and it explains the entire feature:

```ts
// src/lib/agents/base-agent.ts:11
protected supabase = createServerSupabaseClient();   // ← ANON KEY + cookies
```

`createServerSupabaseClient()` is `createServerClient(url, supabaseAnonKey, { cookies })`. **In a
cron there are no cookies**, so it is unauthenticated. RLS is enabled on `agent_runs` (2 policies)
and `agent_decisions` (1 policy). Both of `BaseAgent`'s own writes go through it:

| line | write | client |
|---|---|---|
| `base-agent.ts:46` | `agent_decisions` insert | `this.supabase` — **anon** |
| `base-agent.ts:52` | `agent_runs` insert | `this.supabase` — **anon** |
| `base-agent.ts:94` | `aria_ai_calls` insert | `supabaseAdmin` — **service role** |

**That table is the whole diagnosis.** It is why `aria_ai_calls` rows keep landing every night while
`agent_runs` and `agent_decisions` have been frozen since **4 June** — and why the agents *find*
nothing to propose: their **reads** go through the same anon client, and an RLS-protected read
returns a silent empty `[]` (RULE 7, verbatim). The date boundary fits: 4 June is the day the
agents were run **manually from the dashboard**, where a real user session existed and the cookies
were there.

**3. ⚠️ There is nothing to remove from the W6 override list.** The brief says *"Remove them from the
W6 override list in the same commit."* `READ_THE_ERROR_ALLOWLIST` has **three** entries —
`database.types.ts`, `supabase-admin.ts`, `supabase-server.ts` — and **neither
`proposal-council.ts` nor `base-agent.ts` is on it.** W6 is a *diff-scan* rule: pre-existing lines
are grandfathered by not appearing in the diff, not by a list. **Override count before: 3. After: 3.**
Touching those lines makes them new, so they must satisfy the rule — which is the ratchet working as
designed, without a list edit.

**4. `agent_council_sessions` has no `metadata` or `errors` JSONB.** Its columns are
`id · business_id · session_date · status · proposals_count · conflicts_detected · plan ·
plan_narrative · projected_revenue_impact · projected_cost_saving · owner_priority ·
executed_actions · actual_revenue_impact · completed_at · created_at`. See phase 1 for where the
health block goes and what is parked.

### The presence-test census (phase 4's worklist)

Every `it()` under the wall files classified by whether its assertions read **source text** or a
**returned value**:

| file | presence-only | exercises a function |
|---|---|---|
| `src/lib/ai/gateway.test.ts` | **2** | 7 |
| `src/lib/ai/gateway-truncation.test.ts` | **8** | 3 |
| `src/lib/ai/w1-allowlist.test.ts` | 0 | 5 |
| `src/lib/aria/cost-truth.test.ts` | **7** (3 guard W1) | 9 |
| `src/lib/agents/council-executor-silence.test.ts` | **3** | 6 |

`scripts/` contains **no** test files. Phase 4 converts the ones guarding W1/W6 and reports the rest.

---

## PHASE 1 — READ `agentErrors` ✅

**Commit:** `<phase-1>` · `proposal-council.ts`, `council-agent-health.test.ts` (new, 11 tests).

### The line

```ts
// proposal-council.ts:271, before
const agentErrors: string[] = []      // pushed to at :288 and :300, READ AT NEITHER
```

Ninety-four nights of failures went in and nothing came out — not logged, not stored, not returned.
That single unread array is why *"12 of 14 agents did not report"* was unanswerable from production.

### What it is now

`AgentFailure { agent_type, kind: 'not_registered' | 'timed_out' | 'threw', reason }`, collected
alongside `agentsReported` and `agentsSkipped`, and summarised into a `CouncilAgentHealth` block that
is **persisted and returned**.

A fourth state was found while wiring it and is now recorded rather than lost: an agent whose `run()`
**resolves without a decisions array** — not an exception, and not a report either. That is precisely
the state that used to be indistinguishable from calm.

**A timeout is kept distinct from a crash.** One says the agent is too slow for the 25-second window
it is given; the other says it is broken. Reported as one category they stay indistinguishable —
which is how this feature got here.

### Where it is persisted

| what | where | why |
|---|---|---|
| per-agent failure | **`agent_runs`** — one row each, `errors` jsonb, `triggered_by: 'council'` | the table built for it; `business_events` is CHECK-rejected (phase 0) |
| session health | **`agent_council_sessions.plan.agent_health`** | no metadata column exists; `plan` is written on **every** run, including zero-proposal ones |
| caller | returned on `CouncilSession.agent_health` | so a surface can render it without a second query |

**⚠️ Written with `supabaseAdmin`, and that is the point.** The council holds a service-role client,
so it records **on the agents' behalf** — no authorisation change to `BaseAgent`, whose own anon
client is the parked finding below.

### ⚠️ PARKED — the column, and the client

**(a) `agent_council_sessions.agent_errors jsonb` — DDL, not mine to write.** The clean end-state; a
dedicated column beats a key inside `plan`.

```sql
alter table public.agent_council_sessions add column if not exists agent_errors jsonb;
create index if not exists agent_council_sessions_agent_errors_idx
  on public.agent_council_sessions using gin (agent_errors) where agent_errors is not null;
```

**(b) `BaseAgent`'s anon client — PARKED AS AN AUTHORISATION CHANGE, and it is the real bug.**
Switching `protected supabase = createServerSupabaseClient()` to `supabaseAdmin` would make every
agent read and write **bypass RLS**, including in the six user-facing API routes that also construct
these agents (`/api/agents/bas/draft`, `/api/agents/clv/trigger`, `/api/agents/financing/run`,
`/api/finance/generate`, and two crons). RULE 18 and this sprint's own decision table both say
authorisation parks. **Recommended fix, for a human:** give `BaseAgent` an injected client —
service-role when constructed by a cron or the council, the caller's client when constructed by a
route — rather than one shared default. That is a one-file change with six call sites to audit, and
it is the difference between this feature working and not.

**This sprint makes the failure visible; it does not make it absent.** That is the decision table's
instruction, and after this commit the failure is visible for the first time.

### Verification — mechanism proven at the SQL layer, end-to-end deferred to phase 5

Rolled-back `DO` block against production, writing the exact rows the new code writes and reading
them back:

```
[session-row: 12/14 reported; failures=reorder(timed_out), pricing(threw)]
[agent_runs:  reorder -> timed_out: timeout | pricing -> threw: Cannot read properties of undefined]
```

**The session row names the agent and says why.** Nothing committed. The first *real* run is phase 5,
which is where the live per-agent report comes from.

### Rails — they call the functions

11 tests driving `classifyAgentFailure`, `summariseAgentHealth` and `readStoredAgentHealth` **by
calling them**, per this sprint's new standing rule. No assertion in the file reads source text.

**Mutation:** the pre-M13C behaviour reproduced — collect the failures, return a summary that forgets
them. Red, on the count and on the array.

**⚠️ GROUNDING-TEETH, in the reader.** The 96 historical sessions have no `agent_health` block.
`readStoredAgentHealth` returns **-1 (unknown)**, never 0. A session that never recorded its agents
did not run zero agents — rendering that as "0 of 0" would be the same fabrication the narrative is
being fixed for, and phase 3 refuses to build a sentence from -1.

---

## PHASE 2 — READ THE OTHER TWO ✅ (three named, nine fixed)

**Commit:** `<phase-2>` · `base-agent.ts`, `proposal-council.ts`, `council-agent-health.test.ts`.

### The three the sprint named

| site | was | is |
|---|---|---|
| `base-agent.ts:46` `saveDecisions` | `const { data } = …insert(rows).select()` → `data ?? []` | reads `error`, records it, **throws** |
| `base-agent.ts:52` `logRun` | `try { await …insert(…) } catch` | reads `error`, records it, **stays non-fatal** |
| `proposal-council.ts:319` proposal insert | `const { data: insertedProposals } = …` | reads `error`, carries it into the health block |

**`saveDecisions` throws, and that is the sprint's "do not report success" applied literally.**
Returning `[]` after failing to save real decisions says *"this agent had nothing to propose"* about
an agent that had plenty and lost it. Every route that constructs an agent is wrapped in
`withErrorCapture`, so a throw lands in this repo's **existing** error shape rather than inventing
one — no new response shape, and the M13B consumer test is satisfied.

**`logRun` stays non-fatal.** Losing run telemetry must never take down an agent that otherwise
worked. Silence was the defect, not the non-fatality.

**The proposal insert does not throw either.** The session is still worth completing and the chair
still has something to say about what the agents found. What must never happen is reporting the
night as quiet — so `CouncilAgentHealth` gained `proposal_persist_error`, and phase 3 says it out
loud.

⚠️ **The health block is now built AFTER the insert.** Built before it — where it naturally wanted to
go — it could only ever record `proposal_persist_error: null`. A health report structurally unable to
express the failure it exists to report is this sprint's own bug, one layer up.

### Why the diagnostic writes use `supabaseAdmin`

`BaseAgent`'s own client cannot write (phase 0, finding 2). A record of a failure that fails to
record is the failure this sprint is about, so the **diagnostic** row goes through the client that
can write. This is not an authorisation change: the agent's own reads and writes still go through
its own client, and the parked fix is unchanged.

### Sibling sweep — searched 2 files, found 6 more, fixed all 6

| file | unread destructures before | after |
|---|---|---|
| `proposal-council.ts` | 6 of 8 | **0 of 8** |
| `base-agent.ts` | 1 of 2 (+ a bare `catch {}`) | **0 of 2** |

The sweep found the same defect five more times in the same file, so all of them were fixed — the
decision table's "fix the ones in the declared file domain". Two are worth naming:

- **`completedSession` (STEP 8) — the most important unread error in the file.** That update is what
  marks the session complete and stores the narrative *and* the health block. Discarded, a rejection
  left the session `'running'` for ever while the function returned as though the night had gone
  fine.
- **`agentSettings`** — a failed read fell through to `enabled: true`, so a broken settings query
  **silently ran an agent the owner had switched off.** Now recorded as a failure and skipped.

`getSettings`'s bare `catch { return defaults }` also now logs; same class, same file.

### ⚠️ The W6 override list did not change, because it never contained these

**Before: 3. After: 3.** `READ_THE_ERROR_ALLOWLIST` holds `database.types.ts`, `supabase-admin.ts`
and `supabase-server.ts` — and nothing else, ever. See phase 0, correction 3: W6 grandfathers by
diff, not by list. Every line touched here became a **new** line and had to satisfy the rule to pass
the pre-push hook, which is the ratchet working exactly as designed with no list to edit.

### Verification

`agent_runs` receiving a row on the next real run is **phase 5's** live check — the row shape is
already proven ACCEPTED against production (phase 0), and the client that must write it is the
parked finding, so the council writes on the agents' behalf.

**Mutation:** re-silencing one of the fixed lines and re-running `canon-rail-guard` — reported below
with the observed output.

### ⚠️ THE MUTATION FAILED TO FAIL — and that is a real property of the guard, reported loudly

The sprint's mutation is *"re-silence one → the W6 rule goes red."* **It does not.** Re-silenced
`completedSession` and ran the guard in both modes:

```
  default (origin/main...HEAD):  no new canonical-path violations introduced. Pass.
  --working-tree:                no new canonical-path violations introduced. Pass.
```

**The guard is not broken and the fix is not fake. The mutation is the wrong shape.** W6 is a
*diff-scan* rule over **added** lines. Re-silencing a line restores its **original** text, so the
line stops being a change at all and there is nothing for the scan to see. A regression that returns
a file to exactly how it was is, by construction, invisible to this guard.

Proven not to be vacuous, by a probe that IS a new line:

```
  [canon-rail-guard] 1 new violation(s) found
    src/lib/agents/proposal-council.ts:658  [supabase-error-not-read]
```

Probe removed; clean again. **So: the rule fires on new code, exactly as designed, and it cannot
catch a revert.** That is worth knowing before anyone relies on it as a regression detector — the
protection against un-fixing these nine lines is the unit tests and review, not the rail.

**The behavioural mutation that does go red** is the one in `council-agent-health.test.ts`: a health
block that forgets its failures, and one that cannot distinguish a rejected proposal insert from a
quiet night. Both red on the returned value, not on source text.

---

## PHASE 3 — STOP SAYING STEADY STATE ✅ ← *the owner-facing line*

**Commit:** `<phase-3>` · `proposal-council.ts`, `council-narrative.test.ts` (new, 12 tests).

### What it said for 94 mornings

```ts
plan_narrative: proposals.length === 0
  ? 'No agent proposals today — all systems are in steady state.'
  : 'Aria reviewed N proposals and approved the highest-impact actions for today.'
```

**Two branches for at least five different nights.** Zero proposals and a healthy business rendered
identically, so total agent failure and genuine calm produced the same reassuring sentence.

### Six cases now — and here they are, rendered from real data, not described

```
quiet        All 14 overnight checks reported and nothing needs you today.

incomplete   2 of 14 overnight checks reported. The other 12 did not, so last night's check is
   ← LAST    incomplete — I have logged it and will flag it again if it repeats. Nothing in what
     NIGHT   did report needs you today.

nothing_ran  None of the 14 overnight checks reported back, so I have nothing to tell you about
             last night. That is a fault, not a quiet night — it has been logged and I will flag
             it again if it repeats.

proposed     Reviewed 3 recommendations and approved the highest-impact actions for today.

lost         Overnight checks produced recommendations but they could not be saved, so there is
             nothing to show you. This is a fault on my side, not a quiet night — it has been
             logged.

unknown      This session did not record which overnight checks ran, so I cannot tell you whether
             nothing needed doing or nothing reported.
```

**The `incomplete` line is what Sip would have read this morning**, instead of "all systems are in
steady state".

`proposed` also carries a truthfulness clause the old sentence could not: with recommendations *and*
failures it says *"4 of 14 checks did not report, so this is not the full picture — I have logged
that."*

### ⚠️ Every count comes from the health block. There is no `14` in this function

`agents_total` is `ALL_AGENT_TYPES.length` **at the time of the run**, so a fifteenth agent changes
the sentence with no code edit — asserted by a test that passes 15 and reads "All 15 overnight
checks". An agent the owner switched off is subtracted from the expected total and named
separately (*"(2 are switched off)"*) rather than counted as missing.

### ⚠️ It refuses to guess, and that is a case of its own

The 96 historical sessions have no health block, so `readStoredAgentHealth` returns **-1**. Rendering
that as "0 of 0 checks" would be exactly the fabrication this function exists to remove, so -1
produces the `unknown` sentence. A test asserts the output contains neither `-1` nor `0 of`.
GROUNDING-TEETH, on the owner's own screen.

### Ordering: `lost` outranks everything

A rejected proposal insert is reported before any other case, because it is the only night where the
owner is missing something that genuinely existed. Asserted: a night that is *both* lost and totally
failed still reports `lost`.

### Mutation — the old sentence, reproduced

```
old implementation, four different nights  →  ONE sentence   (Set size 1)
buildCouncilNarrative, same four nights    →  FOUR sentences (Set size 4)
```

That is the bug in one assertion. **Anti-vacuity:** all six cases are reachable (a `Set` of six
distinct `case` values), each string is over 20 characters, and **"steady state" appears in none of
them.**

Every assertion in the file **calls `buildCouncilNarrative` and reads the returned string.** Nothing
in it reads source text.

**Gates:** tsc 0 · vitest **122 files / 1600 tests, exit 0** · `next build` **BUILD_EXIT=0**.

---

## PHASE 4 — PRESENCE TESTS BECOME BEHAVIOUR TESTS ✅

**Commit:** `<phase-4>` · `gateway-behaviour.test.ts` (new, 13 tests), `gateway.test.ts`,
`gateway-truncation.test.ts`.

### The test that started this rule

```ts
expect(GATEWAY_CODE).toContain("from '@/lib/aria/truncation'")
```

It passed. It kept passing for weeks. And the function it named was **structurally blind** — the
gateway handed `inspectTruncation` an object with neither `stop_reason` nor `usage`, so it returned
`{hitCeiling:false}` on every model call in the product. **A presence test passes on dead code**: it
cannot fail for the reason you care about, because it never asks the question you care about.

### `gateway-behaviour.test.ts` — the wall, called

A controlled provider stands behind the gateway (`vi.mock`, the pattern already used in three test
files here) and every assertion reads a **return value**:

| what it proves | how |
|---|---|
| a clipped call that parsed → `ok_at_ceiling` | provider returns `stop_reason: 'max_tokens'`, assert `res.outcome` and the whole `truncation` object |
| a clipped call that did not → `truncated_mid_structure` | same, unparseable body |
| a finished call → `ok` | `stop_reason: 'end_turn'` |
| token counts survive the boundary | `input_tokens: 1234` in, `1234` out |
| prose vs JSON judged differently | `"OK"` with no fallback is `ok`; empty with a fallback is `unparseable` |
| `requestSummary` / `timeoutMs` **arrive** | read off the provider mock's received arguments |
| the model is passed through unchanged | ask for `opus`, assert the provider got `opus` |
| `temperature` forwarded only when set | present when given, `undefined` when not |
| `businessId` required | rejects, **and the provider is never called** |
| tools select the tool path | the two provider entry points, asserted by which mock fired |
| a failed call is `ok:false` with a reason | not a silent empty answer |

**Every one of these would have gone red on the M13 gateway the day it shipped.**

### The anti-vacuity probe — the M13 bug, reproduced end to end

The provider mock returns the **pre-M13B shape** (no `stop_reason`, no tokens) with a body that
parses cleanly. The gateway then reports `{hitCeiling:false, stopReason:null, outputTokens:null}` and
`outcome: 'ok'` — blind. The same logical call with the fields present reports `ok_at_ceiling`. The
pair is the point: **the assertion is sensitive to the provider's fields**, which is exactly what the
presence test it replaces could not be.

### The required mutation, run

Reverted the gateway to the blind `inspectTruncation(res)`: **red**, on
`a clipped call that still parsed is ok_at_ceiling`.

⚠️ **And it goes red for a narrower reason than expected, which is worth knowing.** After M13B the
provider returns `stop_reason` at the **top level** — which is precisely where `inspectTruncation`
looks — so the blind version still gets `hitCeiling` right and loses only the **token count**. The
gateway's reshaping is load-bearing for `usage`, not for `stop_reason`. The assertion was
strengthened to compare the whole `truncation` object rather than just `hitCeiling`, so the rail is
sensitive to the part that actually breaks. The fully-blind case is covered by the probe above,
which is the only place the pre-M13B shape still exists.

### The census — before and after, measured both times

| file | presence before | presence after | behaviour after |
|---|---|---|---|
| `gateway.test.ts` | 2 | **1** | 8 |
| `gateway-truncation.test.ts` | 8 | 8 *(re-labelled)* | 3 |
| `gateway-behaviour.test.ts` | — | **0** | **13** |
| `w1-allowlist.test.ts` | 0 | 0 | 5 |
| `cost-truth.test.ts` | 7 | 7 | 9 |
| `council-executor-silence.test.ts` | 3 | 3 | 6 |
| **under the walls** | **20** | **19** | **44** |

### ⚠️ Why 19 remain, and why deleting them would be wrong

**The decision table forbids deleting a guard to make the count go down**, and it is right to. Some
of these assertions are **structural by nature**: *"this file no longer constructs an Anthropic
client"*, *"these two call sites exist and go through the door"*, *"the allow-list holds 173
entries"*. A structural property is exactly what W1 guarantees, so a source scan is the correct
instrument — there is no return value that expresses "nothing in this file constructs a client".

What changed is that they are now **labelled** as structural and each names its behavioural
counterpart. `gateway-truncation.test.ts`'s header says it plainly: *this file says the door was
built in the right place; `gateway-behaviour.test.ts` says the door opens.* Read as a pair they are
honest. Read alone, the first was the thing that let M13's hole ship.

### Elsewhere in the repo — reported, not converted

**393 source-scanning `it()` blocks across 70 of 123 test files.** Outside the walls, and the
sprint's scope says do not convert them. That number is the size of the problem this rule exists
for; it is not a defect list, because many of those are legitimately structural too.

**Gates:** tsc 0 · vitest **123 files / 1613 tests, exit 0** · `next build` **BUILD_EXIT=0**.

---

## PHASE 5 — WHAT IT COSTS AND WHAT IT'S FOR ✅ (report)

**No code in this phase.**

### ⚠️ I DID NOT TRIGGER A LIVE RUN, AND HERE IS EXACTLY WHY AND WHAT TO CHECK INSTEAD

The sprint says *"Run it once, deliberately, and read the errors."* I could not. The council runs
behind `/api/cron/dispatch/h20`, which requires `CRON_SECRET`; triggering a production cron
unattended, and handling that secret, are both outside what an autonomous run should do. There is no
local environment for it either — the standing instruction here is Supabase MCP and pure-function
tests, not `.env.local` scripts.

**So the diagnosis below is built from the live database and the code paths, not from a run I
performed.** Everything in it is measured. The one thing only a run can give — *which* of the seven
silent agents stops where — is named at the bottom with the query that answers it, and **the next
scheduled run at 20:00 UTC tonight will answer it**, because phases 1–3 are deployed.

### What it has cost — and the ledger's own number is wrong

| | |
|---|---|
| model calls, 5 Jun → 6 Sep | **281** |
| recorded in `aria_ai_calls.cost_usd_cents` | **0 on all 281 rows → $0.00** |
| **actual cost, priced from real tokens** | **≈ US$0.20** (5c haiku + 15c sonnet) |
| tokens | 19,579 in / 16,321 out |
| calls that failed | **144 of 281 (51%)** |

**The $0.00 is not free — it is rounding.** Every individual call is worth well under one cent and
`cost_usd_cents` is an integer, so each row rounds to zero and the total is zero. The real figure is
computed with the repo's own `computeCostCentsWithCache` over the actual token counts. GROUNDING-
TEETH: the ledger's zero would have been a fabricated number to quote.

**All 144 failures are one cause**, and it is not a code fault:
`"Your credit balance is too low to access the Anthropic API"` — last seen **26 August**. The
billing outage M13B already documented on the answer-council keys. It has recovered.

### What it has produced

**2 proposals. Ever.** Both on 4 June 2026. 0 executed, 0 carrying a `council_decision`.
`council-executor.ts` has never been called. 97 sessions, 96 of them narrating steady state.

### ⚠️ THE PER-AGENT PICTURE — and a correction to my own phase 0 finding

**Phase 0 said the agents' reads go through the anon client. That is true of THREE of them, not
fourteen, and I am correcting it here rather than leaving it to be re-reported as fact.** Measured
per file:

| agent | reads with | ever reached a model | last model call | what that means |
|---|---|---|---|---|
| `bas_compliance` | admin | ✅ | **2026-09-06** | working |
| `inventory_financing` | admin | ✅ | **2026-09-06** | working |
| `reconciliation` | admin | ✅ | 2026-09-01 | working |
| `clv` | admin | ✅ | 2026-07-22 | stopped in July; has its own weekly cron |
| **`reorder`** | **anon** | ❌ never | — | **74 active products exist and it cannot see one** |
| **`pricing`** | **anon** | ❌ never | — | same client, same blindness |
| **`schedule`** | **anon** | ❌ never | — | **2 outlets and 5 active staff, invisible** |
| `customer_acquisition` | admin | ❌ never | — | reads fine — stops at its own data threshold |
| `flash_revenue` | admin | ❌ never | — | ” |
| `labour_optimisation` | admin | ❌ never | — | ” |
| `menu_engineering` | admin | ❌ never | — | ” |
| `reputation_defence` | admin | ❌ never | — | ” |
| `supplier_negotiation` | admin | ❌ never | — | ” |
| `waste_elimination` | admin | ❌ never | — | ” |

All fourteen **have** a model call site, so the ten that never logged one are returning before
reaching it. For `reorder`, `pricing` and `schedule` the cause is proven: their first line is
`if (!products?.length) return { decisions: [] }`, the read is `this.supabase` (anon), RLS is on
`pos_products` — and Sip has **74 active products, 2 outlets, 5 staff and 1,802 completed sales**.
They are not finding a quiet business; they are looking at an empty one.

### ⚠️ AND THE PART THAT AFFECTS EVERY AGENT, INCLUDING THE ELEVEN THAT CAN READ

`BaseAgent.saveDecisions` and `logRun` write with the **anon** client, all fourteen of them. So an
agent that *does* produce decisions has them **rejected by RLS and returned as `[]`** — which the
council read as "nothing to propose". That is why `agent_decisions` holds 2 rows and `agent_runs`
holds 7, all from the one day these ran from a browser with a real session.

**Phase 2 changed that: `saveDecisions` now throws with the rejection message instead of returning
`[]`.** So on tonight's run, an agent that produces decisions and cannot save them becomes a
recorded `threw` failure carrying the real Postgres error, the narrative says *"N of 14 checks did
not report"*, and the founder can read the reason. **That is the first diagnosis of this feature that
has ever been possible, and it arrives on its own tonight.**

### THE RECOMMENDATION: FIX, DO NOT RETIRE. And it is one line.

**Evidence for fixing:** the machinery is complete and correct — 14 registered agents, all with
model call sites, a chair, a conflict detector, an executor, a settings surface, and an owner who has
all nine configured agents switched on. Four agents demonstrably reach the model and answer. Nothing
here is a stub. **It has cost 20 cents in three months**, so the price of leaving it running while it
is fixed is nil.

**Evidence for what is actually broken:** one field.

```ts
// src/lib/agents/base-agent.ts:11
protected supabase = createServerSupabaseClient();   // anon key + cookies; no cookies in a cron
```

**The fix — parked here because it is an authorisation change (RULE 18), not because it is hard:**
inject the client rather than defaulting it. Service-role when a cron or the council constructs the
agent; the caller's client when a route does. Six call sites to audit:
`/api/agents/bas/draft`, `/api/agents/clv/trigger`, `/api/agents/financing/run`,
`/api/finance/generate`, `/api/cron/bas-monitor`, `/api/cron/inventory-financing`, plus the council.
**Do not simply swap it to `supabaseAdmin`** — that would make every agent bypass RLS inside
user-facing routes, which is a real security change and the reason this is parked rather than done.

**Retiring it would be the wrong call on this evidence.** A feature that has never worked because of
one mis-wired client is not a feature nobody wants; it is a feature nobody has seen.

### What to check after tonight's 20:00 UTC run

```sql
-- the narrative the owner will read, and the health block behind it
select session_date, plan_narrative,
       plan->'agent_health'->>'agents_reported' as reported,
       plan->'agent_health'->>'agents_failed'   as failed,
       plan->'agent_health'->'failures'         as failures
from agent_council_sessions
where business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
order by session_date desc limit 3;

-- per-agent reasons, written by the council on the agents' behalf
select agent_type, triggered_by, errors, started_at
from agent_runs
where business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  and started_at > now() - interval '2 days'
order by started_at desc;
```

**If tonight's narrative reads "All 14 overnight checks reported and nothing needs you today", that
is still not the truth** — it means every agent returned an empty result without failing, which for
`reorder`, `pricing` and `schedule` is the RLS blindness above. The health block will say
`agents_failed: 0`, and *that* is the tell. The narrative can now express the difference; the client
fix is what makes it able to see it.
