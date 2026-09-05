# RUN-M13 · THE FIRST TWO WALLS

**6 September 2026 · autonomous run, RULE 20 · seven phases, seven commits, one park. All pushed.**

**Both walls stand.** No new file in Aria can call a model without the gateway, and no new Supabase
write can fail silently. That is the first day those two things have been true.

## THE THREE THINGS YOU MOST NEED TO KNOW

**1. ⚠️ The audit file does not exist in this repo.** `docs/aria/ARIA-ARCHITECTURE-AUDIT.md` is not
there — searched by name, by pattern, and through `docs/aria/`, `docs/reports/` and the root. It may
live outside the repo. So every number was re-measured. **The big ones are exact** — `new Anthropic(`
**171**, `.messages.create` **162**, `nano.ts` **60 lines**, **13** empty catches, **2,275** false
cron failures, **0 of 854** rows with a `proposal_id`. Three drifted, all reported in place.

**2. The W6 backlog is 4,512, not 82.** The audit counted *`catch` shapes*; the defect it describes
is the **unread result**, and that is everywhere — 3,307 unread destructures + 1,205 discarded write
results across 1,267 files. **The set that matters is the writes: ~1,262 writes whose error is never
read.** None of it blocks anything: only new diff lines are scanned.

**3. ⚠️ The headline example is a dead code path, not a swallowed error — and my own RUN-M11 said
otherwise.** "819/819 audit inserts never landed" reads like a rejected write. Attempting that exact
insert against production **succeeds**. `executeProposal` has simply **never run**: 2 proposals ever,
0 executed, 0 decisions, and `aria_campaigns` empty. The unread error is real and is fixed — as a
*latent* defect. A row count is evidence of a shape, not of a cause.

## THE TWO WALLS

| | W6 · read-the-error | W1 · one model gateway |
|---|---|---|
| **the door** | — | `callModel()` in `src/lib/ai/gateway.ts` |
| **the guard** | `supabase-error-not-read` + `supabase-write-result-discarded` | `model-call-outside-gateway` |
| **where** | `canon-rail-guard.ts` — already in the pre-push hook **and** CI |
| **grandfathered** | 4,512 (by diff-scan, no list needed) | **177 → 176**, by explicit list |
| **red/green proven** | ✅ both directions, probe removed | ✅ both directions, probe removed |

**Both guards were proven to fail in both directions by observation**, not reasoning. The W1 probe
that matters used `.messages.create(` — MS15's older rule 8 is **silent** on that, which is what
proves the new rule is not redundant.

## THE GATEWAY'S SIGNATURE

```ts
callModel<T>(req, fallback?) → { ok, data, raw, cost_cents, latency_ms, provider,
                                 tool_calls, iterations, outcome, success, thinking_tokens }
req = { businessId /* REQUIRED */, agentKey, role, model /* passed through UNCHANGED */,
        systemPrompt, userPrompt, maxTokens, tools?, executeTool?, priorMessages?, … }
```

`businessId` **throws if absent** — never defaulted, because a default id is a fabricated
attribution. That is the precondition the provider gates its `aria_ai_calls` insert on, and omitting
it is exactly how `intent_classifier` ran twice a turn across 412 turns with **zero** rows.
**Verified live: 2 calls → 2 rows, right tokens.**

## WHICH SILENT FAILURES ARE NOW LOUD

Four writes in `council-executor.ts` (three used `.then(onOk, onErr)` with two empty bodies —
discarding success *and* failure on purpose) and five app-code catches: an order-status update that
left the screen showing an order the kitchen had no record of, a POS settings save that showed the
operator *nothing*, a customer-facing order poll that froze silently, and two cosmetic ones. **Eight
`layout.tsx` catches were deliberately left** — they guard `serviceWorker`/`caches`/`sessionStorage`
in an inline browser script and are not database calls at all.

## WHAT NEEDS A PERSON

1. ⚠️ **`lib/aria/council.ts` is parked** — 1,391 lines, its own backoff and streaming, four
   importers including `ask/route.ts`. Migrating it needs the gateway to grow a retry contract
   first. Doing it at the end of a seven-phase run on the hero answer path is how a wall becomes an
   outage.
2. **Two UI decisions I did not take.** `online-orders` still leaves its optimistic update in place
   after a failed write; `SettingsTab` still shows nothing on a failed save. Logging made them
   visible, not correct.
3. **The two councils should be renamed, not merged.** Different jobs, identical import lines. And
   `agents/council.ts` is **alive and produces nothing** — 95 sessions, 2 proposals ever, 0 executed.
