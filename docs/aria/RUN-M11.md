# RUN-M11 · ARIA WORKS (part 1)

Started 3 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still
leaves a readable log.

---

## PHASE 0 — THE REGISTER AS FOUND

Read before anything was written: `ASK-ARIA-OPEN-BUGS.md`, `RUN-S9.md`, `RUN-S10.md`,
`docs/aria/ARIA-MEGA-SPRINT-INDEX.md`.

**Register state, as the file itself now reports it: 4 open · 6 parked · 13 closed or delisted.**

| # | state | one line |
|---|---|---|
| 3 | **OPEN** | the accuracy verifier has run once in three months — the council path returns first. A design decision, deliberately not guessed at. |
| 5 | PARKED (DDL) | `aria_message_feedback` does not exist, so there is no thumbs and no eval set accumulating. |
| 14 | **OPEN** | 10 logins / 15 min is too tight for CI's push cadence. Product-side fix is authorisation → founder's. |
| 15 | **OPEN** | an Upstash outage locks every owner out of login. Fail-open/closed is one global default, not per route. |
| 16 | **OPEN** | `cron_runs` has no watcher and the `[rate-limit] FATAL` has no consumer. |
| 17 | **OPEN** | POS product grid did not render for the smoke suite; needs the failure screenshot, not a hunch. |
| 2, 6-half, 12 | parked/founder | the credit outage (resolved by the founder), approve-reject + email-a-deliverable on `/classic`, the CI credential. |

Nothing in this sprint contradicts the register, and nothing in the register blocks it.

**Index cross-check, used only to avoid building someone else's sprint:** M12 owns cloud execution,
live progress, scheduled recurring work and cost transparency; M13 owns sub-agents, interrupt/steer
and the overnight agent; M15 owns the artifact/deliverable pipeline; M17 owns artifacts/canvas;
M18–M19 own the agent builder. **M120 is `TS-DEFECT-1` and M121 is `TS-1-REST`** — the two things
the previous run left open already have sprints of their own, so neither is picked up here.

---

## PHASE 1 — A REFRESH MUST NOT LOSE THE CONVERSATION ✅

**Commit:** `<phase-1>` · **files:** `src/lib/aria/thread-session.ts` (new, 148),
`src/lib/aria/thread-refresh.test.ts` (new, 29 tests), `src/components/ask-aria-ax/AskAriaTransition.tsx`
(+70/−3).

### What was losing the thread on refresh

**Nothing was losing it. Nothing was ever carrying it.**

`AskAriaTransition` held the open conversation in `useState` and nowhere else
(`AskAriaTransition.tsx:109`). React state does not survive a reload, so on F5 `conversationId`
came back `null`, `working` came back `false`, and the owner landed on the welcome screen. The
conversation itself was never at risk: `aria_conversations` had every message, `/api/aria/ask/history?id=&messages=true`
could hand it back with provenance intact (S3), and the Threads panel could reopen it in one click.
What was missing was the thread's **identity** — the page had no way of knowing what it had been
showing a second earlier.

**This is the M8 shape the sprint predicted, inverted.** M8 found a deep link passing a *display
string* where a record reference was needed. Here there was no reference of any kind to pass.

**Checked before adding one, as instructed:** no conversation-id URL parameter existed on either
surface. `/dashboard/ask-aria` reads exactly one query key, `q` (`:401`), and `/classic` reads the
same one and only that (`classic/page.tsx:548`).

### The fix

The thread id rides in the URL as `?c=<uuid>`, written at the three moments a thread starts or
stops being open, and read once on mount:

| moment | what happens |
|---|---|
| the Threads panel opens a thread | `syncThreadUrl(id)` inside `openThread` |
| the first answer creates a thread | `syncThreadUrl(result.conversation_id)`, beside `adoptDraft` |
| New chat | `syncThreadUrl(null)` — leaving must clear it, or the next refresh reopens what the owner stepped out of |
| **mount with `?c=`** | enter WORKING immediately, fetch, restore **through the same `openThread`** |

Three properties worth naming, because each forecloses a bug rather than adding a feature:

1. **`threadSearch` deletes `q` when it writes `c`.** `?q=` auto-sends on load (S5 phase 4). A
   conversation started from a briefing link would otherwise re-ask its question, and bill for it,
   on every refresh — the "a reload repeats an action" class M4 fixed on the send path. The `?q=`
   effect carries a second lock: a URL with both present restores and sends nothing.
2. **`replaceState`, never `pushState`.** A push per send would put one history entry per message
   behind the owner, and Back would walk backwards through a conversation they never left.
