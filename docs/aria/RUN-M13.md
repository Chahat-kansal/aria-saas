# RUN-M13 · THE FIRST TWO WALLS

6 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

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

**Commit:** `<phase-1>` · `scripts/canon-rail-guard.ts` (+2 rules, +1 allow-list, +remediation text).

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

**Commit:** `<phase-2>` · `council-executor.ts` (4 writes), `OrderTrackingClient.tsx`,
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

**Commit:** `<phase-3>` · `src/lib/ai/gateway.ts` (new), `src/lib/ai/gateway.test.ts` (new, 9 tests).

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
