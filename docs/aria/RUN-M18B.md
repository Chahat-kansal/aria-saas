# RUN-M18B · PROVIDER-SPEND-CONTROL

Branch `main` · autonomous run (RULE 20) · started 5 Oct 2026 · **Lane A + D**

---

## 🚨 URGENT — THE QUESTION THE SPRINT EXISTS FOR, ANSWERED FIRST

> **No test in this repo can spend money today — and nothing in the repo prevents it.
> The protection is an accident, and it is one line of convenience away from vanishing.**

Measured by running a throwaway probe test under `npx vitest run` and reading what it could see
(then deleting it):

```
ANTHROPIC_API_KEY=ABSENT | GEMINI_API_KEY=ABSENT | OPENAI_API_KEY=ABSENT
SUPABASE_SERVICE_ROLE_KEY=ABSENT | fetch=function
```

So:

- **Every provider key is absent**, because `vitest.config.ts` has **no `setupFiles`** and nothing
  loads `.env.local`. A provider client constructed in a unit test gets `apiKey: undefined` and the
  SDK throws *before any network call*. That is why the suite is free — not because it is fenced.
- **`fetch` is a live function** and `environment: 'node'`. There is **no network guard of any kind**.
  Any test that hard-codes a key, reads one from CI secrets, or calls a provider that needs no
  client-side key would spend real money and nothing would stop or even notice it.
- **One plausible future commit arms all 1,841 tests**: adding `setupFiles` with `dotenv` — an
  obvious convenience, and the sort of thing added to make one integration test work — would hand
  live keys to every test in the repo at once.
- `SUPABASE_SERVICE_ROLE_KEY` being absent also means **unit tests cannot write `aria_ai_calls`
  rows at all**, which rules the suite out as the source of the ledger's failures (below).

**Phase 3 is therefore the right phase and it is not redundant**: it converts an accident into a
guarantee. Nothing else in this sprint matters as much.

---

## 1 · WHAT IN THIS BRIEF WAS WRONG

**Three corrections, and two of them shrink the work substantially.** The brief asked me to assume it
carried one; it carried three.

### ⚠️ 1a · THE TWO FAULTS DO NOT SPLIT BY MODEL. They are one path in two environment states.

The brief: *"they split by model (Sonnet auth, Haiku credit), so the two paths are probably different
clients."*

Measured, `aria_ai_calls` since 21 Sep:

| model_id | calls | ok | credit 400 | auth error |
|---|---|---|---|---|
| `claude-haiku-4-5-20251001` | 304 | **0** | 250 | **52** |
| `claude-sonnet-4-5-20250929` | 42 | **0** | 29 | **12** |
| `gemini-2.5-flash` | 379 | 354 | 0 | 0 |

**Both models get both faults**, in similar proportions. The split is by **call path**, not model —
auth errors cluster on the ask path (`ask_suggestions` 29, `thread_title` 24, the two classifiers 6),
credit 400s on the cron/agent path (`pricing` 84, `generic` 42, `ops_narrative` 42, `schedule` 28,
`inventory_financing` 24, `bas_compliance` 14, `business_brain_daily` 10).

**And then the decisive observation, which kills "different clients" as the explanation:**

```
00:36:44  intent_classifier       claude-haiku-4-5-20251001   credit_400
00:36:44  aria_intent_classifier  claude-haiku-4-5-20251001   credit_400
00:37:37  business_brain_daily    unknown                     credit_400
00:38:51  aria_intent_classifier  claude-haiku-4-5-20251001   auth_err     ← same agent, same model
00:38:51  intent_classifier       claude-haiku-4-5-20251001   auth_err     ← two minutes later
```

**The same `agent_key` and the same `model_id` produced a credit 400 at 00:36 and an auth error at
00:38.** One code path cannot do that. The key was resolving at 00:36 and not at 00:38, so what
changed was the **environment the call ran in**, not which client was used. Two clients do exist
(below), but they are not what distinguishes the two faults.

The brief's conclusion still stands and is unaffected: **fixing either fault alone leaves Claude at
zero.** It is right for a better reason than it gives.