3. **WORKING is entered before the fetch resolves.** Waiting would show the welcome screen for the
   length of a round trip and then snap away — a flash of the exact wrong state.

**A restore that fails lands on welcome and drops the stale id.** `/api/aria/ask/history` answers
`{conversation: null}` for a thread that is deleted, another business's, or absent — the route's
own business filter and tombstone filter, unchanged — and every one of those is an ordinary thing
to click, not an error to shout about. Offline, 401, 500 and a thread with zero messages take the
same path.

**Scroll position** is remembered per thread in `sessionStorage` and applied once on restore, then
released so a live conversation is always pulled to its newest turn. It is not recorded while a
reply is streaming: the view is being dragged to the newest token then, and recording that would
remember the machine's position rather than the owner's. No memory → the bottom, which is the
existing behaviour and the right default.

**Nothing new is stored server-side and no route changed.** No new endpoint, no second store, no
authorisation change: a conversation id is not a capability, and the one route involved already
filtered every read by the caller's own `business_id`.

### Sibling sweep

Searched for every component holding a conversation id in React state alone: **9 hits, 5 of them
genuinely the same shape.**

| file | verdict |
|---|---|
| `ask-aria-ax/AskAriaTransition.tsx` | **fixed** — the default surface, the one the sprint observed |
| `ask-aria/classic/page.tsx:488` | **same defect, NOT fixed** — see below |
| `components/AriaFloatingPanel.tsx:92` | not a defect: a floating panel has no URL of its own to carry |
| `in-store/[business_id]/KioskClient.tsx:104` | different product (customer kiosk); a shared URL there would hand one customer another's session |
| `owner/[slug]/aria/page.tsx:36` | different surface, out of domain |
| `community/dm/[businessId]`, `website-chat/conversations`, `ThreadsPanel` ×2 | not conversation identity (thread list state, expanded-row state) |

**`/classic` carries the identical defect and is deliberately left alone.** It is retained (RULE 0)
and still uniquely holds approve/reject and email-a-deliverable, so it is reachable and an owner
can be on it. It is a different file with its own `loadConversation`, and fixing it is a second
change to a second surface inside a phase whose scope is the default one. **Listed, not taken** —
standing table: fix what is in the declared domain, list the rest.

### Mutation check

Replaced `const id = readThreadId(window.location.search)` with `const id: string | null = null` in
the real file — the defect, restored exactly.

```
MUTATED: the reload no longer reads the thread identity
 FAIL  src/lib/aria/thread-refresh.test.ts > MUTATION PROBE — dropping the thread identity on reload is detectable
 Test Files  1 failed (1)
      Tests  2 failed | 27 passed (29)
```

Reverted; 29/29 green. **It goes red, and it goes red on the right two assertions** — the mutation
probe and the rail that says the restore exists.

### Gates

`tsc --noEmit` (8 GB heap) **0** · `npx next build` **BUILD_EXIT=0 read from build.log:1963** ·
`vitest` **103 files / 1327 tests, exit 0**.

⚠️ **One cold vitest run failed 3 tests and I could not reproduce it.** The run immediately after
the 8 GB `tsc` reported `3 failed | 1324 passed` at 63 s wall / 103 s import — the only failure text
I captured was `src/lib/aria/agents/tier-caps.test.ts:70`. Three subsequent full runs and three
isolated runs of that file are all green. Recorded as an **unexplained flake under memory pressure**,
not dismissed: the other two files were never identified.

### NOT done, and why

- **The browser reload itself was never pressed.** This repo's vitest runner is `environment: 'node'`
  with no `@testing-library/react`, and adding one is a dependency change — the exact move that
  killed CI for three days in August. The Playwright smoke suite could do it but needs a login.
  **The mechanism is proven; the gesture is not.** See "what needs a person" at the end of this log.
- `?context=` and `?topic=` — **two dead deep links found in the sweep** and not fixed. See below.

### Discovered — two dead deep links, reported not fixed

`intelligence/page.tsx:527` links to `/dashboard/ask-aria?context=…` and
`dashboard/AriaSays.tsx:180` links to `/dashboard/ask-aria?topic=…`. **Neither parameter is read by
any surface** — not `/dashboard/ask-aria`, not `/classic`. Both land on a blank composer and the
owner's intent is dropped silently: failure pattern #1, and precisely what S5 phase 4 fixed for
`?q=`. Not fixed here because what they should *do* (auto-send? pre-fill? scope the answer?) is a
product decision, not a repair, and inventing one would be inventing scope.

---