4. **The W6 backlog needs a migration sprint** — ~1,262 writes, concentrated in `src/app/api` (3,504
   of the 4,512).

## MY OWN ERRORS THIS RUN

Four, each caught by a guard or an assertion and recorded where it happened:

- A patch script asserted "expected 2 swallows, found 5" — the extra three were **my own comments**
  quoting the pattern.
- The allow-list parser closed on the first `]` and read **82 of 177** entries — Next.js route
  segments put brackets inside paths.
- I asserted `providers/gemini.ts` was on the list; it calls the Gemini REST API directly and never
  matched.
- The gateway classified a prose reply of `"OK"` as **`unparseable`** — found by running it, not by
  reading it.

And once the rail caught me: the pre-push hook blocked my own push because my test file quotes the
pattern its rule blocks. **The literal was split; the guard was not loosened** — the decision table's
instruction exactly.

| phase | outcome | commit |
|---|---|---|
| 0 · gate | audit absent; numbers re-measured | — |
| 1 · W6 rule | ✅ backlog 4,512 | `ca808965` |
| 2 · W6 fixes | ✅ 9 writes, 5 catches | `8140feca` |
| 3 · the gateway | ✅ one row per call, live | `1f0e0492` |
| 4 · the W1 guard | ✅ both directions | `f0c5edb5` + `4ae77cba` |
| 5 · migrate | ✅ 5 sites · 177 → 176 · 1 parked | `04745948` |
| 6 · two councils | ✅ report | `04745948` |

---

Written incrementally as the run went — a halted run still leaves a readable log.

---

## PHASE 0 — GATE

### ⚠️ THE AUDIT FILE DOES NOT EXIST IN THIS REPO

`docs/aria/ARIA-ARCHITECTURE-AUDIT.md` — **not found**, anywhere. Searched by name, by pattern
(`*ARCHITECTURE*AUDIT*`, `*ARIA-ARCH*`), and through `docs/aria/`, `docs/reports/` and the repo root.
The nearest relative is `docs/reports/ARIA-ARCHAEOLOGY-1-REPORT.md`, which is where the 9–15% versus
73–78% adoption figures the brief quotes actually live.

It may exist outside the repo. **Every number in the brief was therefore re-measured from the code
and the live database rather than read**, which the brief asked for anyway.

### Re-measured — what matched, and what drifted

| claim | audit | measured 6 Sep | verdict |
|---|---|---|---|
| `new Anthropic(` files | 171 | **171** | ✅ exact |
| `.messages.create` files | 162 | **162** | ✅ exact |
| `src/lib/ai/` = one 60-line file | 60 | **`nano.ts`, 60 lines** | ✅ exact |
| empty catches | 13 | **13** (all non-test) | ✅ exact |
| `aria_autopilot_actions` rows with `proposal_id` | 0 of 819 | **0 of 854** | ✅ still zero |
| council sessions marked complete | 93 | **95, all of them** | ✅ (2 more since) |
| council proposals, ever | 2 | **2** | ✅ exact |
| false `nightly-sync` failure rows | 2,275 | **2,275** | ✅ exact, frozen (96 completed) |
| provider abstraction used by | 4 files | **13 files** | ⚠️ **drift** |
| cost logged per-caller | 91 files | **94 files** | ⚠️ minor drift |
| catch-return-default | 69 | **124 non-test** | ⚠️ **definition differs** |

**The two drifts, honestly:**

- **13 importers of `providers/anthropic`, not 4** — counted as real `import … from '…providers/anthropic'`
  statements, not substring hits. The list is in the phase 3 section. M12 did not add any of them.
- **124 catch-return-defaults, not 69** — my pattern includes `true`, `undefined` and `{}` as
  defaults, which the audit's evidently did not. Neither number is wrong; they count different sets.
  **This one turned out not to matter** — see phase 1.

---

## PHASE 1 — W6: THE READ-THE-ERROR RULE ✅

**Commit:** `ca808965` · `scripts/canon-rail-guard.ts` (+2 rules, +1 allow-list, +remediation text).

### Built into the existing rail, not beside it

Two new rules in `canon-rail-guard.ts`, which already runs in the **pre-push hook and CI**, already
scans **only new diff lines**, and already grandfathers by that mechanism. Adding a tenth rule to the
wall that exists beat standing up a second one.