### ⚠️ 1b · PHASE 1's PREMISE — "the circuit breaker the gateway never had" — IS WRONG. It has one.

`src/lib/aria/circuit-breaker.ts` is an **account-wide, shared** breaker, and it is not a stub:

- `isAnthropicUnreachable()` at **line 47–51** already matches **both** of this sprint's errors.
  `credit balance` is the *first alternative in its regex*; `authentication` matches *"Could not
  resolve authentication method"*. Neither needed adding.
- `providers/anthropic.ts:193–195` already checks `isAnthropicCircuitOpen()` and, when open, goes
  **straight to Gemini without calling Anthropic** — exactly the behaviour Phase 1 specifies.
- It trips at `FAIL_THRESHOLD = 2` within `FAIL_WINDOW_SEC = 300` (`circuit-breaker.ts:25–26`).
- **It demonstrably works:** `aria_provider_incidents` holds **422 rows, 43 of them since 21 Sep**,
  the most recent today.
- `providers/anthropic.ts:126–132` even records that this module *used to* keep its own weaker
  breaker and was deliberately migrated onto the shared one, because *"independent breakers meant each
  discovered the same Anthropic outage on its own"*.

**So why are 346 Claude calls still being attempted? Because the two paths doing the spending never
ask it.** Files importing `circuit-breaker`:

```
src/app/api/cron/daily-briefing-submit/route.ts
src/app/api/health/deep/route.ts
src/lib/aria/ask/strategies/main.ts
src/lib/aria/providers/anthropic.ts
```

**Four files. `src/lib/ai-router.ts` imports it 0 times. `src/lib/agents/base-agent.ts` imports it 0
times.** Those two are precisely where the wasted calls come from.

**Phase 1 is therefore not "build a breaker". It is "make the two bypassing paths consult the breaker
that already exists"** — a much smaller change, and one that automatically satisfies the brief's own
constraint that the breaker must not be a try/catch at the call site: it is a shared service, and
joining it is the documented pattern this repo already chose once.

It also satisfies *"the fallback chain itself does not change"*, and that is checkable rather than
hoped: `ai-router.ts:239` is
`fallbackOrder = ['claude','gemini','openai','haiku'].filter(p => p !== primary)`. **The chain already
ends at Gemini.** Skipping two doomed Anthropic attempts leaves Gemini answering — which is what
answers the owner today, after those two attempts fail. Same provider, same model, same words, sooner.

### ⚠️ 1c · `model_provider` AND `cost_usd_cents` ARE **DDL DEFAULTS**, NOT CODE CONSTANTS.

The brief treats Phase 4 as a code change. Half of it is not mine to make. From
`information_schema.columns`:

| column | nullable | **default** |
|---|---|---|
| `model_provider` | YES | **`'anthropic'::text`** |
| `cost_usd_cents` | YES | **`0`** |

- **That is why `model_provider` is the literal `anthropic` on every row including 1,037 Gemini
  calls.** Almost no code sets it — only 5 sites do, all with literals
  (`deliverable-email/route.ts:90` `'other'`, `deliverable-pdf/route.ts:37` `'other'`,
  `widget/chat/route.ts:226`, `deliverables.ts:796`, `parallel-orchestrator.ts:119`, the last three
  `'anthropic'`). **The canonical writer `log-ai-call.ts` never sets it at all.** The database is
  filling in a wrong constant for everyone else.
- **That is why 929 calls sum to zero**: `DEFAULT 0` means a caller who omits the cost asserts the
  call was free. 885 rows are literally `0`; only 44 are `NULL`.

**Consequence, and it changes Phase 4's shape:** code *can* fix this for rows it controls — an
explicit value overrides a default, so passing the real provider and an explicit `null` works without
DDL. But **while the defaults stand, every insert that omits the column keeps lying**, including from
the 175 allow-listed bypassers. Dropping the `model_provider` default and changing
`cost_usd_cents`'s to `NULL` is **DDL, and RULE 10a is absolute: I do not write schema.** It goes to
the founder console with the exact SQL, and Phase 4 does the half that is mine.

