# RUN-M13B · THE HERO PATH BEHIND THE WALL

7 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE

### Three premises in the brief, corrected before building on them

**1. ⚠️ `docs/aria/ARIA-ARCHITECTURE-AUDIT.md` still does not exist.** The brief says "Chahat is
committing it with M13's corrections". I pulled (`Already up to date`) and it is not in the repo.
Same as M13, where I had to re-measure every number from the code and the database instead of
reading it. **Nothing in this sprint depends on it** — but it is still not there.

**2. ⚠️ The walls are NOT ESLint rules.** The brief says "the ESLint W1/W6 rules" and later "the
ESLint import rule from M13". There is no such rule. `.eslintrc.json` carries exactly one
`no-restricted-imports` block, for two deprecated modules, and knows nothing about W1 or W6.

The walls are **rules 10a, 10b and 11 in `scripts/canon-rail-guard.ts`**, which runs in the pre-push
hook and in CI. Confirmed live against a fresh violating file:

```
src/lib/m13b-probe.ts:3  [direct-model-sdk-call]
src/lib/m13b-probe.ts:3  [model-call-outside-gateway]
src/lib/m13b-probe.ts:5  [supabase-error-not-read]
```

This matters concretely for phase 2: the mechanism the brief wants for retiring the old council
names — `no-restricted-imports` — **does exist in ESLint**, just not from M13. It is the right tool
and phase 2 uses it.

**3. ⚠️ The shrink check is a vitest test, not a CI check.** `src/lib/ai/w1-allowlist.test.ts`, with
`CEILING = 176`. It runs in the pre-push hook via `npm run test:unit`. Same enforcement, different
mechanism than the brief describes.

---

## PHASE 1 — THE RETRY CONTRACT ✅

**Commit:** `<phase-1>` · `providers/anthropic.ts`, `ai/gateway.ts`,
`providers/retry-contract.test.ts` (new, 12 tests).

### ⚠️ THE CONTRACT ALREADY EXISTED — AND IT CONTAINED A LIVE BUG

The brief asks for the gateway to *gain* a retry policy. `providers/anthropic.ts` has had
`withBackoff` all along, wrapping **both** provider call sites. What it lacked was a written-down
contract, a test, and safety on the streaming path.

**The bug:** `withBackoff` wrapped the **entire streaming closure**.

```ts
withBackoff(async () => {
  if (!params.onToken) return client.messages.create(...)
  const streamed = client.messages.stream(...)
  streamed.on('text', delta => params.onToken!(delta))   // ← tokens already delivered
  return streamed.finalMessage()
})
```

A stream that delivered tokens to the client and *then* hit a transient error (529/503/overload/
rate-limit) was **retried** — opening a second stream that re-emitted from the beginning. **The
owner would read a partial answer followed by a complete one, concatenated.** The main Ask Aria lane
is the only streaming call site in the codebase, so the exposed path was the one that answers the
owner.

**The fix:** `deliveredToClient` is set on the first delta and passed as `canRetry`. Retry before
the first token; after it, fail honestly into the classified error state M4 built.

### The contract, in one paragraph

**Two attempts — one retry, never more.** A call is retried only when the error message matches
`/529|503|overload|rate.?limit/i`; anything else (auth, invalid request, timeout) throws
immediately, because repeating it does not make it truer. Backoff is `min(1000 × 2^attempt, 4000)`
ms. **A call that has already delivered a token to the client is never retried**, whatever the
error. Retries apply to the model call only — tool results are accumulated by the loop *outside* the
retry, so a retried turn never re-executes a side effect that already happened, and a test pins that
ordering.

### Written down once, and tested for real

The decision is extracted as `shouldRetryModelCall()` and `retryDelayMs()`, exported and driven
directly by the test — **a test of a re-implementation proves only the re-implementation.** The
transient regex now lives in exactly one place, asserted.

### ⚠️ PARKED — `retry_of`

The brief asks that every retry be a logged row carrying `retry_of`. **`aria_ai_calls` has no such
column** (20 columns, none of them `retry_of`, `attempt` or `parent_call_id`) — that is DDL, and DDL
parks.