| rule | catches |
|---|---|
| `supabase-error-not-read` | `const { data } = await supabase…` — a destructure that takes `data` and drops `error` |
| `supabase-write-result-discarded` | `await supabase.from(…).insert(…)` as a **statement** — the result assigned to nothing |

**Both halves matter, and the brief was right that the second is the real one:** *the bug is the
unread result, not the missing try.* `council-executor.ts:17` and `recordEvent` before M11B are both
the second shape exactly.

### ⚠️ THE BACKLOG IS 4,512, NOT 82

The audit counted **`catch` shapes** — 13 empty + 69 returning a default. The defect the brief
actually describes is the **unread result**, and that is everywhere:

```
total violations : 4512      across files : 1267
  supabase-error-not-read            3307
  supabase-write-result-discarded    1205

BY DIRECTORY (top 8)
  src/app/api          3504        src/lib             67
  src/lib/aria          220        src/lib/pos         55
  src/lib/agents        199        src/lib/community   46
  src/lib/loyalty        90        src/lib/integrations 46
  src/lib/inventory      70        …37 more dirs        78
```

**Composition of the 3,307 destructures — so the number is not read as 4,512 bugs:**

```
  read (select/from)                                       1969
  other / continues on the next line                       1270
  WRITE (insert/update/upsert/delete) — the dangerous half    57
  rpc                                                         7
  auth (getUser/getSession)                                   4
```

**The genuinely dangerous set is the writes: 1,205 discarded write results + 57 single-line write
destructures ≈ 1,262 writes whose error is never read.** That is the migration backlog that matters,
and it is two orders of magnitude larger than the brief's 82.

None of it blocks anything: only new diff lines are scanned, so all 4,512 are grandfathered exactly
as every earlier rule grandfathers its predecessors.

### The allow-list is deliberately tiny

Three entries, and none of them is a caller: generated types, and the two Supabase client factories
which construct the client rather than querying with it. **A file added here is a file allowed to
fail silently.**

### VERIFY — both directions, observed

```
RED   — src/lib/w6-probe.ts:3  [supabase-error-not-read]
        src/lib/w6-probe.ts:7  [supabase-write-result-discarded]

GREEN — the same file with `const { data, error } = …` and `if (error) console.error(…)`
        [canon-rail-guard] no new canonical-path violations introduced. Pass.
```

The probe was removed and the tree reset. The rule was re-proven after a null-safety fix, so the
green above is not a green that came from the rule silently failing to run.

---

## PHASE 2 — W6: FIX THE FIVE THAT ALREADY COST YOU ✅

**Commit:** `8140feca` · `council-executor.ts` (4 writes), `OrderTrackingClient.tsx`,
`SettingsTab.tsx`, `online-orders/page.tsx` (×3), `council-executor-silence.test.ts` (new, 9 tests).

### ⚠️ THE HEADLINE EXAMPLE HAS A DIFFERENT CAUSE — AND I GOT IT WRONG TOO

The brief lists *"819/819 audit inserts never landed"* as a read-the-error failure. **My own
`RUN-M11.md` said the same thing**, in those words.

**It is wrong.** Attempting that exact insert against production inside a rolled-back `DO` block
**succeeds** — the database accepts it. What is actually true, measured beside it:

```
agent_council_proposals   2 rows ever · 0 executed · 0 with a council_decision
aria_campaigns            0 rows            (the sibling write in the same file)
aria_autopilot_actions    0 with outcome_data · 0 with executed_at · 0 with proposal_id
```

**`executeProposal` has never run in production.** The column is empty because the function was
never called, not because the write was rejected. Don't-guess applies to a row count as much as to a
model: 0-of-854 looks like a failing write and is a dead code path.

The unread error is still real and is fixed — but it is a **latent** defect, and the day the executor
first runs is precisely the day nobody would notice it failing.

### Four writes in `council-executor.ts`, all now reading their error

Three of them used `.then(onOk, onErr)` with **two empty bodies** — discarding success *and* failure
on purpose. Each records something the owner is told has been queued:

| write | what a lost row means |
|---|---|
| `aria_autopilot_actions` (the audit) | no record that a proposal executed |
| `aria_campaigns` | the campaign is reported queued and is not queued |
| `labour_optimisation_actions` | a staff SMS is reported queued and is not queued |
| `review_requests` | a review request is reported queued and is not queued |

**Nothing became fatal.** Every fix logs and continues — a write failure must not start throwing out
of an executor that is midway through real changes. A test asserts none of them `throw` or `return`
on error.

### The 13 empty catches, read one at a time — 5 fixed, 8 correctly left

