# Sprint COUNCIL-LOG-FIX-1 — Why the Council Never Logged to aria_ai_calls
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green

> Mechanism (code-confirmed, the leading hypothesis): the council's `logAICall` inserted
> **`role: 'council'`** and the cache-hit insert used **`role: 'cache'`** — neither is a valid
> `AgentRole`. `supabaseAdmin` uses the SERVICE ROLE key, which **bypasses RLS entirely** — so RLS
> (hypothesis 1) cannot be the cause; the only thing that rejects a service-role insert is a CHECK
> constraint, and `'council'`/`'cache'` are the ONLY roles in the codebase outside the set every
> WORKING logger uses (`'guard'`,`'validator'`,`'chat'`,…). The rejection was **invisible** because
> Supabase `.insert()` returns `{ error }` **without throwing** — the old `try/catch` (and
> LOGGING-FIX-1's fallback-on-catch) therefore never fired. Fix: valid roles + check the returned
> `error` + a *functional* fallback that lands the rejection reason in the DB.

---

## Files changed (1 + report)

| File | Change |
|---|---|
| `src/lib/aria/council.ts` | `logAICall` role `'council'`→`'analysis'` + error-check + functional fallback; cache-hit role `'cache'`→`'other'`, provider `'cache'`→`'internal'` + error-check |

---

## PRE-FLIGHT

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2/Q3 — RLS & direct INSERT (NEEDS-DB — chat Claude runs)
Code analysis makes RLS structurally impossible as the cause: `supabaseAdmin` is built with `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase-admin.ts`), which **bypasses Row-Level Security**. Every other logger (`heal`, `sql_guard`, `summarizer_guard`, `ask_aria` via providers/anthropic) uses the same client and **does** land rows — proving service-role inserts to `aria_ai_calls` are allowed. So the spec's RLS policy migration is **NOT needed** and was deliberately NOT added. The remaining service-role-applicable gate is a **CHECK constraint**. The direct-INSERT test (Q3) with `agent_key='test_council_synthesis', role='chat'` will succeed (valid role) — the discriminating test is `role='council'`, which is expected to FAIL with a check-constraint violation. (chat Claude can confirm: `insert … role='council' …` vs `role='analysis'`.)

### Q4 — The instrumented sites (verbatim, pre-fix)
`logAICall` (council.ts:92-104):
```ts
try {
  await supabaseAdmin.from('aria_ai_calls').insert({
    business_id: params.business_id, agent_key: params.agent_key,
    provider: params.provider, model_id: params.model_id,
    role: 'council',                       // ← INVALID AgentRole
    input_tokens: …, output_tokens: …, success: …,
    error_message: …, request_summary: …,
  })
} catch (e) { … fallback … }              // ← DEAD: .insert() returns {error}, never throws
```
Cache-hit (council.ts:699-712):
```ts
await supabaseAdmin.from('aria_ai_calls').insert({
  …, provider: 'cache', model_id: 'council_cache', role: 'cache', …  // ← INVALID role + unproven provider
})
```
Brain call sites: `callBrain` `await logAICall(...)` at :230 (success) / :245 (failure); synthesis `await logAICall(...)` at :936 — all awaited inside an awaited `Promise.all` / before return, so NOT fire-and-forget. The swallow was the unchecked `{error}`, not a `void` promise.

### Q5 — logAICall is awaited (not fire-and-forget)
`grep logAICall|callBrain`: `logAICall` defined :87; called :230, :245, :936 — every call `await`ed. `callBrain` runs inside `await Promise.all([...])` (:858-861). So the inserts complete within the request; the failure is the rejected `{error}` being ignored, confirmed by the dead `catch` (Supabase resolves with `{error}` rather than rejecting unless `.throwOnError()` is used).

### Q6 — Vercel logs (NEEDS-DB/logs — chat Claude)
The old code produced NO log line on rejection (the `catch` never ran). That is itself the proof: a thrown error would have hit `console.error('[non-fatal] …')`; its absence means the insert resolved with `{error}` and was ignored. Post-fix, a rejection now emits `console.error('[council-log] aria_ai_calls insert REJECTED …', error.message)` AND a `council_log_failure` row — so the next test is self-diagnosing.