### ⚠️ 1d · "STOP PAYING FOR CALLS THAT CANNOT SUCCEED" — THE DOOMED CALLS COST NO MONEY AT ALL.

This is the correction that reframes the sprint, so it is worth being blunt about.

**A call that cannot succeed does not bill.** An auth-resolution error never reaches Anthropic — the
SDK throws locally. A `400 … "Your credit balance is too low"` is a rejection, not a charge.
**Anthropic successes since 21 Sep: 0. Therefore Anthropic spend since 21 Sep: 0.**

So the 346 doomed Claude attempts are **not** what is draining the balance. What they actually cost is:

- **latency** — on the ask path, two failed Anthropic round-trips before Gemini answers, on every turn;
- **ledger noise** — 346 of 929 rows are failures that tell you nothing you didn't already know;
- **a wrong picture** — they are indistinguishable, in the ledger, from calls that worked.

Phase 1 is still worth doing, and the brief's own summary line is the accurate one: *"Aria must never
call a provider it already knows is dead."* It buys **speed and clarity**, not dollars. The phase is
unchanged; only the justification is corrected, because a sprint that reports "we stopped the spend"
when the spend was already zero would be the kind of claim RULE 17 exists to prevent.

**Where the money actually goes today:** Gemini — **354 successful calls of 379** since 21 Sep — plus 3
OpenAI successes. The balance was drained at some point *before* 21 Sep, and whatever did that is not
visible in a window where nothing succeeds. Founder console 3 (is Anthropic needed at all?) is the
right question, and Phase 4's ledger is what makes it answerable.

**And founder console 1 turns out to be already satisfied** — `ANTHROPIC_API_KEY` is absent from Claude
Code's shell — so the brief's "single change that stops testing draining the balance" is not available
to make, because testing is not draining it either (§URGENT: no key, no spend).

---

---

## 2 · PHASE 0 — THE FIVE ANSWERS, WITH FILE:LINE

### Q1 · Every place a provider is chosen or a client constructed

| | |
|---|---|
| **The gateway (W1)** | `src/lib/ai/gateway.ts` → `callModel()`. Constructs no client itself; delegates to `src/lib/aria/providers/anthropic.ts` (538 lines, shared breaker + Gemini failover + prompt cache). |
| **Raw client constructions** | **180** across the repo: **149** in `src/app/api/**` route handlers, **28** in `src/lib/**`, **3** in `scripts/**` (`new Anthropic(` / `new OpenAI(` / `GoogleGenerativeAI(`). |
| **The allow-list (WALL 1)** | `scripts/canon-rail-guard.ts` → `MODEL_GATEWAY_ALLOWLIST`, **CEILING = 175** in `src/lib/ai/w1-allowlist.test.ts:36`. A ratchet: it may only shrink. It has gone 177 → 176 (M13 p5) → 175 (M13B p3). |
| **The two paths that matter here** | `src/lib/ai-router.ts:124` (`callClaude`, Sonnet) and `:198` (`callHaiku`, "emergency fallback only") — both `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`. `src/lib/agents/base-agent.ts:53` — `protected anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })`, an instance field, constructed per agent. |
| **Who reaches `ai-router`** | `src/lib/aria/ask/pipeline/turn-persistence.ts:278` → `ariaChatWithProvider('insight', buildTitlePrompt(...))` — this is `thread_title`, and it explains the Sonnet-then-Haiku pairs in the ledger exactly. Also `src/lib/aria/degraded-answer.ts:44`. |

### Q2 · Can the test suite reach a live provider?

Answered in full at the top. In one line: **not today, because no key is loaded; and nothing prevents
it, because there is no guard.** `vitest.config.ts` has no `setupFiles`; `fetch` is live.

### Q3 · Where `model_provider` is set, and why it is a constant

**It is a column default — `'anthropic'::text` — not code.** Five code sites set it, all literals
(listed in §1c). `src/lib/aria/log-ai-call.ts`, the canonical writer, sets `provider` (the
CHECK-constrained column) and **never** `model_provider`. Every row it inserts therefore takes the
default.