**Not 13 database bugs.** Reading each:

- **8 in `layout.tsx`** — inside an inline browser `<script>`, guarding `serviceWorker`, `caches`
  and `sessionStorage`: APIs that legitimately do not exist in some browsers, where a throw is the
  expected control flow. **Not Supabase, not app code.** Counting them as W6 violations was the
  audit conflating "empty catch" with "unread database error". Left alone, and a test asserts the
  file contains no database call at all — the property that makes leaving them correct.
- **5 in app code — all now log, none changed behaviour:**

| file | cost of the silence |
|---|---|
| `online-orders:248` — order status update | **the costly one.** Local state is updated optimistically; on a failed write the screen shows an order as accepted that the kitchen has no record of |
| `SettingsTab:63` — POS settings save | a failed save showed the operator **nothing** — no error, and no "Saved" either, indistinguishable from not having pressed the button |
| `OrderTrackingClient:225` — order poll | a **customer** watching their order sees the page freeze on the last known state, and nobody is told |
| `online-orders:228` — new-order badge/beep | cosmetic; still logs, because silence is never correct even when the cost is small |
| `online-orders:82` — the beep itself | autoplay policy makes this throw legitimately; `console.warn`, stays non-fatal |

⚠️ **Two of these need a product decision I did not take.** Logging stops the failure being
invisible; it does not fix the *UI*. `online-orders` still leaves the optimistic update in place
after a failed write, and `SettingsTab` still shows nothing at all. Both are user-facing behaviour
changes — **named here rather than taken.**

### Mutation check

Re-silencing the audit insert (`const { error: auditErr } = …` → bare `await`) is detectable, and
the **W6 rail added in phase 1 would now catch it as a new violation** — the rule exists for exactly
this shape.

### A measurement error of my own, caught by an assertion

My first patch script asserted "expected 2 remaining swallows, found 5" and stopped. The extra three
were **the literal appearing inside comments I had just written** describing what was removed. The
assert did its job; the fix was to stop putting the pattern in prose. Same class as the M12 test that
matched its own comment — third time this run.

---

## PHASE 3 — W1: THE GATEWAY  *(the sprint)* [OK]

**Commit:** `1f0e0492` · `src/lib/ai/gateway.ts` (new), `src/lib/ai/gateway.test.ts` (new, 9 tests).

### The one call signature

```ts
callModel<T>(req: AriaModelRequest, fallback?: T): Promise<AriaModelResult<T>>

AriaModelRequest = {
  businessId   // REQUIRED — not optional, and that is the point
  agentKey, role, model            // model is passed through UNCHANGED
  systemPrompt, userPrompt, maxTokens, requestSummary
  tools?, executeTool?, priorMessages?, maxIterations?, thinking?, toolChoice?,
  onToken?, signal?, timeoutMs?    // supplying tools selects the tool loop
}
AriaModelResult = { ok, data, raw, cost_cents, latency_ms, provider, tool_calls, iterations,
                    outcome /* the shared truncation rail */, error_message }
```

### Built over the provider, not beside it

`providers/anthropic.ts` is 405 lines of working circuit-breaker, Gemini failover, prompt-cache
breakpoints, streaming, cancellation and cost accounting. **A third abstraction was the wrong
answer** — the gateway wraps it.

### VERIFIED LIVE — one row per call

```
ok: true | provider: anthropic | outcome: ok | iterations: 1 | raw: "OK"

aria_ai_calls, agent_key=m13_gateway_probe:
  2 calls -> 2 rows · haiku · role chat · 20 in / 4 out each · success true
```

**Exactly one row per call, with the right tokens.** (`cost_usd_cents` 0 on both — sub-cent
rounding, MS15 phase 1; the column is integer cents and the call is worth ~0.2 of one.)

### The guarantee, and where the insert actually lives

`businessId` is **required and throws if absent** — never defaulted, because a default id is a
fabricated attribution. That is the precondition `providers/anthropic.ts` gates its `aria_ai_calls`
insert on (`if (params.businessId)`), and omitting it is exactly how `intent_classifier` ran twice
per turn across 412 turns with **zero** rows (M12 phase 5).

**The insert itself stays in the provider, deliberately** — it is already correct there and already
covers the thirteen files importing the provider directly. Moving it up into the gateway would
silence every one of them until they migrated. The brief asked for logging *once, here*; one row per
call is what that is for, and that is what is measured above.

### What it deliberately does not do