What is true without it: each attempt is a real provider call and is billed, and the caller's
`aria_ai_calls` row records the tokens of the attempt that succeeded. **Linking the attempts to each
other** is what needs the column:

```sql
alter table public.aria_ai_calls add column if not exists retry_of uuid references public.aria_ai_calls(id);
create index if not exists aria_ai_calls_retry_of_idx on public.aria_ai_calls (retry_of) where retry_of is not null;
```

### Temperature — M13's recorded omission, closed

M13 accepted `temperature` at the gateway and dropped it, because the provider had no such field,
and said so rather than hiding it. The provider now carries it and forwards it **only when set** (an
explicit `undefined` is not the same as sending nothing). This had to happen before phase 3: the
answer council runs advisors at **0.25** and synthesis at **0.2**, and migrating it without this
would have changed the model's behaviour in the same commit as its plumbing — which the decision
table forbids.

### Mutation check

A version that ignores delivery returns `true` for a mid-stream transient failure — the duplicate-
output bug exactly. The suite goes red on the difference.

### A measurement error of my own

My first assertion counted the transient regex and found **2**, concluding there was a second copy.
The second was **my own doc comment** quoting the contract. Counted with comments stripped: one.
**The fourth time in this series that a scan has matched its own prose** — recorded in the test file.

---

## PHASE 2 — RENAME THE COUNCILS ✅

**Commit:** `<phase-2>` · two `git mv`s, 6 importers, 9 test/guard files, `.eslintrc.json`,
`council-names.test.ts` (new, 6 tests).

| was | is | what it actually does |
|---|---|---|
| `src/lib/agents/council.ts` | **`src/lib/agents/proposal-council.ts`** | nightly cron → writes proposal rows. It **proposes**. |
| `src/lib/aria/council.ts` | **`src/lib/aria/answer-council.ts`** | an owner asks → four advisors → one synthesised reply. It **answers**. |

Two live, unrelated features shared one name, so `import { … } from '@/lib/…/council'` read
identically at every call site and meant completely different things. M13 phase 6 recommended
exactly this and did not take it; taken now.

**NO SHIM.** The decision table is explicit, and a re-export shim would preserve the ambiguous
import line that is the entire defect.

### Every reference moved

**6 module importers** — `aria/ask`, `aria/briefing`, `customers/[id]/summarise`,
`reports/weekly-ai`, `agents/orchestrator` (a relative `'../council'`), `cron/council-session`.
**9 files carrying the paths as strings** — `canon-rail-guard.ts` (both allow-lists),
`w1-allowlist.test.ts`, `ax-1.test.ts`, `business-time-rail.test.ts`, `council-advisors.test.ts`,
`retry-contract.test.ts`, `s9-gate.test.ts`, `safe-json.test.ts`, `token-ceiling-rail.test.ts`.
One live code comment in `aria/agents.ts`.

**Deliberately NOT renamed:** `council-advisors.ts`, `council-conflicts.ts`,
`council-executor.ts`, the `/api/agents/council` routes, and the literal string values
`'council'` (an `agent_type` in the database, a `pipelinePath`, a `modelId`). A blanket
find-and-replace would have taken all of them — the seds were anchored on the closing quote.

### Two rails, so the old names cannot come back

1. **`.eslintrc.json`** — the two retired specifiers added to the existing `no-restricted-imports`
   block, each with a message naming the replacement and why. The two pre-existing deprecations
   are untouched, and a test asserts all four are present so this rule can only ever be extended.
2. **`council-names.test.ts`** — scans every `.ts`/`.tsx` under `src/` and `scripts/` for the old
   specifiers, with an **anti-vacuity assertion** (>1,500 files, both new paths present) so a scan
   that silently reads nothing cannot pass.

### Mutation check — it goes red

Reintroduced `@/lib/aria/council` in `reports/weekly-ai.ts`: **1 failed, 5 passed**, and the
failure named that exact file. Reverted; green again. The rail also proves it does **not** fire on
`council-advisors` or `council-conflicts`, which legitimately keep the prefix.

### The canon rail survived the move