### Q4 · Where `cost_usd_cents` is written, and why 929 calls summed to zero

**Also a column default — `0`.** `log-ai-call.ts:33` accepts `cost_usd_cents?: number` and passes it
through *only when the caller supplies it*; `ai-router.ts:33` supplies one, `base-agent.ts:206`
supplies one and `:230` supplies a literal `0`. Everyone else omits it and the database records a
free call. 885 rows are exactly `0`, 44 are `NULL`.

*(Most `cost_usd_cents: 0` hits in a naive grep are HTTP **response body** fields in the ask lane,
not ledger writes. Counting those as ledger writers would have been a measurement error; they are
excluded here.)*

### Q5 · Which code path throws the auth error vs which gets the credit 400

**Neither splits by path, and that is the finding.** §1a has the evidence: both models get both
faults, and the same `agent_key` + `model_id` got a credit 400 at 00:36:44 and an auth error at
00:38:51. The two clients are `ai-router.ts:124/198` and `base-agent.ts:53`; **both read the same
`process.env.ANTHROPIC_API_KEY`**, so the client cannot be what differs.

What differs is the process. **And `aria_ai_calls` has no column recording which environment a call
came from**, so attributing a given row to the local `next start` server, to CI, or to a Vercel
function is not currently possible from the data. That gap is why this took five queries to narrow
and still cannot be closed — it is in the founder console as a request, because adding a column is
DDL.

What *is* established: the suite is not the source (no service-role key, so it cannot write rows at
all), and the window of today's failures — 00:36 to 01:49 UTC — is entirely inside this session's
own build / test / `check:live` activity.

---

## 3 · PHASES

### PHASE 0 — WHERE THE MONEY ACTUALLY GOES · commit `pending`

**SCOPE** · no behaviour change. Five questions, answered above with file:line and counts.

**files changed** · `docs/aria/RUN-M18B.md` (new). **No `src/` change, no test change.**

**VERIFY** · the five answers above · the probe run pasted at the top of this log (and the probe
deleted) · the brief's own evidence re-measured below, independently, before anything was built on it:

| the brief's figure | measured today | verdict |
|---|---|---|
| 0 successful Claude calls since 21 Sep | **0** | ✓ |
| 345 Claude attempts of 927 | **346 of 929** | ✓ (two more calls since they queried) |
| credit-balance 400s every day | **289** since 21 Sep | ✓ |
| auth-resolution errors every day | **64** since 21 Sep | ✓ |
| Gemini successes today 205 | **229** | ✓ (more since) |
| `model_provider` the literal `anthropic` on every row | **1 distinct value: `anthropic`** | ✓ |
| `sum(cost_usd_cents)` = 0 | **0** (885 zeros, 44 nulls) | ✓ |
| 154 of 785 conversations `ai_outage` = 19.6% | **154 of 785** | ✓ |

**Every figure in the brief holds.** The corrections in §1 are to its *diagnosis*, not its evidence.

**gates** · n/a — no code changed. `tsc` and the suite were green at `480f3821` before this phase
began and nothing was touched.

**NOT done, and why** · nothing built; Phase 0 is deliberately read-only.

**discovered**

- The breaker exists and works; the spenders do not consult it (§1b). This is the whole of Phase 1.
- Both ledger faults are DDL defaults (§1c). Half of Phase 4 is a founder action.
- `aria_ai_calls` has no environment/origin column, which is why the two faults cannot be attributed
  to a process from the data alone.

---

### PHASE 1 — A DEAD PROVIDER IS SKIPPED, NOT RETRIED · commit `pending`

**SCOPE** · make the two hard faults stop a provider being dialled, with a configurable TTL.
**NOT-SCOPE** · the fallback chain's order · 429/timeout behaviour · anything an owner reads.

**WHAT WAS ACTUALLY WRONG** — not a missing breaker (§1b). `src/lib/ai-router.ts` imported
`circuit-breaker` **0 times**, so every `thread_title`, `ask_suggestions` and classifier turn walked
into Anthropic regardless of what the account already knew.

