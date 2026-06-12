# Sprint LOGGING-FIX-1 — Council Cache-Hit Logging + Synthesis Confirmation + served_by
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green
**Dependency:** LOGGING-AUDIT-1 (`97d3ce49`) pushed.

> Session note: an interrupted SUMMARIZER-FIX-1 had left uncommitted edits in 4 files (incl.
> route.ts, which this sprint also touches). Per "Run LOGGING-FIX-1 only" + ONE commit, those
> uncommitted edits were reverted (`git checkout` + delete of the new validate-summary.ts) BEFORE
> this sprint's work — verified via git status. SUMMARIZER-FIX-1 was ~90% complete and can be
> re-run cleanly later; nothing of it rides in this commit.

---

## Files changed (2 + report)

| File | Parts |
|---|---|
| `src/lib/aria/council.ts` | Part 1 (cache-hit logging + TTL-remaining + served_from_cache flag), Part 2 (catch-path synthesis log + logAICall failure visibility) |
| `src/app/api/aria/ask/route.ts` | Part 3 (`served_by` on deliverable / council / main returns) |

---

## PRE-FLIGHT (verbatim quotes)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2a — The `return cached` site (council.ts:672-679, pre-edit)
```ts
  if (mode === 'ask_aria') {
    const cached = await readCouncilCache(businessId, hash)
    if (cached) {
      console.log('[council] cache HIT — epoch:', dataEpoch, 'hash:', hash, 'business:', businessId)
      return cached
    }
    console.log('[council] cache MISS — epoch:', dataEpoch, 'hash:', hash, 'business:', businessId)
  }
```

### Q2b — Synthesis success path (council.ts:921-988, condensed verbatim)
```ts
  try {
    const res = await callWithTimeout(() => withBackoff(() => client.messages.create({
        model: synthesisModel, max_tokens: 6000, temperature: 0.2,
        system: synthesisSystemPrompt, messages: [{ role: 'user', content: synthesisInput }],
      })), 45000, 'council synthesis')
    const text = …; const parsed = safeParseJSON(text)
    await logAICall({ agent_key: 'council_synthesis', model_id: synthesisModel, provider: 'anthropic',
      input_tokens: …, output_tokens: …, success: !!parsed, business_id: businessId,
      request_summary: activeQuestion.slice(0, 100) })
    if (!parsed) { return { … synthesis_succeeded: false, fell_back: true … } }   // ← AFTER logAICall ✓
    const councilResult: CouncilOutput = { … }
    if (mode === 'ask_aria') void writeCouncilCache(businessId, hash, councilResult)
    return councilResult
  } catch (e) {
    // Synthesis failed — build fallback from brain outputs directly
    const fallbackBriefing = […].filter(Boolean).join('. ')
    return { final_briefing: fallbackBriefing || 'Council completed with partial data.', … }   // ← ZERO LOGGING (pre-fix)
  }
```
**Finding:** the SUCCESS path always reaches `logAICall` BEFORE any return — but the **catch path (synthesis timeout/API failure, council.ts:989-1003) returned a CouncilOutput with ZERO logging**. Combined with logAICall's old catch (`console.error('[non-fatal]', e)` — reason swallowed, no fallback row), these are the two confirmed leak points the spec's Part 2 anticipated. Both fixed.

### Q2c — callBrain call sites inside the council path
council.ts:858-861 — four parallel `callBrain(client, HAIKU, …, businessId, 18000, activeQuestion.slice(0, 100))` invocations (growth/risk/strategy/context); each logs via logAICall on success (:230) AND failure (:245).

### Q3 — The logger (it lives in council.ts, not a callBrain.ts) — insert verbatim (pre-edit)
```ts
async function logAICall(params: { agent_key: string; model_id: string; provider: string
  input_tokens: number; output_tokens: number; success: boolean
  business_id: string; error_message?: string; request_summary?: string }) {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: params.business_id, agent_key: params.agent_key, provider: params.provider,
      model_id: params.model_id, role: 'council',
      input_tokens: params.input_tokens, output_tokens: params.output_tokens,
      success: params.success, error_message: params.error_message ?? null,
      request_summary: params.request_summary ?? null,
    })
  } catch (e) { console.error('[non-fatal]', e) }     // ← reason swallowed (pre-fix)
}
```

### Q4 — council_cache touchpoints (grep verbatim)
```
council.ts:559 readCouncilCache → .from('council_cache').select('result')…gt('expires_at', now)
council.ts:572 writeCouncilCache → .from('council_cache').upsert({business_id, intent_hash, result, expires_at: now+5min})
council.ts:673 the ONLY read call site (mode === 'ask_aria' gate)
```
Cache HIT location correctly identified ✓ (single site).

