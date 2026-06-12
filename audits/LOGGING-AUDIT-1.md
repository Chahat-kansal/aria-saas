# LOGGING-AUDIT-1 — Why the Council Never Logs to aria_ai_calls
**Date:** 2026-06-13 · Read-only audit · References current as of commit `11af4b4e`

> Headline: the council's logging code is real, correctly edited, and fires on every brain call —
> **when the council actually runs**. Three mechanisms can produce a council-LOOKING chat answer
> with zero `council_%` rows: (1) the **council cache** returns at council.ts:676 with no logging
> (but its 5-min TTL cannot cover all three questions alone), (2) **`isStrategicQuestion` does NOT
> match "how am I doing this week?"** — the council only fires if the Haiku intent classifier says
> `analytical`; otherwise the question goes to the **deliverable 'scorecard' path** (logs
> `agent_key='deliverable'`) or the main brain (logs `ask_aria`) — both of which produce rich
> dashboard-style output easily mistaken for council formatting, and (3) the question window
> (14:45–15:33 UTC = 00:45–01:33 AEST) sat **exactly inside the 4-commit deploy race**
> (00:35 / 01:01 / 01:12 / 01:24 AEST). The decisive next step is one SQL query WITHOUT the
> council filter (see DIAGNOSIS).

---

## Q1 — The 5 council ai_calls insert sites COUNCIL-PORT-1 claimed

grep `aria_ai_calls|logAICall|trackAICall` in council.ts (verbatim hits):
```
85:async function logAICall(params: {
91:    await supabaseAdmin.from('aria_ai_calls').insert({
112:      .from('aria_ai_calls')          ← getRecentLearningContext (READ, not insert)
230:    await logAICall({                 ← callBrain success
245:    await logAICall({                 ← callBrain failure
936:    await logAICall({                 ← synthesis
```
(`src/lib/aria/agents/` contains NO logger matches — rostering/message/query/automation agents log via providers/anthropic, not here.)

The "5 sites" of the Part 5 claim = 4 `callBrain(...)` invocations (council.ts:858-861, each passing `activeQuestion.slice(0, 100)` as the new 8th arg) + 1 synthesis `logAICall` (:936 with `request_summary: activeQuestion.slice(0, 100)`). **request_summary IS passed at all of them** (current file verified by read; commit verified in Q6).

agent_keys: `'council_' + role` where role ∈ growth/risk/strategy/context (callBrain :229/:244) and `'council_synthesis'` (:936). `role: 'council'` on every row (:96).

## Q2 — The council's actual logger (verbatim body, council.ts:85-104)

```ts
async function logAICall(params: {
  agent_key: string; model_id: string; provider: string
  input_tokens: number; output_tokens: number; success: boolean
  business_id: string; error_message?: string; request_summary?: string
}) {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: params.business_id,
      agent_key: params.agent_key,
      provider: params.provider,
      model_id: params.model_id,
      role: 'council',
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      success: params.success,
      error_message: params.error_message ?? null,
      request_summary: params.request_summary ?? null,
    })
  } catch (e) { console.error('[non-fatal]', e) }
}
```
It inserts into **aria_ai_calls** (not console/Sentry/another table). All Insert-required columns (agent_key, provider, role) supplied — no schema reason for silent failure; any DB error would print `[non-fatal]` to Vercel logs.

## Q3 — Every advisor invocation in council.ts

| # | Call | File:line | Logger | agent_key | role |
|---|---|---|---|---|---|
| 1 | growth brain — `callBrain(client, HAIKU, buildGrowthPrompt…)` | :858 → Anthropic `messages.create` inside callBrain :218 | logAICall :230/:245 | council_growth | council |
| 2 | risk brain | :859 | same | council_risk | council |
| 3 | strategy brain | :860 | same | council_strategy | council |
| 4 | context brain | :861 | same | council_context | council |
| 5 | synthesis — `client.messages.create` | :923 | logAICall :936 | council_synthesis | council |
| (6) | Gemini context-brain — `runContextBrain` (:~880 via geminiPromise) | NOT Anthropic; logs (if at all) via the Gemini provider, NOT council logAICall | — | — |

callBrain logs on BOTH success and failure (timeout/exception → :245 with error_message) — **a council run cannot complete its brains without writing ≥4 rows**.