**files changed**

| path | +/− | what |
|---|---|---|
| `src/lib/aria/circuit-breaker.ts` | +96 / −14 | `isHardProviderError()`, `HARD_OPEN_SEC`, two-window `isAnthropicCircuitOpen()`, `recordAnthropicHardDown()` |
| `src/lib/ai-router.ts` | +46 / −8 | consults the breaker, and **contributes** to it |
| `src/lib/ai-router-breaker.test.ts` | **new**, 178 | 8 tests — the router's decisions |
| `src/lib/aria/circuit-breaker-hard.test.ts` | **new**, 176 | 14 tests — the real classifier and the real TTLs |

**THE DESIGN, AND WHY EACH PIECE IS THE SMALL ONE**

- **A third classifier, deliberately narrower than the two that exist.** `isTransientError()` excludes
  billing/auth so they surface; `isAnthropicUnreachable()` includes them *and* 429/5xx;
  **`isHardProviderError()` is billing/auth ONLY.** The exclusion runs first, so
  `"429 … upgrade your billing tier"` is **not** hard — a rate limit clears by waiting, an empty
  balance does not. Collapsing any pair of the three is the one regression this phase could cause, and
  a test holds each boundary.
- **Two TTLs, chosen by what opened the incident, with no schema change.**
  `aria_provider_incidents.trigger_error` already exists, so `isAnthropicCircuitOpen()` classifies at
  read time: a hard incident counts as open for `HARD_OPEN_SEC`, a transient one for the unchanged
  `OPEN_SEC = 120`. **Behaviour for 5xx is byte-identical** — a 529 from 30 minutes ago still reads
  closed, and a test asserts exactly that at the same age as a hard one that reads open.
- **`HARD_OPEN_SEC` is configurable, not hard-coded**: `ARIA_PROVIDER_HARD_DOWN_SEC`, default **3600**
  (60 minutes, as specified), floored at 60s so a typo cannot disable it.
- **A hard fault opens on the FIRST occurrence.** `recordAnthropicFailure()` waits for three strikes in
  five minutes, which is right for a flaky provider and wrong here: one credit-balance 400 is
  deterministic proof, and waiting for two more pays two more round-trips to be told the same thing.
- **Observable, as required**: one `console.warn` per transition carrying the reason, one incident row,
  and no second row or second log line while the same outage is open.
- **The router now contributes, not just reads.** Reading alone would leave this path waiting for some
  *other* caller to discover the outage — the "independent breakers each discovered the same outage on
  its own" problem that `providers/anthropic.ts:126-132` records having already been fixed once.
- **A success closes the incident** (`recordAnthropicSuccess`), so a top-up or a fixed key heals on the
  next turn rather than waiting out the hour.

**⚠️ IT IS IN THE ROUTER, NOT AT A CALL SITE.** The brief forbids a try/catch at the call site. One
change in `ariaChatWithProvider` covers every caller of it — `turn-persistence.ts:278` (`thread_title`)
and `degraded-answer.ts:44` — and reuses the `opts.skipAnthropic` mechanism **that already existed on
this function**, so the filtering is not a new concept either.

**VERIFY — pasted**

```
 Test Files  145 passed (145)
      Tests  1863 passed (1863)
```

Call counts, not outcomes, because **the outcome was already correct** — the owner always got their
answer from Gemini. What was wrong was how many doomed calls came first, and an outcome-only test
passes just as happily with two wasted round-trips as with none.

The load-bearing test runs the identical scenario twice and compares:

| | Anthropic calls | provider that answered | text |
|---|---|---|---|
| circuit closed (today) | **1** | `gemini` | identical |
| circuit open (after) | **0** | `gemini` | identical |

and the ledger-pair case, where Gemini fails too:

| | Anthropic calls | outcome |
|---|---|---|
| circuit closed | **2** (Sonnet *and* Haiku — the exact pair in the ledger) | `provider: 'none'` |
| circuit open | **0** | `provider: 'none'`, **identical** |