## PHASE 2 — CAN A PLAN LIVE IN THE EXISTING TABLES? ⚠️ PARTLY — DDL PROPOSED, THREAD PARKED

**Commit:** `<phase-2>` · **no code.** `docs/aria/M11-PHASE-2-PLAN-STORAGE.md` (the answer, with
evidence) and `docs/aria/M11-MIGRATION-PROPOSAL.sql` (the DDL, **not applied, not in
`supabase/migrations/`**).

### The answer

**The steps can. The plan cannot, and the order cannot.**

`aria_autopilot_actions` is the right step registry and must stay the only one. Its
`status` CHECK — `pending | approved | rejected | executed | dismissed | expired | superseded` — is a
better step vocabulary than anything a new table would invent, and `requires_stepup`,
`amount_cents`, `expires_at`, `superseded_by`, `outcome_note` and `resolved_by/at` are all already
there and already used.

**Two things have nowhere to live, and only two:**

1. **An order.** There is no ordinal column on any candidate table. Ordering by `created_at` breaks
   silently the moment anyone batches the insert (`now()` is the transaction timestamp — identical
   for every row in one statement) and cannot express a re-ordered plan; a `step_index` inside
   `action_data` jsonb is the smuggling the sprint forbids by name. Neither is taken.
2. **The owner's request, the conversation it came from, and the plan's own state.**

**`proposal_id` is not the grouping the sprint hoped for.** It is a `uuid` with **no FK, no index,
and NULL on all 817 rows** — never written successfully, so it groups nothing and never has.

### Three live findings the phase turned up

- ⚠️ **`council-executor.ts:17`'s audit insert has never landed.** It writes `proposal_id`,
  `outcome_data`, `executed_at` and `status:'executed'` on every executed proposal. Live: those
  three columns are non-null on **0 of 817 rows**. Its error is never read — `await
  supabase.insert()` inside a `try` that only catches throws. RULE 7 exactly.
- ⚠️ **Every row that says `executed` has a NULL `executed_at`** — 5 of 5. The column recording
  *when* something ran is empty on 100% of the rows claiming to have run.
- ⚠️ **91 of 92 `agent_council_sessions` produced zero proposals; 2 proposals exist in total; 0
  have ever executed; all 92 are marked `completed`.** It runs nightly (latest 1 Sep) and completes
  with nothing in it. This pair is a genuine plan/step split the sprint did not mention — and it is
  dead, and it is the wrong shape anyway (keyed on `session_date`, no owner request, no
  conversation link, and `council_decision` is the council's verdict rather than the owner's
  approval).

Also: **`aria_actions` has no status CHECK at all** and `'completed'` is legal there, while
`aria_autopilot_actions` rejects it — very likely the whole origin of TS-DEFECT-1/M120, and carried
forward to that sprint rather than fixed here.

### What already existed that the sprint did not mention

**`/api/aria/plan` exists** — 224 lines, `preview` / `save` / `execute` / `undo`, called from the
daily briefing in four places. So does `buildPlan()` returning `steps: string[]`, `executeProposal()`
with a real switch over action types, and `action-executor.ts` / `action-rollback.ts` writing
`aria_action_log` — **64 real rows of executed, reversible actions on real data**, the decision
table's "record how to undo it", already built.

**The difference is the point.** `RadarPlan.steps` is display prose; the whole plan executes as ONE
`action_type`. No per-step status, no per-step approval, no per-step outcome, and it is fired by a
detector rather than by an owner describing an outcome. **The loop's shape exists for a single
action. M11 is that loop for a multi-step plan from a request** — an extension, not a second thing.

### What this parks

| phase | depends on the parked DDL? | outcome |
|---|---|---|
| 3 — the plan | **No** — the plan is shown *before* anything runs | **BUILD** |
| 4 — execute | **Yes** — idempotency needs a step record with an id to claim, and there is no unique index that could stand in | **PARKED, chain** |
| 5 — the report | **Yes** for real data; the renderer itself is a pure function of recorded outcomes | **PARTIAL** |
| 6 — history | **Yes** — reopening a job needs the job to exist | **PARKED, chain** |

Standing table, applied literally: *"They genuinely cannot → propose the DDL and PARK that thread.
Build what does not depend on it."*

### NOT done, and why

- **No DDL was applied and no file was written to `supabase/migrations/`.** RULE 10a.
- **Per-job cost has no honest source.** `aria_ai_calls` has **no** linking column — no
  `conversation_id`, `request_id` or `trace_id` (confirmed by querying its columns). 11,029 rows
  carry `cost_usd_cents` and none can be attributed to a job except by a time window, which would
  be a fabricated number. Proposed as a separate optional column; until it exists a job's cost
  renders **unknown**, never 0.