RULE 14 warns that a file move has previously tripped the guard on byte-identical code. Run
against the staged rename: **"no new canonical-path violations introduced. Pass."** Both allow-list
entries were updated in the same commit, so `answer-council.ts`'s `new Anthropic(` is still
grandfathered — and phase 3 is what removes it.

**Gates:** tsc 0 · vitest **119 files / 1564 tests, exit 0** · `next build` **BUILD_EXIT=0**.

---

## PHASE 3 — THE HERO COUNCIL ONTO THE GATEWAY ✅

**Commit:** `<phase-3>` · `answer-council.ts`, `providers/anthropic.ts`, `ai/gateway.ts`,
`aria/types.ts`, `aria/agents.ts`, `aria/router.ts`, `canon-rail-guard.ts`, four test files
rewritten, `gateway-truncation.test.ts` (new, 11 tests).

**The allow-list moved: 176 → 175.** One file, one commit, one notch. M13 parked this file because
the gateway had no retry contract; phase 1 built the contract, and this is it being spent.

### ⚠️ THE MIGRATION WAS BLOCKED BY A BUG IN THE WALL ITSELF

Before a single line of the council could move, this had to be true — and it wasn't.

M13 wired `inspectTruncation(res)` into the gateway's plain path. `res` is `callAnthropic`'s return
value: `data · raw · cost_cents · latency_ms · success · provider`. **It carries neither
`stop_reason` nor `usage`.** So the rail read two fields that did not exist. Run against the real
shape:

```
TRUNC={"hitCeiling":false,"stopReason":null,"outputTokens":null}
OUTCOME_parsed=ok   OUTCOME_unparsed=unparseable
```

**Every model call in the product, always.** `ok_at_ceiling` and `truncated_mid_structure` — the two
outcomes M8 built the entire module for — were **unreachable** through the gateway.

M13's own test asserted `GATEWAY_CODE.toContain("from '@/lib/aria/truncation'")`. The import was
there; the behaviour was not. **Failure pattern #1, committed by the commit that built the wall** —
and found by *running* the function, not by reading it.

This is exactly why it mattered here: the answer council's M8 disclosure writes the verbatim
`stop_reason` and output-token count into a `council_ceiling` row. **Migrating onto the gateway as
it stood would have silently deleted ceiling detection from the hero answer path.**

**Fixed:** the provider now returns `stop_reason`, `input_tokens` and `output_tokens` on every path
(null on Gemini, which has no such concept and must say so rather than invent one); the gateway
reshapes them for the shared rail and passes `truncation` through to the caller.

### Two more things the gateway was silently dropping

`requestSummary` and `timeoutMs` were both in `AriaModelRequest` and forwarded **only on the tool
path**. The council needs each — a per-call summary of what the call was for, and an explicit
18s/45s timeout rather than the provider's 30s default. Both now forwarded; `request_summary` lands
in the `aria_ai_calls` column that already existed for it.

### What actually changed in the council

| | before | after |
|---|---|---|
| client | its own `new Anthropic(...)` | none — the gateway's |
| retries | its own `withBackoff`, `min(800·2ⁿ, 3000)` | the provider's, `min(1000·2ⁿ, 4000)` |
| timeout | `Promise.race` — abandoned the call, kept billing | the provider's `timeoutMs`, which **aborts** |
| cost | its own `logAICall` + `computeCostCentsWithCache` | the gateway's, once, at the boundary |
| advisors | 4 × `messages.create`, haiku, 4000 tok, 0.25 | 4 × `callModel`, **unchanged** |
| synthesis | `messages.create`, haiku/sonnet, 6000 tok, 0.2 | `callModel`, **unchanged** |
| lines | 1,391 | 1,422 |

**The only behavioural difference in the whole migration is that a retry now waits 200 ms longer.**
That was measured against both implementations in phase 1, before the move — and it changes *when* a
retry happens, never *whether* one does.

### Nothing was lost. Two capabilities were moved up rather than deleted

1. **The rejected-insert row.** The council's logger wrote a `council_log_failure` row carrying the
   rejection reason whenever its `aria_ai_calls` insert was refused (COUNCIL-LOG-FIX-1) — how a
   CHECK violation stays queryable without Vercel log access. The provider did **not** do this.
   Deleting the council's logger without moving it would have been a downgrade, so it was **lifted
   into the provider** as `ai_log_failure`, in the same commit. **Every caller gets it now, not just
   the one that thought of it.**