**That second table is the hard rule as an assertion:** even the bad outcome is unchanged. Phase 1
removes doomed calls; it does not change what an owner is told when everything is genuinely down.

**MUTATION CHECK — 5 of 5 red, after TWO stayed green and exposed a real hole**

```
mutation                                           verdict
--------------------------------------------------------------------------------
the router stops consulting the breaker            RED - 3 tests failed
a hard fault waits for three strikes               RED - 2 tests failed
a 429 is misclassified as a hard fault             RED - 1 tests failed
the hard TTL collapses to OPEN_SEC                 RED - 2 tests failed
a success no longer closes the incident            RED - 1 tests failed
--------------------------------------------------------------------------------
5 of 5 went red. All verified.
```

**First run: mutations 3 and 4 came back `STILL GREEN — NOT VERIFIED`, and the tests were at fault,
not the mutations.** `ai-router-breaker.test.ts` *mocks* `@/lib/aria/circuit-breaker` — correct for
testing the router's decisions, but it meant breaking `isHardProviderError` or collapsing the hard TTL
changed nothing in the suite. **The classifier the entire phase pivots on was untested.**
`circuit-breaker-hard.test.ts` (14 tests, nothing mocked but the database) closes it, and both
mutations now go red. This is the third time in two sprints that the mutation check has been the more
valuable half of a phase.

**THREE THINGS MY OWN TESTS GOT WRONG, each corrected by running rather than reading**

1. I asserted OpenAI would never be called. **`TASK_PROVIDERS.insight === 'openai'`** — the real chain
   for a `thread_title` turn is `[openai, claude, gemini, haiku]`, so OpenAI legitimately *precedes*
   Claude. The assertion was replaced with the invariant that actually matters: same provider, same
   text, fewer Anthropic calls.
2. I expected **2** Anthropic calls in the healthy-Gemini case. It is **1** — Gemini sits before Haiku
   in the chain, so Haiku is never reached. The exact count is asserted, because a vague "fewer" is
   what let 346 doomed calls look acceptable for two weeks.
3. My mocked `isAnthropicUnreachable` regex had `timeout` but not `timed out`; the real one has both.
   A mock that is a worse copy of the thing it stands for is how a test proves the wrong code correct.

**And `tsc` caught two errors a green test run did not** — zero-argument `vi.fn()` mocks being spread.
"Tests pass" is not "gates pass", twice in two sprints.

**SIBLING SWEEP**

| searched for | hits | what was done |
|---|---|---|
| provider-call paths not consulting the breaker | **1 left**: `src/lib/agents/base-agent.ts` (0 imports) | **NOT changed — outside Lane A.** Named below with the exact change |
| callers of `ariaChatWithProvider` / `ariaChat` | **2**: `turn-persistence.ts:278`, `degraded-answer.ts:44` | both covered by the single router change |
| files importing the breaker | 4 → **5** | `ai-router.ts` joins `providers/anthropic.ts`, `main.ts`, `cron/daily-briefing-submit`, `health/deep` |

**NOT done, and why**

- **`src/lib/agents/base-agent.ts:53` still bypasses the breaker.** It is where `pricing` (84 credit
  400s), `generic` (42), `schedule` (28), `inventory_financing` (24) and `bas_compliance` (14) come
  from. **It is not Lane A** (Lane A owns the gateway), so it is a request, not a diff. The change is
  three lines, identical in shape to the router's: consult `isAnthropicCircuitOpen()` before
  `this.anthropic.messages.create`, and call `recordAnthropicHardDown` / `recordAnthropicFailure` in
  the catch. **Most of those agent keys last failed weeks ago**; today's live waste is the ask path,
  which this phase does cover, plus `ops_narrative` (42 today) in `src/app/api/aria/**` route handlers
  — also outside Lane A, same request.
- **The 175 allow-listed bypassers were not migrated.** That is WALL 1's ratchet, not this sprint.

**discovered**