### Gates

**No source file changed in this commit**, so phase 1's gate result stands unchanged: tsc 0, build
`BUILD_EXIT=0`, vitest 103/1327. The pre-push hook re-ran tsc and the unit suite on the push.

---

## PHASE 3 — THE PLAN ✅

**Commit:** `<phase-3>` · `src/lib/aria/works/capabilities.ts` (new), `src/lib/aria/works/plan.ts`
(new), `src/lib/aria/works/plan.test.ts` (new, 29 tests), `src/app/api/aria/works/plan/route.ts`
(new), `src/lib/aria/model-router.ts` (+1 task), `src/lib/aria/jobs.ts` (+1 mapping),
`src/lib/aria/jobs.test.ts` (amended, see below), `scripts/ai-cost-model.json` (+1 entry).

### The shape

The owner describes an outcome. `buildWorkPlan` returns ordered steps in plain English, each saying
what it will do and whether it needs the owner — or says the request **cannot be planned**, which is
a first-class answer rather than a failure. Nothing runs; nothing is written.

**THE ONE PROPERTY EVERYTHING RESTS ON: the model picks a capability id, and the REGISTRY decides
everything else.** Gate, "needs approval", reversibility, "Aria may not do this" — all by lookup in
`CAPABILITIES`. A model that returns `{"gate":"auto"}` on a price change is ignored, because the
field is never read. A model that invents `send_sms_campaign` produces a step marked NEEDS A PERSON,
because the lookup returns null. This is what makes prompt injection in a review, a supplier note or
a customer name unable to talk a plan into executing anything — and it is asserted from both
directions in the tests.

The prompt is checked to **not leak the gates to the model at all**, asserted as an exact
reconstruction of the menu rather than a keyword scan (`approve` is a substring of the real id
`approve_po_draft`, so a keyword scan would either false-positive or be loosened until it proved
nothing — my first attempt did exactly that and failed).

### The capabilities are not invented

**11 writes = exactly `PlannedAction['type']`**, every one of which already has a working branch in
`executeAction` — which has its own kill switch, role gate, mass-mutation backstop and append-only
audit. The registry adds **no new power**; it describes what exists and says what a plan may do with
it. A test reads `action-executor.ts` and fails if the two sets differ, and another reads every
capability's named module and fails if the function is not in it. **A capability cannot be added by
describing it.**

**4 reads**, each naming a real exported function (`getRevenueSnapshot`, `getRevenueForRange`,
`getRevenueComparison`, `detectLosses`).

| gate | capabilities | meaning |
|---|---|---|
| `auto` | 4 reads · `adjust_stock` · `set_low_stock_threshold` | safe and reversible; a runner may do it once the plan is approved |
| `approve` | `mark_products` | in the executor's own DESTRUCTIVE set; approving "the plan" is not enough |
| `propose_only` | `bulk_price_update` · `apply_category_discount` · `create_promotion` · `update_promotion` · `create_invoice` · `approve_po_draft` · `create_roster` · `create_agent` | **money, sending or authorisation. Proposed and never carried out by a plan.** |

`create_roster` is `propose_only` on authorisation grounds — publishing a roster tells people to
turn up. TS-1 phase 4 reached the same conclusion from the other direction.

### Provenance

Step detail goes through **`segmentFigures`, the same segmenter the answers use, fed the same
`ProvenanceInput` the turn produced.** A step resting on a grounded number renders it verified; a
step resting on an ungrounded one renders it plain. No second notion of "verified" was invented, and
a test asserts the module never sets a tier itself.

**Found while testing:** `FIGURE_RE` matches currency and percentages only, so a bare `1204.50` is
not a figure at all and carries no tier. That is deliberate and correct — but it means dropping the
`A$` from a step silently loses the tier with it, so an assertion now pins it.

### Cost — RULE 11

`scripts/ai-cost-model.json` gains `m11_work_plan`. Recomputed with `npx tsx scripts/ai-cost-model.ts`:

```
BEFORE   AI as-is $0.4508/biz/day   ·  total COGS $0.61/day  $18.31/mo
AFTER    AI as-is $0.4622/biz/day   ·  total COGS $0.62/day  $18.65/mo
DELTA    +$0.0114 per business per day
```

One call per plan, owner-initiated only — no cron, no retry, no fan-out. ~1,800 in / ~400 out.