2. **M8's ceiling disclosure and lost-advisor accounting** survive intact, and are asserted: two
   `council_ceiling` sites, `truncationSignal`, `lostAdvisors`, and `classifyOutcome` called **in
   the council** against `safeParseJSON` rather than taking the gateway's verdict — the gateway
   judges prose on "was there any text", which is a weaker question than "did the JSON survive".

### ⚠️ ONE MEANING DID CHANGE — recorded, not slipped through

`aria_ai_calls.success` on a `council_*` row used to mean **"the JSON parsed"**. Through the gateway
it means **"the model call succeeded"** — the same thing it means for every other agent key in the
table. A parse failure on a healthy, billed call no longer produces a row claiming the call failed.

The parse outcome is not lost: a `council_outcome` row is written whenever an advisor's or the
synthesis's structure does not survive, alongside the `council_ceiling` row. **Forward-only —
historical rows keep their old meaning**, and a query mixing the two eras must know that.

### Five `AgentKey` values added — and they are not new

`council_growth · council_risk · council_strategy · council_context · council_synthesis`. These have
been written to `aria_ai_calls` since COUNCIL-LOG-FIX-1; **the union is only now catching up with
production.** Keeping the exact strings is the point — renaming them would orphan every historical
row and silently reset the cost history for the hero answer path. `agent_key` has no CHECK
constraint (verified in M13), so this is a code-side convention, not DDL.

### Mutation check

Reverted the gateway to `inspectTruncation(res)` — the blind version. **2 tests red**, in two files,
naming the shape. Reverted back: green. The canon rail passes with the council **off** both
allow-lists, which is the real proof it no longer touches the SDK.

### Four superseded tests rewritten, none deleted

`cost-truth` (174 → 173), `gateway.test` (asserted the blind call spelling — now asserts the fields
handed in, plus that the old spelling cannot return), `token-ceiling-rail` (the scan follows the
council to `callModel` / `res.truncation`; both mutation probes updated), `retry-contract` (**the
assertion is inverted**: what phase 1 proved equivalent, phase 3 proves absent). Each carries the
reason in the file.

**Gates:** tsc 0 · vitest **120 files / 1575 tests, exit 0** · canon rail pass.

---

## PHASE 4 — THE COUNCIL THAT PRODUCES NOTHING ✅ (report; nothing deleted)

**Diagnosed, not deleted — that call is the founder's.** No code changed in this phase.

### The measurement

| | |
|---|---|
| council sessions | **97**, all `complete`, 2026-06-02 → 2026-09-06 (nightly, 20:00 UTC via the `h20` dispatch) |
| proposals ever | **2** |
| `agent_decisions` ever | **2** |
| sessions narrating *"No agent proposals today — all systems are in steady state."* | **96 of 97** |
| date of both proposals | **4 June 2026** |

**94 consecutive days of nothing, and the owner is told it is steady state every single morning.**

### The exact line where a session completes without proposing

`src/lib/agents/proposal-council.ts:402-404`

```ts
plan_narrative: proposals.length === 0
  ? 'No agent proposals today — all systems are in steady state.'
  : 'Aria reviewed ' + proposals.length + ' proposals and approved…'
```

**Zero proposals and a healthy business are rendered identically.** Total agent failure and genuine
calm produce the same sentence. That is the single line to change: an empty council is not evidence
of a steady business, and today it claims to be.

### Why zero — as far as the code can be made to say, which is not far enough

**The agents run and they reach the model.** Last night, 2026-09-06 20:00 UTC, inside the council's
own dispatch window:

```
20:00:21  bas_compliance        role=compliance  success=true  203 in / 165 out
20:00:24  inventory_financing   role=forecast    success=true  121 in /  96 out
```

Neither of those is in the `h20` job list, so they can only have come from the council running all
14 agents. **2 of 14 reached a model call. The other 12 left no trace at all.**

**⚠️ AND THE REASON THEY LEFT NO TRACE IS ONE LINE.** `proposal-council.ts:271`