- **A likely large contributor to the 154 `ai_outage` conversations, found by writing a test rather
  than by looking for it.** For Haiku to be reached at all, Gemini must have failed first — the chain
  is `[openai, claude, gemini, haiku]`. The ledger shows 24 Sonnet+Haiku pairs today, so on those turns
  **every** provider failed, which is precisely the outage path. In the environment where
  `ANTHROPIC_API_KEY` does not resolve, `GEMINI_API_KEY` very likely does not either — and then all
  four legs fail and the owner gets the outage reply. **Phase 2 should count exactly this.**

---

## 4 · FOUNDER CONSOLE CHECKLIST

*Nothing here is executed by this sprint. Each line says what it unblocks.*

| # | action | unblocks | note |
|---|---|---|---|
| 1 | **⚠️ ALREADY IN THE DESIRED STATE — no action needed.** Reported as asked, presence only: `ANTHROPIC_API_KEY` is **NOT set** in the shell Claude Code runs in (nor is `CLAUDE_CODE_OAUTH_TOKEN`). | nothing — it is not what is draining anything | The brief calls this *"the single change that stops testing from draining Aria's balance"*. It cannot be, because the variable is absent. Worth re-checking on your own machine if your profile differs from the shell this tool sees. |
| 2 | A separate **spend-capped** key for the server only, with a monthly limit and an alert | a runaway loop stopping itself instead of draining the balance | — |
| 3 | Decide whether Anthropic is needed at all right now | — | Gemini has served the product alone for two weeks (354 of 379 calls OK). **The honest answer needs Phase 4's ledger first; this sprint does not pre-empt it.** |
| 4 | **The two faults are separate.** A top-up fixes the credit 400s and does nothing for the auth error; fixing the auth wiring does nothing for the balance | Claude calls succeeding at all | Both are required. Confirmed, with the correction in §1a: it is one path in two environments, not two clients. |
| 5 | **DDL (RULE 10a — mine to propose, yours to approve):** drop `aria_ai_calls.model_provider`'s `DEFAULT 'anthropic'` and change `cost_usd_cents`'s default from `0` to `NULL` | the ledger telling the truth for the **175 allow-listed bypassers** too, not only for rows Phase 4 touches | Phase 4 fixes the canonical writer in code; while the defaults stand, every insert that omits the column keeps lying |
| 6 | **DDL:** add an origin/environment column to `aria_ai_calls` | attributing a failure to local vs CI vs Vercel — currently impossible (§Q5) | Optional, but it is why §1a took five queries |

---

## 4b · ONE THING THIS SPRINT'S RULES REQUIRED ME TO UNDO FROM THE LAST ONE

M18B's standing additions say: **never print a key, a key fragment, or a key length.** `RUN-M18.md`,
written yesterday before that rule existed, published a key **length** in three places as evidence
that the variable was populated.

The length has been redacted from all three — `present` is exactly as strong a claim for the argument
being made, and a length is a fragment of a secret. The surrounding findings are unchanged. Recorded
here rather than edited silently, because quietly altering a committed report is worse than the leak.

---

## 5 · OWNER-VISIBLE DIFF

**none.**

Phase 0 changed no `src/` file, no copy, no lane, no answer, no response shape. The only file added is
this log.

---

## 6 · FOUND ALREADY BUILT

*Running count across this project's sprints: this brings it to **24 of 39 runs**. (The brief says 21
of 38; M18 itself added three — its §6 rows 22, 23 and 24 — so the count was already higher before
this sprint opened.)*

| # | what this brief asked for | what was already true |
|---|---|---|
| 25 | Phase 1: "the circuit breaker the gateway never had" | **It has one.** `src/lib/aria/circuit-breaker.ts`, account-wide, already matching *both* of this sprint's error strings at line 47–51, tripping at 2-in-5-minutes, with **43 incidents since 21 Sep**. The fault is that `ai-router.ts` and `base-agent.ts` never consult it — 0 imports each. |
| 26 | Phase 0: "the allow-list shrink check exists; use it" — correct, and stronger than implied | `w1-allowlist.test.ts` is a **ratchet with an anti-vacuity assertion**, CEILING 175, already lowered twice. It also records that its own first version parsed 95 entries short because Next.js route segments contain `]`, and that the anti-vacuity check is what caught it. |

