# RUN-M18B · PROVIDER-SPEND-CONTROL

Branch `main` · autonomous run (RULE 20) · started 5 Oct 2026 · **Lane A + D**

---

## THE SUMMARY — the conversation you would otherwise have had

**Five phases, five commits, all pushed. `tsc` 0 errors, 1,893 unit tests green in 148 files, every
guard clean, `BUILD_EXIT=0` on every phase. Owner-visible diff: none, and it is asserted by tests
rather than claimed.**

### The four things that matter most

1. **🔴 The doomed calls were never costing money, and the sprint's title says otherwise.** 0 Anthropic
   successes since 21 September means **0 Anthropic spend** since 21 September — an auth error never
   reaches Anthropic, and a credit-balance 400 is a rejection, not a charge. The 346 attempts cost
   **latency, ledger noise and a wrong picture**, not dollars. The work was still worth doing (your own
   one-liner is the accurate justification: *"Aria must never call a provider it already knows is
   dead"*), but I am not reporting that I stopped a spend that was already zero. **Real spend today is
   Gemini: 354 successes of 379.**

2. **🔴 Nothing in CI or testing was draining the balance either.** `ANTHROPIC_API_KEY` is **not set**
   in Claude Code's shell, so founder console item 1 — *"the single change that stops testing from
   draining Aria's balance"* — is already in the desired state. And no unit test could spend: every
   provider key reads ABSENT under vitest. **But that was an accident, not a guard** — no `setupFiles`,
   `fetch` wide open, and one plausible `dotenv` commit from arming all 1,893 tests. Phase 3 (WALL 11)
   is what makes it a guarantee.

3. **🟡 The outage reply was wrong 155 times out of 156 — and the condition is correct.** Of the 156
   conversations ending in "every provider is down", **155 had a real model call succeed within ±2
   minutes** (144 within ±30 seconds; Gemini working in 125). But `if (degradedProvider === 'none')`
   fires only after **all four** legs fail, so it is behaving as designed. **The condition is right and
   the environment was broken.** That makes M18C justified but a *different change* from the one the
   brief imagined — not "fix the condition" but "make the degrade chain's key resolution as reliable as
   the ledger's". **It needs your go separately.**

4. **🟢 The ledger can tell you what Aria spends, from today.** Both faults were **DDL defaults**, not
   code — `model_provider DEFAULT 'anthropic'` and `cost_usd_cents DEFAULT 0` — which is why no code
   review would ever have found them. The canonical writer now sets both explicitly, so a Gemini call
   records `google` and an unmeasured cost records `NULL`. **Old rows stay wrong and are documented as
   wrong; the columns became trustworthy on 5 Oct 2026.** Dropping the defaults is DDL and therefore
   yours — founder console 5, with the SQL.

### Four corrections to the brief, and three to my own work

The brief's **evidence all held** — I re-measured every figure independently before building on it. The
corrections are to its **diagnosis**: the two faults do not split by model (§1a), the circuit breaker
already existed and already recognised both errors (§1b), both ledger faults are DDL defaults (§1c), and
the doomed calls cost nothing (§1d).

My own: a mutation that could not fail because my test mocked the module it was testing (phase 1); a
test that fired on my own documentation (phase 3); a teardown query that reported failure because a
subquery read the pre-delete snapshot (phase 4). All three are written up where they happened.

### Phases

| phase | what | commit |
|---|---|---|
| 0 | where the money actually goes — five answers, four corrections | `7f6abdaf` |
| 1 | the router joins the breaker it never consulted | `175d579d` |
| 2 | the outage lane: measured, not changed | `18991138` |
| 3 | WALL 11 — a unit test cannot spend money | `486ea5ec` |
| 4 | the ledger tells the truth | `edb663e6` |
| 5 | the founder console — nothing executed | `edb663e6` |

**The single most useful thing you can do next** is founder console 5 (drop the two column defaults) —
until then the ledger is honest only for rows that come through `logAICallSafe`, and the 175 WALL 1
bypassers keep writing `anthropic` and `0`.

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

### PHASE 0 — WHERE THE MONEY ACTUALLY GOES · commit `7f6abdaf`

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

### PHASE 1 — A DEAD PROVIDER IS SKIPPED, NOT RETRIED · commit `175d579d`

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

### PHASE 2 — THE OUTAGE LANE: MEASURED, NOT CHANGED · commit `18991138`

**SCOPE** · report the condition verbatim, add logging only, count how many of the outages had a
working provider available. **NOT-SCOPE** · the condition itself. The copy. Anything an owner reads.

**THE CONDITION, VERBATIM, WITH FILE:LINE**

`src/lib/aria/ask/strategies/main.ts:1098`:

```ts
  if (degradedProvider === 'none') {
```

with the comment immediately above it (`main.ts:1093–1097`):

```
  // ── API-RESILIENCE-1B — total outage (EVERY provider down) ───────────────
  // The fallback chain returned provider 'none' → not a single hiccup, the whole AI layer is offline.
  // Never return empty (the old bad-reply symptom) and never 500: serve a cached last-good answer if
  // a recent similar one exists (clearly labelled stale), else a calm terminal message that reassures
  // the owner their POS/payments/data are unaffected (those are Supabase/Stripe — no LLM dependency).
```

**⚠️ BOTH OF THE BRIEF'S HYPOTHESES ARE WRONG, AND THE TRUTH MATTERS MORE THAN EITHER.**

The brief offered two possibilities: *"it checks all providers but the configured list has one entry,
or it fires on the first failure."*

Traced: `degradedProvider` is assigned at `main.ts:995` and `main.ts:1070`, both from
`degradedGroundedAnswer()` → `src/lib/aria/degraded-answer.ts:44` → `ariaChatWithProvider('chat', …)`.
`TASK_PROVIDERS.chat === 'claude'`, so the sequence is **`[claude, gemini, openai, haiku]`** and
`'none'` is returned only after **all four legs have failed** (`ai-router.ts:327`).

**So the condition is correct.** It does not fire on the first failure, and the list has four entries,
not one. **The outage reply fires exactly when it says it does — and it was still wrong 155 times.**

**THE NUMBER THE BRIEF SAYS DECIDES M18C**

Over the **156** conversations whose `last_intent` is `ai_outage` (now 156; the brief measured 154):

| window around the outage turn | conversations with a **real model** success (`google`/`openai`/`anthropic`) |
|---|---|
| ±2 minutes | **155 of 156** |
| ±30 seconds | **144 of 156** |

and which provider was demonstrably working within ±30s (overlapping):

| provider | outage conversations where it was working |
|---|---|
| `google` | **125** |
| `anthropic` | 81 |
| `openai` | 26 |

⚠️ **I tightened this before reporting it.** My first query counted *any* successful `aria_ai_calls`
row, which includes `provider: 'other'` audit rows — `health_signals`, `open_loops`, `council_cache` —
that are not model calls at all. Counting those would have inflated the figure and been exactly the
measurement error RULE 16 #5 is about. Restricted to real model providers, the number barely moved
(155/156 at ±2 min), which is itself worth knowing: it is not an artefact of loose counting.

**What this means, stated plainly: the condition is right and the environment was broken.** All four
legs really did fail on those turns — because in the environment where `ANTHROPIC_API_KEY` does not
resolve, the other keys very likely do not either (Phase 1's discovery, reached independently). The
owner was told "every provider is down" while a provider was answering *for a different call* seconds
later. **M18C is strongly justified, and it is a different change from the one the brief imagined:**
not "fix the condition", but "make the degrade chain's key resolution as reliable as the ledger's".

**files changed**

| path | +/− | what |
|---|---|---|
| `src/lib/ai-router.ts` | +31 | `ProviderAttempt`, and the trail returned from `ariaChatWithProvider` |
| `src/lib/aria/degraded-answer.ts` | +7 / −3 | passes the trail out, on **both** return paths |
| `src/lib/aria/ask/strategies/main.ts` | +36 / −1 | the outage log line, plus one countable `aria_ai_calls` row |
| `src/lib/aria/outage-attempts.test.ts` | **new**, 136 | 5 tests |

**WHAT THE LOG NOW SAYS.** Before, the outage line carried one field — whether a cached answer was
used:

```ts
console.error('[aria/ask] TOTAL OUTAGE served', JSON.stringify({ cached: isCached }), 'business', bid)
```

Now it carries which providers were tried and what each returned, and writes **one countable row**
(`agent_key: 'ask_aria'`, `request_summary: 'total_outage'`, `response_summary: 'tried=claude:… |
gemini:… | openai:… | haiku:…'`) so *"how often does a total outage fire, and what had we tried"*
becomes a query instead of a log search. `role`/`provider` are CHECK-legal.

**⚠️ NOTHING BRANCHES ON THE TRAIL.** It is read by a `console.error` and one diagnostic insert. The
`if (degradedProvider === 'none')` condition is byte-for-byte unchanged, and so are both `reply`
strings.

**VERIFY — pasted**

```
 Test Files  146 passed (146)
      Tests  1868 passed (1868)
```

- the trail records **all four legs in chain order** — `['claude','gemini','openai','haiku']` — and the
  *distinct* error each returned, because "it broke" and "an auth error on one, a bad-key 400 on
  another" are different diagnoses;
- it records the **success** too, so a one-entry trail is unambiguous between "the first provider
  worked" and "we only tried one";
- **the all-providers-down reply is asserted `toBe` the literal string**, not `toContain`. A substring
  check would pass through any rewording, which is the regression the hard rule forbids;
- a working provider still answers normally, so the outage copy is not newly reachable.

**MUTATION CHECK — 5 of 5 red, after one stayed green and found a real gap**

```
mutation                                       verdict
--------------------------------------------------------------------------
the attempt trail stops recording failures     RED - 4 failed
the trail stops recording the success          RED - 3 failed
the trail loses the per-leg error text         RED - 2 failed
the all-down reply wording is changed          RED - 1 failed
degraded-answer stops passing the trail out    RED - 1 failed
--------------------------------------------------------------------------
5 of 5 went red. All verified.
```

**`degraded-answer stops passing the trail out` came back `STILL GREEN` first**, and the test was at
fault: I asserted `attempts` on the all-down path but not on the **success** path. So a failover that
worked could have recorded nothing about the leg it skipped to get there — the single most useful line
for diagnosing why a provider is being skipped at all. Assertion added; it now goes red.

**The 4th mutation is the one worth noting**: changing the all-down wording from *"Give it another go
in a bit."* to *"Please try again shortly."* turns the suite red. That is the hard rule enforced by a
test rather than by my word.

**SIBLING SWEEP**

| searched for | hits | what was done |
|---|---|---|
| other producers of the outage reply | **1** — `degraded-answer.ts:53`, reached only via `main.ts:1098` | both covered; the string is pinned in the test |
| callers of `degradedGroundedAnswer` | **2**, both in `main.ts` (:995 circuit-open, :1070 tool-loop failure) | both now capture the trail |
| other `ariaChatWithProvider` destructures that would break on a new field | **2** (`turn-persistence.ts:278`, `degraded-answer.ts:44`) | additive field, neither affected; `tsc` confirms |

**NOT done, and why**

- **The condition was not changed.** The brief forbids it and so does RULE 18: it alters what a fifth
  of conversations say. **M18C is justified by the 155/156 above and needs the founder's go.**
- **No backfill of the 156.** They record what happened.
- **The `aria_ai_calls` origin column** that would let a failure be attributed to local vs CI vs Vercel
  is still absent — it is why "all four legs failed" cannot be tied to a specific environment from the
  data. Founder console 6.

**discovered**

- The outage reply has two variants and only one is the "all down" text: when a recent similar answer
  exists, `findCachedAnswer` serves it labelled stale. Of the 156, the split between cached and
  terminal is not recorded anywhere — the new `request_summary: 'total_outage:cached'` suffix starts
  recording it from now, forward-only.
- `main.ts:1083` already logs a `cross_provider_fallback` row when a failover *succeeds*. The outage
  case — the failover that failed — was the one without a row. That asymmetry is now gone.

---

### PHASE 3 — TESTS CANNOT SPEND MONEY (WALL 11) · commit `486ea5ec`

**SCOPE** · convert the accident at the top of this log into a guarantee. **Lane D** (test config).
**NOT-SCOPE** · `check:live`, which stays live by design.

**files changed**

| path | +/− | what |
|---|---|---|
| `vitest.setup.ts` | **new**, 135 | WALL 11: scrubs provider keys, blocks provider hosts |
| `vitest.config.ts` | +9 | `setupFiles`, with the one-commit warning in a comment |
| `src/lib/live-model-guard.test.ts` | **new**, 112 | 12 tests, by **tripping** the guard |
| `src/lib/__fixtures__/m18b-module-scope-key.ts` | **new**, 16 | a module that reads a key at import time |

**TWO MECHANISMS, AND THE SECOND IS THE ONE THAT SURVIVES A FUTURE MISTAKE**

1. **The provider keys are scrubbed from `process.env`**, so a client cannot be *built* with one even
   if the environment supplies it — CI secrets, a shell export, or the `dotenv` line someone adds to
   make a single integration test work. Scrubbed at setup **and** re-scrubbed in a `beforeEach`,
   because `vi.stubEnv`, a stray assignment, or a module setting a default on import can put one back
   mid-suite.
2. **`fetch` to a provider host throws**, so a client built with a hard-coded or inlined key still
   cannot reach anyone. Ten hosts, matched on hostname including subdomains.

**The failure names the host, the file AND the test**, because *"something tried to call Anthropic"*
across 147 files is not a diagnosis:

```
M18B WALL 11 — a unit test tried to reach a LIVE MODEL PROVIDER (api.anthropic.com).
  in: src/lib/m18b-throwaway-live.test.ts › a test that tries to spend money > calls Anthropic for real
  Unit tests must never spend money. Mock the provider, or the module that calls it —
  every existing test in this repo does (see e.g. src/lib/ai-router-breaker.test.ts).
  `npm run check:live` is where real calls belong: once per sprint, on purpose.
  Deliberate exception, used by nothing in CI: ARIA_ALLOW_LIVE_MODELS=1
```

**⚠️ PROVIDER HOSTS ONLY, NOT ALL NETWORKING** — a blanket `fetch` ban would fail tests that
legitimately stub or call non-provider URLs, and a guard people must disable to get work done is one
that gets disabled permanently. A test asserts a non-provider host is *not* blocked.

**⚠️ SUPABASE KEYS ARE DELIBERATELY NOT SCRUBBED.** They are not a spend risk, tests mock the client,
and removing them could change behaviour where they are legitimately provided. This guard is about
money.

**⚠️ NOT A KEY, A FRAGMENT OR A LENGTH ANYWHERE.** The setup holds a list of variable **names** and
never reads, logs or compares a value — this sprint's standing rule, applied to the file whose whole
job is handling keys.

**VERIFY — BOTH RUNS PASTED, as the brief asks**

A throwaway test that tries two live calls. **Run 1 — the guard fires, suite fails:**

```
VITEST_EXIT=1
⎯⎯⎯ Failed Tests 2 ⎯⎯⎯
Error: M18B WALL 11 — a unit test tried to reach a LIVE MODEL PROVIDER (api.anthropic.com).
  in: src/lib/m18b-throwaway-live.test.ts › a test that tries to spend money > calls Anthropic for real
Error: M18B WALL 11 — a unit test tried to reach a LIVE MODEL PROVIDER (generativelanguage.googleapis.com).
  in: src/lib/m18b-throwaway-live.test.ts › a test that tries to spend money > calls Gemini for real
      Tests  2 failed (2)
```

**Run 2 — throwaway deleted, suite green:**

```
VITEST_EXIT=0
 Test Files  147 passed (147)
      Tests  1880 passed (1880)
```

**And the run that matters most — the whole suite with keys deliberately exported into the process:**

```
$ ANTHROPIC_API_KEY=pretend OPENAI_API_KEY=pretend GEMINI_API_KEY=pretend npx vitest run
VITEST_WITH_KEYS_EXIT=0
 Test Files  147 passed (147)
      Tests  1880 passed (1880)
```

Identical. **The guard holds in the environment it exists for and breaks nothing.** A probe test under
that same run reported `ANTHROPIC_API_KEY=ABSENT | OPENAI_API_KEY=ABSENT | GEMINI_API_KEY=ABSENT` — the
scrub reaching into a process that was handed real-looking keys.

**MUTATION CHECK — 6 of 6 red, and getting there corrected the harness twice**

```
mutation                                       verdict
------------------------------------------------------------------------
the fetch guard is removed entirely            RED - 5 failed
subdomains are no longer matched                RED - 1 failed
the key scrub at startup is removed             RED - 1 failed
the per-test re-scrub is removed                RED - 1 failed
the error stops naming the test file            RED - 1 failed
the setup file is unwired from the config       RED - 9 failed
------------------------------------------------------------------------
6 of 6 went red. All verified.
```

**`the key scrub at startup is removed` stayed GREEN twice, for two different reasons, and both were
mine:**

1. First because the `beforeEach` re-scrub masked it — the two looked redundant and one was untested.
   They are **not** redundant: a module that captures a key when it is **imported** runs before any
   hook, and this repo has real ones (`base-agent.ts:53`, several route modules at module scope). The
   `__fixtures__/m18b-module-scope-key.ts` fixture plus a **static** import is what makes the
   setup-time scrub falsifiable.
2. Then because **in this environment the key is absent anyway**, so no scrub is observable. The
   mutation harness now runs every mutation **with provider keys present in the subprocess env** —
   which is the environment the guard exists for, so the check finally measures the thing it claims to.

**A third correction, to my own probe rather than to a test:** I first reported that the dotenv scan
"STILL GREEN (bad)" against a real dotenv reference. It had not failed — my probe inserted
`require('dotenv')`, which broke config *loading*, and my detection only looked for `Tests N failed`.
Re-probed with a config-valid mutation (`env: { ARIA_FAKE: '.env.local' }`): **RED, 1 failed, exit 1.**
*A diagnostic that cannot tell "the thing passed" from "the run never happened" is worse than none.*

**And my own test fired on my own documentation** — the dotenv assertion matched the warning comment I
had just written into `vitest.config.ts` explaining why dotenv must never be added. Fixed by stripping
comments before matching, the convention this repo already uses (`provenance-chain.test.ts`), and then
**proven to still bite** on a real reference. Precisely the failure M18's one-exit guard hit on its own
header.

**NO FIXTURES WERE BUILT, AND THAT IS A FINDING RATHER THAN AN OMISSION**

The brief asks for recorded responses: *"Record once, commit the fixtures, replay forever."*

**Nothing needed them.** The full suite — 147 files, 1,880 tests — passes with the guard active and
with keys present. That is proof by execution that **no existing test wanted a live provider**: every
one already mocks the provider or the module that calls it. Building a recorder now would be
scaffolding with no consumer, which RULE 9 forbids shipping and which would rot before its first use.
The guard's own message points the next person at the pattern (`ai-router-breaker.test.ts`), and if a
future test genuinely needs replay, that is the moment to build it.

**THE ESCAPE HATCH, verified rather than asserted**

`ARIA_ALLOW_LIVE_MODELS=1`. Checked: **nothing in `.github/` or `package.json` sets it.** And
`check:live` does not need it — it runs under Playwright with
`globalSetup: ./tests/check-live/global-setup.ts` and never loads `vitest.setup.ts`, so it is
untouched. Its job is to be live, once per sprint, on purpose.

**SIBLING SWEEP**

| searched for | hits | what was done |
|---|---|---|
| other test runners that could reach a provider | **2**: Playwright `check:live` and the smoke suite | `check:live` is **meant** to be live. The smoke suite runs a real production build and is Lane D-adjacent; it is named here, unchanged, because it reaches the app rather than a provider directly |
| anything setting `ARIA_ALLOW_LIVE_MODELS` | **0** | as the brief requires |
| `dotenv` / `loadEnv` already in a vitest path | **0** | and a test now fails if one appears |

**gates** · `tsc` 0 errors · `vitest` 1880 passed in 147 files · same with keys present · canon rail
clean · `BUILD_EXIT` in the commit line

**NOT done, and why**

- **No response-recording fixtures.** Nothing needs them; see above.
- **`tests/smoke/**` was not given the guard.** It drives a real production build over HTTP, so the
  provider call happens in the *server* process, not the test process — a `fetch` patch in the test
  would not see it. Blocking it there would also defeat the suite's purpose. Named, not touched.
- **The 180 raw client constructions were not migrated** to the gateway; that is WALL 1's ratchet.

**discovered**

- `environment: 'node'` plus no `setupFiles` meant the suite had **no** global hooks of any kind before
  this. Anything a future sprint wants to enforce suite-wide now has a place to live.

---

### PHASE 4 — THE LEDGER TELLS THE TRUTH · commit `edb663e6`

**SCOPE** · the three items the brief lists: `model_provider` derived, `cost_usd_cents` NULL-not-0, no
backfill. **NOT-SCOPE** · DDL (RULE 10a) · any new ledger row.

**⚠️ BOTH FAULTS WERE DDL DEFAULTS, WHICH IS WHY NO CODE REVIEW WOULD EVER HAVE FOUND THEM**

```
model_provider   DEFAULT 'anthropic'::text
cost_usd_cents   DEFAULT 0
```

Over the 929 calls since 21 September: `model_provider` had **1 distinct value** — the literal
`anthropic` — across 547 `gemini-2.5-flash` calls and 27 `gpt-4o-mini` calls; `sum(cost_usd_cents)`
was **0**, with 885 rows literally `0` and 44 `NULL`. Nothing in the code said `anthropic` for those
rows. **The database filled it in.**

**AND `provider` WAS ALREADY CORRECT ALL ALONG — which is what made the fix one line.**

| `provider` | rows | models seen |
|---|---|---|
| `google` | 547 | `gemini-2.5-flash` |
| `anthropic` | 388 | `claude-haiku-4-5`, `claude-sonnet-4-5` |
| `other` | 219 | `council_cache`, `openai/gpt-4o-mini` |
| `openai` | 27 | `gpt-4o-mini` |

`provider` is CHECK-constrained and set per call from the client that was used. So `model_provider`
defaults to **it** rather than to a literal, and every row the canonical writer makes is fixed at once.

**files changed**

| path | +/− | what |
|---|---|---|
| `src/lib/aria/log-ai-call.ts` | +44 / −1 | both columns written explicitly; `model_provider?`, `cost_usd_cents: number \| null` |
| `src/lib/ai-router.ts` | +13 / −1 | `provider`/`model_provider` derived from `model_id` |
| `src/lib/aria/ledger-truth.test.ts` | **new**, 133 | 11 tests |
| `src/lib/ai-router-breaker.test.ts` | +40 | 2 more — the router's own ledger rows |

**VERIFY — the rows, pasted, as the brief asks**

Two halves, and I am explicit that it is two rather than one end-to-end call, because Anthropic cannot
currently succeed at all (founder console 1) so a real paired call is not available:

**Half 1 — the payload the code now sends** (11 unit tests, mocked database). **Half 2 — the database
storing it**, which is the half that proves an explicit value beats a default. Proof rows inserted with
the exact shape `logAICallSafe` now produces, read back, then torn down:

| provider | model_provider | model_id | success | cost_usd_cents | cost is NULL not 0 |
|---|---|---|---|---|---|
| `google` | **`google`** | `gemini-2.5-flash` | true | `null` | **true** |
| `anthropic` | `anthropic` | `claude-haiku-4-5-20251001` | false | `null` | **true** |

**The first row is the whole phase**: a Gemini call stored as `google`, on a column whose default would
have written `anthropic`, with a cost of `NULL` on a column whose default would have written `0`.

Torn down afterwards (RULE 10a blesses proof rows that you remove): `proof_rows_remaining: 0`. ⚠️ My
first teardown query reported `still_present: 2` — a subquery in the same statement as the `DELETE`
reads the pre-delete MVCC snapshot. Re-checked in a separate statement: **0**. Another diagnostic that
would have reported a false failure if I had trusted it.

**MUTATION CHECK — 5 of 5 red, after one could not fail and had to be rebuilt**

```
mutation                                               verdict
--------------------------------------------------------------------------------------
model_provider goes back to the column default         RED - 4 failed
model_provider becomes a literal again                  RED - 2 failed
an unmeasured cost goes back to the 0 default           RED - 1 failed
a real measured 0 is turned into null                   RED - 1 failed
the router's two provider columns disagree with the …   RED - 2 failed
--------------------------------------------------------------------------------------
5 of 5 went red. All verified.
```

**`the router hard-codes provider anthropic again` STAYED GREEN, and the finding is about my own
change rather than the code.** That insert lives in a function called **`logClaudeCall`** — it is
Anthropic-only *by design*, reached only from `callClaude` and `callHaiku`. So the literal
`provider: 'anthropic'` was **correct by construction**, and replacing it with a derivation is a
**hardening, not a bug fix** — unobservable today, and therefore unfalsifiable.

I kept the derivation (the brief asks for "never a literal", and a literal one edit from being wrong is
how `model_provider` came to describe 547 Gemini calls) and replaced the mutation with one that tests
the invariant the code **actually** guarantees: that both provider columns agree with the row's own
`model_id`. That form goes red. **Saying "5 of 5 red" without this paragraph would have been the
dishonest version of the same table.**

**⚠️ THE BIGGEST REMAINING SPEND-VISIBILITY GAP, FOUND HERE AND DELIBERATELY NOT CLOSED**

`ai-router.ts` logs **only its Anthropic legs**. `callGemini` and `callOpenAI` write **no ledger row at
all**. So on the ask path, the calls that actually *succeed* — and therefore the ones that actually
cost money — are the ones not recorded.

That is squarely "Aria cannot tell you what it spends", and it is tempting. **It is not in Phase 4's
three bullets**, it adds *new rows* to the ledger (changing row volume and therefore every comparison
made against it), and `callGemini` returns no token counts so every such row would carry
`cost_usd_cents: NULL`. Adding it is a real improvement and a real decision — **founder console item 7**,
with the shape written out. Doing it unasked inside a phase scoped to two columns is how a spend sprint
becomes a ledger rewrite.

**SIBLING SWEEP**

| searched for | hits | what was done |
|---|---|---|
| writers of `model_provider` | **5**, all literals — `deliverable-email:90` and `deliverable-pdf:37` (`'other'`), `widget/chat:226`, `deliverables.ts:796`, `parallel-orchestrator.ts:119` (`'anthropic'`) | **not changed** — all outside Lane A, and each is correct for its own call. Named here so the count is known |
| readers of `cost_usd_cents` | **8 files** | **every one already NULL-safe**: `?? 0`, `Number(…) \| 0`, and `.gt('cost_usd_cents', 0)` which correctly *excludes* unknowns. Checked before changing 0 → NULL, not after |
| ledger writers that bypass `logAICallSafe` | the 175 WALL 1 bypassers + `ai-router.ts`'s own insert | the router's is fixed; the rest keep taking the defaults until the DDL lands |

**gates** · `tsc` 0 errors · `vitest` 1893 passed in 148 files · canon rail clean · `BUILD_EXIT` in the
commit line

**NOT done, and why**

- **The DDL defaults still stand.** RULE 10a: I do not write schema. Until they are dropped, **every
  insert that does not come through `logAICallSafe` keeps lying** — founder console 5, with the SQL.
- **No backfill.** 885 rows still say `0` and 1,181 still say `model_provider = 'anthropic'`. They are
  wrong and are **documented as wrong, with the date the columns became trustworthy: 5 Oct 2026.**
  Rewriting them would be inventing figures, which GROUNDING-TEETH forbids one layer up.
- **`provider: 'other'` on 219 rows including real `openai/gpt-4o-mini` calls** is a pre-existing
  inaccuracy in `provider` itself, per call site. Named, not swept.
- **No new ledger rows** (see the gap above).

**discovered**

- `computeCostCentsOrNull()` already existed and already returned `null` for an unknown model —
  `ai-router.ts:29` was already using it. **The NULL-not-0 principle was already implemented one layer
  down and then thrown away by a column default.** That is the 27th thing this project has found
  already built.

---

### PHASE 5 — THE FOUNDER CONSOLE · nothing executed

**SCOPE** · a checklist, written down. **Nothing in this phase runs.** The four items the brief lists
are below with what each unblocks and, where I could check something without touching a secret, what I
found. Items 5–9 are additions this run discovered.

| # | the brief's item | status after this run |
|---|---|---|
| 1 | *"Claude Code should bill the Max subscription, not the API. If `ANTHROPIC_API_KEY` is set in the shell Claude Code runs in, it bills the API instead. `/login` switches it."* | **⚠️ ALREADY IN THE DESIRED STATE — nothing to do.** Checked, presence only, never a value: `ANTHROPIC_API_KEY` is **NOT set** in the shell Claude Code runs in, and neither is `CLAUDE_CODE_OAUTH_TOKEN`. So this is not what has been draining anything. Worth a second look on your own machine if your profile differs from the shell this tool sees. |
| 2 | a separate **spend-capped** key for the server only, monthly limit + alert | **Still worth doing**, and it is the only item here that bounds a *future* runaway. Nothing in this sprint can substitute for it. |
| 3 | decide whether Anthropic is needed at all right now | **Not pre-empted, as instructed.** What this run adds is the two facts the decision needs: Gemini has served **354 of 379** calls successfully since 21 Sep, and Anthropic **0 of 346**. Phase 4 makes the next fortnight's ledger trustworthy, so the same question asked in two weeks will have a real cost column behind it. |
| 4 | *"the two faults are separate"* | **Confirmed, with a correction.** A top-up fixes the credit 400s and does nothing for the auth error; fixing the auth wiring does nothing for the balance. The correction (§1a) is that they are **not two code paths** — the same `agent_key` and `model_id` produced a credit 400 at 00:36:44 and an auth error at 00:38:51, so it is one path in two environment states. |

**And the one thing I would put above all four:** §1d. **The doomed calls were never costing money.** 0
Anthropic successes since 21 September means 0 Anthropic spend. The 346 attempts cost latency, ledger
noise and a wrong picture. Real spend today is Gemini. So this sprint bought **speed and clarity**, and
the actual money question is item 3 — which is now answerable for the first time.

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
| 7 | **`ai-router.ts` logs only its Anthropic legs — `callGemini` and `callOpenAI` write NO ledger row at all** | knowing what Aria actually spends. On the ask path the calls that SUCCEED (and therefore cost money) are the ones not recorded | Found in phase 4 and deliberately not closed: it adds new rows, changing every comparison made against the ledger, and `callGemini` returns no token counts so each row would carry `cost_usd_cents: NULL`. A real improvement and a real decision |
| 8 | **`base-agent.ts:53` and `src/app/api/aria/**` route handlers still bypass the circuit breaker** | the rest of the doomed-call latency | Phase 1 covers the ask path. The change is three lines each, written out in §PHASE 1. Outside Lane A |
| 9 | **M18C · OUTAGE-TRUTH — justified, and it is NOT the change the brief imagined** | 19.9% of conversations ending in "every provider is down" | Phase 2 measured **155 of 156** with a real model success within ±2 min (144 within ±30s). But the CONDITION is correct — it fires only after all four legs fail. So M18C is *"make the degrade chain's key resolution as reliable as the ledger's"*, not *"fix the condition"*. Needs your go, separately |

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

# none.

Across all five phases: **no copy, no lane, no answer, no prompt, no response shape, no status code.**

It is asserted rather than claimed, in three places:

| what could have changed | the assertion that holds it |
|---|---|
| which provider answers a turn | Phase 1 runs the identical scenario with the breaker closed and open and asserts **same provider, same text** — `gemini` both times, 1 Anthropic call then 0 |
| what an owner reads when everything is down | Phase 2 asserts the all-down reply `toBe` the **literal string**, not `toContain`. Mutation: changing *"Give it another go in a bit."* to *"Please try again shortly."* turns the suite **red** |
| when the outage reply appears at all | Phase 2 asserts a working Gemini still answers normally, so the outage copy is not newly reachable |

The only differences a user could notice are the two the brief permits: **some turns return sooner**
(two doomed Anthropic round-trips removed from in front of the provider that was always going to
answer), and **a failover that would have happened anyway happens faster**. Same model, same words.

**Three things were PARKED rather than built, each because doing them would have changed what an owner
reads:** the outage condition (M18C), applying `verifyResponse`'s `safeResponse` (carried over from
M18), and anything touching prompts. None of them was a judgement call about difficulty.

---

## 6 · FOUND ALREADY BUILT

*Running count across this project's sprints: this brings it to **24 of 39 runs**. (The brief says 21
of 38; M18 itself added three — its §6 rows 22, 23 and 24 — so the count was already higher before
this sprint opened.)*