```ts
const agentErrors: string[] = []      // pushed to at :288 and :300 — READ AT NEITHER
```

Every agent failure — "not registered", a thrown error, a 25-second timeout — is accumulated into a
local array and **discarded when the function returns.** Not logged, not written to the session row,
not returned. **Whether the other 12 agents threw, timed out, or genuinely had nothing to say is
unknowable from production**, and has been for 94 days.

Two more discarded errors on the same path compound it: the proposal insert (`:319`,
`const { data: insertedProposals }` — no `error`) and `BaseAgent.saveDecisions`
(`base-agent.ts:46`). Either failing produces exactly the same silence as having nothing to propose.

`agent_runs` cannot arbitrate: it holds **7 rows, all from 4 June**, though every agent calls
`logRun` at the end of `run()` and four of them run on their own dedicated crons besides. So that
insert is failing too — and its `try/catch` cannot catch a Supabase rejection, which **resolves**
with `{ error }` rather than throwing. W6, exactly.

### What this is, and what it is not

**It is not dead code.** It runs nightly and it costs money. `agent_settings` shows all nine
configured agents `enabled = true`, mode `suggest`. Deleting it would delete a feature that runs.

**It is a feature that has never worked, wrapped in a reassuring sentence, with its own diagnostics
switched off.** The three fixes, in the order they pay:

1. **Read `agentErrors`** — persist it to `agent_council_sessions` or log it. One line to collect,
   one to persist. Until then no diagnosis of this is possible, including this one.
2. **Stop claiming steady state on zero proposals.** Say "no agents reported" — which is true, and
   is not the same claim.
3. **Then** decide what the proposal council is for. 97 runs and 2 proposals is either a broken
   generator or a feature nobody wants. Both answers are fine; not knowing which is not.

**Not fixed here — all three are behaviour changes on a surface the owner reads, and phase 4's
instruction was diagnose and report.**

---

## PHASE 5 — REPLAY ✅

**30 real owner messages** from `aria_conversations` (deduplicated, most recent first, 8–300 chars;
498 user messages across 429 conversations exist), run through the council **before and after** the
migration.

### ⚠️ A DIFF OF MODEL OUTPUT WOULD HAVE BEEN THE WRONG TEST, AND WOULD HAVE PROVED NOTHING

The council runs its advisors at **temperature 0.25** and its synthesis at **0.2**. Non-zero
temperature means **two runs of the *unchanged* code produce different text.** A before/after output
diff would have measured sampling noise and reported it as migration risk — at a cost of 30 messages
× 5 calls × 2 versions = **300 billed calls on the hero path**, to learn nothing.

**What must be identical is the REQUEST.** So the replay compares what actually reaches the model,
which is deterministic and falsifiable.

### The harness

`git show 3cc8c84f:…/answer-council.ts` (phase 2 head — post-rename, pre-migration) against the
working tree. Both loaded as modules with imports stripped and the one module-level DB client
neutralised; the five functions that decide **what the model sees** and **which model answers** run
over all 30 messages.

### The result — 301 comparisons, 0 diffs

```
ADVISOR_PROMPT_DIFFS=0    over  91 comparisons   (30 × growth/risk/strategy + the static context prompt)
SYNTHESIS_PROMPT_DIFFS=0  over 120 comparisons   (30 × 4 hedge levels: none/moderate/heavy/absent)
MODEL_CHOICE_DIFFS=0      over  90 decisions     (30 × ask_aria/briefing/weekly_report)
```

Anti-vacuity passed: the comparison can tell two different prompts apart, and two different model
choices apart. The harness was deleted after the run — it embeds a full copy of the pre-migration
file and does not belong in the tree.

### A finding the replay turned up for free

`distribution={"haiku":30,"sonnet":60}` — the 60 are briefing and weekly_report, which are
**hardcoded** to Sonnet. In `ask_aria` mode, **0 of 30 real owner messages escalated.**
`classifyQuestionComplexity`'s `critical` and `complex` regexes have never fired on this corpus.
That may well be correct — these are mostly short revenue questions — but an escalation path that
has never escalated on real traffic is worth someone looking at.