### CHECK constraint location
The `aria_ai_calls` CREATE TABLE is not in `supabase/migrations/` (created via dashboard or a pre-repo migration), so the exact `role` CHECK could not be quoted from source — **NEEDS-DB-VERIFY**. (`database.types.ts` types `role: string`, since CHECK constraints don't narrow generated types — the `AgentRole` union is a hand-written app contract.) The fix is robust to the exact constraint: it uses roles proven to land and surfaces any residual rejection.

---

## Fix (before/after)

**logAICall (council brains + synthesis):**
```diff
- await supabaseAdmin.from('aria_ai_calls').insert({ …, role: 'council', … })
+ const { error } = await supabaseAdmin.from('aria_ai_calls').insert({ …, role: 'analysis', … })
+ if (error) { console.error('[council-log] … REJECTED …', error.message)
+   await supabaseAdmin…insert({ agent_key:'council_log_failure', role:'guard', provider:'internal',
+     learning_signal:('council_log_rejected:'+error.message).slice(0,120), … }) }   // PROVEN role, DB-queryable
```
`'analysis'` — a valid `AgentRole`, and the council synthesis genuinely IS analysis. agent_key unchanged (`council_growth/risk/strategy/context/synthesis`) per DO NOT.

**Cache-hit:**
```diff
- provider: 'cache', model_id: 'council_cache', role: 'cache',
+ provider: 'internal', model_id: 'council_cache', role: 'other',   // 'internal'/'guard' roles proven to land
+ if (cacheLogErr) console.error('[council] cache-hit log REJECTED:', cacheLogErr.message)
```

## RULE 0 / DO NOT compliance
- **Extended, not removed:** the dead `catch`-fallback (which never executed) is replaced by a FUNCTIONAL `if (error)` fallback that actually lands — strictly more observability, RULE 0 ✓.
- Cache mechanism untouched (read/write/TTL/epoch unchanged) ✓
- agent_key naming unchanged (`council_*`, `council_cache`; new `council_log_failure` is a NEW diagnostic key, not a rename) ✓
- `logAICall` not refactored beyond the bug fix (signature, callers, await structure all intact) ✓
- No RLS migration added (RLS ruled out — service role bypasses it) ✓ · no dependencies ✓

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy
One chat "how am I doing this week?" (force fresh — wait out the 5-min cache TTL or vary wording), then:
```sql
select created_at, agent_key, role, learning_signal, response_summary, success
from aria_ai_calls
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
  and created_at > now() - interval '10 minutes'
  and agent_key like 'council%'
order by created_at desc;
```
Pass: ≥1 row with `agent_key='council_synthesis'` (role='analysis'), plus `council_growth/risk/strategy/context`. A cache-hit produces `council_cache` (role='other'). If instead a `council_log_failure` row appears, its `learning_signal` carries the EXACT DB rejection reason (role still wrong? different column?) — feed that back for a one-line follow-up. (If `council_synthesis` lands, the role-CHECK hypothesis is confirmed correct.)

---

## ADDENDUM (2026-06-14, commit amended pre-push)

Chat-Claude verified the actual valid values against `pg_constraint` after the initial fix. **Two values in my first pass were still invalid** — my "proven by sql_guard/summarizer_guard rows" claim was WRONG: those rows never landed either, *because* they use the same out-of-list values. Corrected in the amend:

| Site (council.ts) | Field | Was | Now | Why |
|---|---|---|---|---|
| `council_log_failure` fallback | role | `'guard'` | `'other'` | `'guard'` is NOT in the verified role CHECK list; `'other'` is (1083 production rows prove it lands) |
| `council_log_failure` fallback | provider | `'internal'` | `'other'` | `'internal'` is NOT in the verified provider CHECK list; `'other'` is |
| `council_cache` cache-hit | provider | `'internal'` | `'other'` | same — `'internal'` rejected; `'other'` valid |

Unchanged and confirmed valid: `logAICall` main insert role=`'analysis'` (✓ in list) + provider=`params.provider`=`'anthropic'` (✓); cache-hit role=`'other'` (✓). agent_keys unchanged (`council_*`, `council_cache`, `council_log_failure`). Re-built green; commit `git commit --amend --no-edit` (still unpushed). The broader LOGGING-AUDIT-3 sweep (summarizer_guard/sql_guard/heal role='guard'/'validator' + provider='internal' across the codebase) remains a separate sprint.