| # | what this brief asked for | what was already true |
|---|---|---|
| 25 | Phase 1: "the circuit breaker the gateway never had" | **It has one.** `src/lib/aria/circuit-breaker.ts`, account-wide, already matching *both* of this sprint's error strings at line 47–51, tripping at 2-in-5-minutes, with **43 incidents since 21 Sep**. The fault is that `ai-router.ts` and `base-agent.ts` never consult it — 0 imports each. |
| 26 | Phase 0: "the allow-list shrink check exists; use it" — correct, and stronger than implied | `w1-allowlist.test.ts` is a **ratchet with an anti-vacuity assertion**, CEILING 175, already lowered twice. It also records that its own first version parsed 95 entries short because Next.js route segments contain `]`, and that the anti-vacuity check is what caught it. |
| 27 | Phase 4: `cost_usd_cents` should be NULL when unknown, never 0 | **`computeCostCentsOrNull()` already existed and already returned `null` for an unknown model**, and `ai-router.ts:29` was already calling it. The principle was implemented one layer down and then thrown away by a column default. |
| 28 | Phase 3: "tests must not be able to spend money" | Half true already — the suite could not spend, **but only because no key was loaded.** No guard, no `setupFiles`, `fetch` wide open. The protection existed by accident, which is the thing the phase actually replaced. |