> ⚠️ **THE RATE IS A PROXY AND I DID NOT ADD ONE.** `work_plan` is a judgement task, so `jobs.ts`
> routes it to `claude-sonnet-4-6` — and **`claude-sonnet-4-6` is not a key in `cost.ts` PRICING.**
> The $3/$15 above is the sonnet-4-5 rate, taken on the authority of PRICING's own comment
> ("Anthropic — 4.5 / 4.6 / 4.7 generation share the same rates within tier"). **No rate was
> invented and none was added**: MS15 phase 1 requires a founder-verified rate for anything entering
> that table, and a rate is a money number. Until the key exists, `computeCostCentsOrNull` records
> these calls as **null (unknown), not 0 (free)** — the correct behaviour, and also why this estimate
> cannot yet be replaced by measurement. **This is a pre-existing gap, and phase 3 is the first
> thing that would exercise it** — see the discovered section.

### The superseded test, rewritten not deleted

Adding an `AriaTask` turned `jobs.test.ts` red on exactly the two assertions it should have, and no
others:

```
× work_plan resolves to exactly the model it used before
× the judgement set is exactly the old SMART_TASKS set
Tests  2 failed | 21 passed (23)
```

Those said "not one model choice changed" and compared **every** task to the pre-MS15 ternary — a
property that can only ever be asserted of the tasks that existed then, so in its original form it
would fail for every future task purely for being new. Rewritten to assert the MS15 property in full
over exactly those fourteen tasks, **plus** a new half: anything added since must be declared in
`ADDED_SINCE_MS15` with its job, so a new task cannot quietly join the judgement set — the most
expensive one — without that being a line in the test file. Two assertions added: an anti-vacuity
floor (the MS15 set must still be ≥14 and larger than the additions, so the guard cannot be hollowed
out by growing the exception list) and a check that each declared job matches what the code does.
**Nothing was deleted and nothing was weakened**; the reason is written in the file.

### Mutation check

`markFor` mutated so a NEEDS-A-PERSON step renders as "Aria can do this" — the sprint's named
mutation, in the real file:

```
MUTATED: a step needing a person now renders unmarked, as if Aria will do it
 × every step that Aria may not carry out carries a mark
 × MUTATION — an unexecutable step rendered unmarked makes this suite RED
Tests  2 failed | 27 passed (29)
```

Reverted; 29/29.

### Gates

tsc **0** · vitest **104 files / 1358 tests, exit 0** · `next build` **BUILD_EXIT=0**, read from
`build.log:1964`.

And the route is genuinely in the build, as a dynamic function rather than a prerendered page —
which is the S9 finding #11 concern (`force-dynamic` missing on a session-reading route wrote 2,272
false failure rows over three months). Observed, not assumed:

```
build.log:583   ├ ƒ /api/aria/works/plan          0 B    0 B
```

### NOT done, and why

- **No surface calls the route.** `/api/aria/works/plan` exists, is authorised and returns a plan;
  nothing in the product links to it. Deliberate: approve/execute/report/history are parked on the
  phase 2 DDL, and putting a plan in front of an owner who then cannot approve or run it is a worse
  experience than not offering it. Wiring it into the composer means deciding, on every turn,
  whether a message is a delegation or a question — a change to every answer, unattended. **Called
  out here rather than buried, because "exists, looks correct, does nothing" is this repo's #1
  failure pattern and this is one commit away from being an instance of it.**
- **The planner has never been run against a live model.** Every test drives `assemblePlan` with
  hand-written model output. The model call itself, and therefore the quality of a real plan, is
  unverified — see "what needs a person".
- No `ask/route.ts` change, no UI, no persistence, no execution.

### Discovered

- ⚠️ **`claude-sonnet-4-6` has no rate in `cost.ts` PRICING**, and `UNPRICED_MODELS_SEEN` does not
  list it — reasonably, because it has **0 calls in the last 30 days** and MS15 could only list what
  it had seen. Which is the second finding: **the current judgement model has never been called.**
  All four judgement tasks (`reorder_plan`, `profit_leak`, `supplier_risk`, `explain`) route to it
  through `runAriaModel`, and 30 days of `aria_ai_calls` contain zero rows for that model id. Either
  those tasks are not being invoked, or they are not going through the router. **Not chased here** —
  it is a measurement, not a repair, and it belongs with the cost sprint.
- 30-day model census, for whoever picks that up: haiku 1,761 · gemini-2.5-flash 1,388 ·
  **`model_id` NULL 792** · gpt-4o-mini 130 · sonnet-4-5 107 · literal `'unknown'` 54.