## Q4 — GROUNDING-TEETH Check 5 hook

- Check 5 EXISTS: `response-validator.ts` — gate `pipelinePath === 'council' && groundTruth && rawResponse.trim()`, sits after Check 4, before the final return (verified by read; shipped in `11af4b4e`).
- Council call to validateAndHeal: **route.ts:~710** (`councilValidated = await validateAndHeal({ … pipelinePath: 'council', … groundTruth: augCtx + … })`) — line drifted from 677 after GROUNDING-TEETH insertions; grep `pipelinePath: 'council'` to pin.
- Reached: ONLY inside the council branch, ONLY when `council?.final_briefing` is truthy, wrapped in its own try/catch. **It DOES run on cache HITs** (the cache returns a CouncilOutput to route, validation is route-side) — but NOT when the gate at :656 never fires, and NOT on deployments older than `11af4b4e` (01:24 AEST — i.e., for ALL THREE questions in the evidence window, Check 5 was not yet deployed).

## Q5 — Full council execution trace (entry → return)

```
route.ts:656  if (!isBrevityQuestion && (isStrategicQuestion || ariaIntent.intent_type === 'analytical'))
route.ts:658  getBusinessContext + buildFactsPacket            (throws → catch → MAIN BRAIN fallback, console '[aria/ask] council failed…')
route.ts:~663 GROUNDING-TEETH Part 3 minimal-ctx early return  (post-11af4b4e only)
route.ts:~700 runAriaCouncil(augCtx…, bid, 'ask_aria', message)
  council.ts:650 entry → :664 classifyQuestionComplexity
  council.ts:666-679 CACHE CHECK (mode==='ask_aria'):
      readCouncilCache(businessId, intentHash(question) + '_' + dataEpoch)
      :676 → **return cached  ← EARLY RETURN, ZERO LOGGING, ZERO BRAIN CALLS**
      (council_cache table, :557-568; 5-MIN TTL backstop, :570-572 — "expires = Date.now() + 5*60*1000";
       dataEpoch = last non-voided sale's minute, :540-555 — stable overnight for Sip)
  council.ts:682-687 quality/memories/summaries/learning (all .catch-guarded)
  council.ts:858-861 Promise.all → 4 × callBrain → 4 × logAICall (success OR failure)
  council.ts:~900 succeeded.length === 0 → return null (→ route falls back to MAIN brain)
  council.ts:923 synthesis messages.create → :936 logAICall(council_synthesis)
  → writeCouncilCache → return CouncilOutput
route.ts validateAndHeal('council') → upsertConversation → NextResponse
```
**The only path through a COMPLETED council run that writes zero rows is the :676 cache HIT.** However: the three questions were ~20+ min apart and the cache TTL is 5 minutes — a HIT chain across all three requires each ask to be re-served within 5 min of a previous identical ask (plausible only if the founder asked the same question more times than the 3 visible, e.g. retries) — so the cache **cannot be assumed to explain all three alone**.

## Q6 — Was COUNCIL-PORT-1 Part 5 actually applied?

`git show 298e6d2f -- src/lib/aria/council.ts | grep -B2 -A5 request_summary` — output (verbatim, trimmed to the diff hunks):
```
-  business_id: string; error_message?: string
+  business_id: string; error_message?: string; request_summary?: string
…
+      request_summary: params.request_summary ?? null,
…
-      success: !!parsed, business_id: businessId,
+      success: !!parsed, business_id: businessId, request_summary: requestSummary,
…
-      error_message: (e as Error).message,
+      error_message: (e as Error).message, request_summary: requestSummary,
```
**The edits LANDED in 298e6d2f** (committed 2026-06-13 00:35:42 +1000) — not an honest miss; something else prevents rows.

## Q7 — Is the council even invoked for "how am I doing this week?"

