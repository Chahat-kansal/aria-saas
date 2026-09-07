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