**It does not choose the model.** A test asserts `model: req.model` on both paths and that no
routing vocabulary appears in the file. Routing is M14.

### A defect the live run caught that reading would not have

The first version classified a plain-prose reply of `"OK"` as **`unparseable`** — because no JSON
came back from a call that never asked for any. Prose and JSON are now judged separately:
`wantedJson = fallback !== undefined`. Found by running it.

### Mutation check

The gateway does not perform the insert; it guarantees the insert&#39;s precondition. Removing the
`businessId` guard is therefore precisely "skip the log", and the suite goes red on it.

### Gates

tsc **0** · vitest **116 files / 1541 tests, exit 0** · `next build` **BUILD_EXIT=0**
(`build.log:1967`).

---

## PHASE 4 — W1: THE GUARD [OK]

**Commit:** `f0c5edb5` · `scripts/canon-rail-guard.ts` (+rule 11, +allow-list, +homes),
`src/lib/ai/w1-allowlist.test.ts` (new, 5 tests).

**No NEW file may contain `new Anthropic(`, `.messages.create(`, `GoogleGenerativeAI` or
`generateContent(` outside `src/lib/ai/` and `src/lib/aria/providers/`.**

### The allow-list is 177 and can only shrink

**Generated by scanning the tree with comments stripped**, not written by hand — so a file that
merely *describes* the pattern is not grandfathered into being allowed to use it. 177, against the
brief's 171: the extra six are the `.messages.create` / `generateContent` matches that
`new Anthropic(` alone does not find.

`w1-allowlist.test.ts` pins a **ceiling of 177** and fails if the list grows. Migrating a file means
removing it and lowering the number; it must never be raised.

### VERIFY — both directions, observed

```
RED    a new file with       -> 2 violations
                                                [direct-model-sdk-call] + [model-call-outside-gateway]
RED    a new file with    -> 1 violation
                                                [model-call-outside-gateway]   <- rule 8 is SILENT here
GREEN  probe removed                         -> Pass.
```

The second probe is the one that matters: **it proves the new rule is not redundant** with MS15's
rule 8, which only ever caught `new Anthropic(`.

### Two of my own parser bugs, caught by the anti-vacuity assertion

1. `GUARD.indexOf(&#39;]&#39;)` closed the list at the **first** `]` — and Next.js route segments put
   brackets inside the paths (`src/app/api/customers/[id]/aria-insight/route.ts`). It parsed **82**
   of 177 entries and would have passed a ratchet test over less than half the list.
2. I asserted `providers/gemini.ts` was on the list. It is not: that file calls the Gemini REST API
   directly rather than through `GoogleGenerativeAI`, so it never matched the scan.

Both were caught by the assertion that exists to catch exactly this, and both are recorded in the
test file.

### Gates

tsc **0** · vitest **117 files / 1546 tests, exit 0** · `next build` **BUILD_EXIT=0**
(`build.log:1967`).

---

## PHASE 5 — W1: MIGRATE THE ASK ARIA LANES ✅ (partly — one council parked, with the reason)

**Commit:** `04745948` · `ask/route.ts` (3 call sites), `action-planner.ts`,
`agents/council.ts` (migrated + own telemetry removed), `gateway.ts` (widened), `types.ts`,
`agents.ts`, `router.ts`, `canon-rail-guard.ts`, `w1-allowlist.test.ts`.

### THE ALLOW-LIST: 177 → 176

⚠️ **And the honest reason it only moved by one.** The four Ask Aria call sites — the general lane,
the main tool loop, the accuracy verifier and the action planner — **were never on the list**. They
already went through `providers/anthropic.ts`; they were not among the 177 files constructing their
own client. Migrating them puts the hero surface behind the door, which is the point, but **it does
not shrink the backlog**, because the backlog counts a different thing.

The number moved because **`lib/agents/council.ts` was migrated off its own `new Anthropic(`** — one
real entry removed, and `w1-allowlist.test.ts`'s ceiling lowered from 177 to 176 in the same commit.
That is the ratchet working, demonstrated once end to end.

### What was migrated

| lane | file | before | after |
|---|---|---|---|
| general fast-path | `ask/route.ts:881` | `callAnthropicWithTools` | `callModel` |
| main tool loop | `ask/route.ts:2419` | `callAnthropicWithTools` | `callModel` |
| accuracy verifier | `ask/route.ts:2564` | `callAnthropic` | `callModel` |
| action planner | `action-planner.ts:134` | `callAnthropic` | `callModel` |
| **agent council chair** | `agents/council.ts:401` | **its own `new Anthropic(`** + `trackAICall` | `callModel`, **own telemetry deleted** |