Gate inputs, file:line:
- `BREVITY_SIGNALS` (route.ts, council branch): `/^\s*(just tell me|just |quickly|tldr|tl;dr|in one number|single number)\b/i` → **NO match**.
- `SHORT_FACTUAL`: `/^.{0,60}\b(how much|what'?s my|what is my|today'?s|this week'?s|this month'?s|revenue today|orders today)/i` → **NO match** — the message contains "this week" but the alternative is `this week'?s` (trailing `s` REQUIRED; the apostrophe is what's optional). Brevity gate does not divert it. ✓
- `isStrategicQuestion` (route.ts:382): `/should|recommend|best|strategy|improve|why|how can|what would|advice|suggest|analyse|analyze|compare|forecast|plan|opportunity|risk|growth|optimise|optimize/i` → **"how am I doing this week?" matches NONE of these** → `isStrategicQuestion = FALSE`.
- Therefore the council fires **ONLY IF** the Haiku classifier returns `ariaIntent.intent_type === 'analytical'` (route.ts:656). That classification is per-request LLM output — not guaranteed.

**The third-code-path suspicion is REAL and file:line-cited:** `classifyDeliverableKind` (deliverables.ts:347) matches `how (am|are) (i|we) (doing|performing)` → `'scorecard'`. If the classifier returns `artifact_request`, the deliverable gate (route.ts:~565, which runs BEFORE the council branch) serves an HTML scorecard — a rich, dashboard-style response easily read as "council formatting" — and logs **`agent_key='deliverable'`** (deliverables.ts:781-783). If the classifier returns anything else non-analytical, the MAIN brain answers (logs `ask_aria`) and can itself emit `council_split`/`brain_readouts` blocks (they're in its RICH table — OPS-AUDIT-1 Q4).

Deploy-race context: question window 14:45–15:33 UTC Jun 12 = **00:45–01:33 AEST Jun 13**; commits 298e6d2f 00:35, 3a31f7a8 01:01, 38924808 01:12, 11af4b4e 01:24 (all +1000), each followed by a push+Vercel build — the serving lambda varied across the three questions and NONE of them had GROUNDING-TEETH live.

---

## DIAGNOSIS

The council logger is correct, complete, and request_summary-equipped (Q1/Q2/Q6). A completed council run cannot avoid writing rows (Q3/Q5). Therefore the three zero-council-row responses were served by, in order of likelihood:
1. **Not-the-council**: `intent_type` ≠ analytical → deliverable 'scorecard' path (`agent_key='deliverable'`) or main brain (`agent_key='ask_aria'`) — both produce council-looking output; `isStrategicQuestion` provably does not match this question (Q7).
2. **Council cache HITs** (council.ts:676 — zero logging) for any ask within 5 min of an identical prior ask.
3. A route-side exception before `runAriaCouncil` (ctx fetch) falling back to the main brain — would still produce `ask_aria` rows.

**One SQL distinguishes all three** — run WITHOUT the council filter:
```sql
select created_at, agent_key, role, success,
  left(coalesce(request_summary,''),60) as q, response_summary
from aria_ai_calls
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
  and created_at between '2026-06-12 14:40:00+00' and '2026-06-12 15:40:00+00'
order by created_at;
```
Interpretation: `deliverable` rows → path 1a; `ask_aria` rows → path 1b/3; NO rows at all in the window → path 2 (cache) or an older serving build with a failing insert (then check Vercel logs for `[non-fatal]` and `[council] cache HIT` lines in the same window — both are console-logged).

## RECOMMENDED FIX

1. **Observability (the actual gap):** council.ts:676 — log cache HITs before returning: one `logAICall({ agent_key: 'council_cache', model_id: 'cache', provider: 'cache', input_tokens: 0, output_tokens: 0, success: true, business_id, request_summary: activeQuestion.slice(0,100) })` (or a lighter insert). One-line-class additive change → every council-served response becomes visible in aria_ai_calls. (Future sprint: COUNCIL-OBS-1.)
2. **Routing observability:** the response JSON already carries `used_council` — also persist the serving path (`council|deliverable|main|council_cache`) into the conversation row or request_summary so chat-Claude SQL can attribute responses without guessing. (Same sprint.)
3. **If the SQL shows `deliverable` rows:** "how am I doing this week?" being served as an HTML scorecard instead of the council is a routing-intent question for the founder — the fix (if wanted) is excluding performance questions from `classifyDeliverableKind`'s scorecard regex unless intent_type==='artifact_request' is high-confidence; deliverables.ts:347 + route gate already requires artifact_request, so this only happens when the classifier mislabels.
4. No fix needed to logAICall/callBrain/synthesis logging itself — verified intact.

---
*Read-only. No source changes. Every claim file:line-cited; the three-way disambiguation requires the one SQL above (NEEDS-DB).*