### Q5 — Response payload shapes (route.ts, pre-edit)
- Deliverable return :579-592 — `{response, conversation_id, intent:'deliverable', …, deliverable:{…}, blocks, healed, heal_reason}`
- Council return :749-760 — `{blocks, followups, used_council:true, response, conversation_id, intent, action, cost_usd_cents, downloads, tool_calls}`
- Main final return :1809-1826 — `{response, …, blocks, used_council:false, ai_mode, model_used, sonnet_*, healed, heal_reason}`

---

## Per-part insertions (before/after)

### Part 1 — council.ts:672-679 → cache-hit row
`readCouncilCache` now also returns `expires_at` (select extended; return shape `{result, expiresAt}` — internal function, single caller updated). At the HIT site, BEFORE returning:
```ts
+ const ttlRemaining = Math.max(0, Math.round((new Date(cached.expiresAt).getTime() - Date.now()) / 1000))
+ try { await supabaseAdmin.from('aria_ai_calls').insert({
+     business_id, agent_key: 'council_cache', provider: 'cache', model_id: 'council_cache',
+     role: 'cache', input_tokens: 0, output_tokens: 0, latency_ms: Date.now() - start, success: true,
+     request_summary: activeQuestion.slice(0, 100),
+     response_summary: 'cache_hit/ttl_remaining_seconds:' + ttlRemaining,
+     learning_signal: 'council_cache_hit' }) } catch (e) { console.error(…non-fatal…) }
- return cached
+ return { ...cached.result, served_from_cache: true }
```
(`served_from_cache?: boolean` added to `CouncilResult` — optional, additive.)

### Part 2 — two leak points closed
1. **Synthesis catch path** (council.ts:989+): `logAICall({agent_key:'council_synthesis', success:false, error_message:(e).message.slice(0,200), request_summary:activeQuestion.slice(0,100), …})` inserted at the top of the catch, before the fallback build. A failed synthesis is now visible.
2. **logAICall catch** enhanced: `console.error` now names the failing agent_key + reason, then inserts a minimal fallback row `agent_key='council_synthesis_log_failure'`, `learning_signal='synthesis_logger_failed:<reason>'.slice(0,120)`, `request_summary=<original agent_key>` — double-wrapped so a second failure is still only console noise.

### Part 3 — route.ts served_by (debug-only; UI ignores)
- Deliverable return (:~593): `served_by: 'deliverable'`
- Council return (:~761): `served_by: council.served_from_cache ? 'council_cache' : 'council_fresh'`
- Main final return (:~1830): `served_by: isBrevityQuestion ? 'brevity' : 'main_brain'` (`isBrevityQuestion` is function-scoped, declared before the council branch — in scope ✓; note: 'brevity' covers BOTH BREVITY_SIGNALS and SHORT_FACTUAL diverts, matching the gate variable)
- Other early returns (plan_saved, rate-limit, background-task, GROUNDING-TEETH no-data) intentionally unlabelled — outside the spec's 5 values.

### Part 4 — DEFERRED (explicit reason)
No build/deploy timestamp is available at runtime: Vercel exposes `VERCEL_GIT_COMMIT_SHA` but **no deploy-time env var**, and embedding a build timestamp requires a `next.config` define/env injection — a config change beyond this sprint's additive scope. Mitigation already in place: the cache's 5-minute TTL bounds post-deploy staleness to ≤5 min, and the epoch key rotates on every new sale. Deferred to a future sprint (suggest CACHE-EPOCH-2: add `NEXT_PUBLIC_BUILD_ID` define + compare in readCouncilCache).

## Additive-only confirmation (RULE 0)
Cache mechanism untouched (TTL still 5 min, epoch key unchanged, write path unchanged); synthesis logic untouched (only logging added); no agent_key in use modified — `council_cache`, `council_synthesis_log_failure` are NEW; `served_by` is a NEW response field the UI ignores; `served_from_cache` is a NEW optional interface field; `readCouncilCache`'s richer return is internal with its single caller updated. Nothing removed.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Test plan (founder, post-deploy — 4 questions)
1. "just tell me revenue today" → `ask_aria` row (brevity fall-through; response served_by='brevity')
2. "how am I doing this week?" (fresh) → 4× `council_<brain>` + 1× `council_synthesis` rows + cache write (served_by='council_fresh')
3. same question again within 5 min → `council_cache` row, `learning_signal='council_cache_hit'`, response_summary shows ttl_remaining (served_by='council_cache')
4. "show me a chart of weekly revenue" → `deliverable` row (served_by='deliverable')
```sql
select created_at, agent_key, learning_signal,
  left(coalesce(request_summary,''),60) as q, response_summary
from aria_ai_calls
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
  and created_at > now() - interval '15 minutes'
order by created_at desc;
```
Pass: all four agent_key families appear with request_summary populated. Any `council_synthesis_log_failure` row = the silent-failure cause surfaced (its learning_signal carries the DB error reason).