**Behaviour preserved: same model, same prompt, same tools.** `trackAICall` was removed **in the
same edit** as the migration, so the cost is counted once and never twice — the brief's rule, and
the whole reason a gateway is worth having.

### VERIFIED LIVE — a migrated lane, end to end, one row

The action planner, through the gateway, against production:

```
planAction → {"type":"adjust_stock","title":"Set stock of Flat White to 24"}

aria_ai_calls: agent_key=ask_aria · claude-sonnet-4-5-20250929 · role chat
               3,682 in / 259 out · success true          ← exactly ONE row
```

Same model it used before (`'sonnet'` passed through unchanged), same output shape, one ledger row.

### The gateway had to grow to be worth using

Two things the migration exposed, both fixed in the gateway rather than worked around at the call
site:

- **`userPrompt` was `string`.** Ask Aria sends **multimodal content blocks** (an array) when the
  owner attaches an image. A string-only gateway would have forced that lane to keep bypassing the
  door — the exact opposite of the point. It now matches the provider's own width.
- **The result was lossy.** It dropped `success` and `thinking_tokens`. A gateway that returns
  *less* than the thing it wraps makes callers keep the old path for the one field they need. It is
  now a superset.

### ⚠️ PARKED — `lib/aria/council.ts`, and why

**1,391 lines, two `.messages.create` call sites, its own `withBackoff`, its own streaming and
timeout semantics, and four importers including `ask/route.ts` itself.** It is the live Ask Aria
council — the single highest-risk file in the repo to touch — and migrating it means the gateway
must first grow a retry/backoff contract it does not have.

**That is a design decision, not a mechanical swap**, and doing it at the end of a seven-phase run
on the hero answer path is how a wall becomes an outage. Named, not taken. It stays on the
allow-list; the ceiling stays at 176 until it moves.

---

## PHASE 6 — THE TWO COUNCILS ✅ (report)

**No code in this phase.**

### ⚠️ THE IMPORTER COUNTS IN THE BRIEF ARE BOTH WRONG

| | brief | measured (real `import … from` statements) |
|---|---|---|
| `lib/agents/council.ts` | 487 lines, **10 importers** | 487 lines ✅, **1 importer** |
| `lib/aria/council.ts` | 1,391 lines, **12 importers** | 1,391 lines ✅, **4 importers** |

Line counts exact; importer counts appear to have counted grep hits on the word "council"
(route files, dashboard fetches) rather than imports of the module.

### They are genuinely different things, badly named

| | `lib/agents/council.ts` | `lib/aria/council.ts` |
|---|---|---|
| exports | `runCouncilSession(business_id)` | `runAriaCouncil()`, `insertCouncilRun()` |
| importers | `api/cron/council-session/route.ts` — **1** | `ask/route.ts`, `briefing/route.ts`, `customers/[id]/summarise`, `reports/weekly-ai.ts` — **4** |
| trigger | a nightly **cron** | an owner **asking a question** |
| produces | rows in `agent_council_sessions` + `agent_council_proposals` | a synthesised **answer** from four advisor brains |
| writes | proposals for later execution | nothing — it returns text and blocks |

**Neither is a duplicate of the other.** One is a scheduled proposal generator; the other is the
synthesis behind Ask Aria's answers. The shared name is the whole problem: `import { … } from
'@/lib/…/council'` reads identically at the call site and means something completely different.

### The verdict: neither is dead, but one is inert

`agents/council.ts` **runs** — 95 sessions, the most recent within days. And in 95 sessions it has
produced **2 proposals, ever**, with **0 executed** and **0 carrying a `council_decision`**. Its
executor (`council-executor.ts`) has never been called. **It is alive and produces nothing.**

That is not dead code — deleting it would be deleting a feature that runs — but it is a feature that
has never worked. **Recommendation, not taken here:**

1. **Do not merge them.** They do different jobs. Merging two live councils is a design sprint.
2. **Rename, so the next reader cannot confuse them** — `agents/proposal-council.ts` and
   `aria/answer-council.ts`, or similar. This is the cheap fix and it is the one that pays.
3. **Then decide what `agents/council.ts` is for.** 95 runs and 2 proposals is either a broken
   generator or a feature nobody wants. Both answers are fine; not knowing which is not.

Migration was not attempted for either beyond phase 5's chair call, per the brief: *report; migrate
only if one is demonstrably dead.* **Neither is.**
