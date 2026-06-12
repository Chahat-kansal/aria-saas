# Sprint GROUND-1 — Force Tool Use on Numeric Questions
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green

---

## Files changed

| File | Change |
|---|---|
| `src/app/api/aria/ask/route.ts` | GROUNDING RULE block appended after BREVITY INTENT; `toolsUsed` passed at both validator call sites; `cleanResponse` const→let so a grounded heal can replace ungrounded narrative text |
| `src/lib/aria/response-validator.ts` | Check 4 (ungrounded numeric) added after the existing three checks; `toolsUsed` arg + `healedText` return field; heal uses a real tool loop |
| `src/lib/aria/types.ts` | `'heal'` added to the `AgentKey` union (needed for the tool-loop call) |
| `src/lib/aria/agents.ts` | `heal` entries added to the two exhaustive `Record<AgentKey, …>` maps (schema + model) |
| `src/lib/aria/router.ts` | `heal: 'sales'` entry added to the category map |

---

## Pre-flight findings

### IRON RULES — verbatim (lines 769–779 of route.ts)

> ⛔ IRON RULES — ABSOLUTE — NEVER BREAK THESE:
>
> 1. **NEVER COMPUTE NUMBERS YOURSELF.** Every revenue figure, ranking, average, or count you state MUST come from a tool result returned in this conversation. If you don't have a tool result for it, call the tool. Do not aggregate, average, or rank raw rows in your head — call query_sales with group_by="day_of_week" and use the returned avg_revenue_per_day. Do not add up totals from individual sale rows — call get_summary. The tool computes; you narrate.
>
> 2. **NEVER STATE LOCATION, HOURS, CUISINE, OR BUSINESS CONCEPT** unless get_business_profile returned that field as non-null. […]
>
> 3. **ABSTAIN OVER GUESS.** If data is absent, say so plainly. […] Never fill silence with plausible-sounding invented numbers or facts.
>
> 4. **ANTI-HALLUCINATION — ABSOLUTE — NEVER BREAK:** Every number, count, ranking, and causal claim you state MUST come from a value computed and returned by a tool call in this conversation. NEVER invent, round, or estimate a figure. […]
>
> 5. **MARKETING CONSENT RULE — MANDATORY — NEVER BREAK:** […]

Rules 1 and 4 already say exactly what GROUND-1 enforces — confirming the production data (14/15 responses with `tools:0`) shows prompt-only rules are insufficient. The GROUNDING block adds concrete signals/forbidden patterns, and Check 4 adds runtime enforcement. IRON RULES untouched.

### tools-used signal
The `tools:N` in `response_summary` comes from `toolCalls.length` inside `callAnthropicWithTools` (providers/anthropic.ts). In route.ts the same value is exposed as **`toolResult.tool_calls.length`** — this is what's now passed to the validator as `toolsUsed`.

### HEAL-1 validator
`validateAndHeal` export confirmed with the three existing checks (malformed_json → wrong_block_type → empty_on_data_question), all with graceful-fallback try/catch. Check 4 added after them.

### Deliverable path
`generateDeliverable` always fetches live DB data (`fetchRankedData` / `fetchDashboardData` querying pos_sales etc.) — it is inherently grounded. Per spec, the deliverable call site passes `toolsUsed: 1` so Check 4 never fires there.

---

## Part 1 — GROUNDING RULE insertion point

Inserted immediately AFTER the BREVITY INTENT block's closing ADVISORY MODE paragraph and BEFORE `### Plain text` (line ~1184). Surrounding context:

```
ADVISORY MODE — DEFAULT (unchanged)
When BREVITY does NOT fire, the 2-paragraph narrative rule applies as before. […]

### GROUNDING RULE — STRICT          ← NEW BLOCK (line ~1184)
…full block as specified: mandate, NUMERIC SIGNALS, FORBIDDEN patterns,
 CORRECT/WRONG examples, ESCAPE clause…

### Plain text                        ← existing section, untouched
```

BREVITY and GROUNDING coexist: BREVITY controls output verbosity, GROUNDING controls factual sourcing.

## Part 2 — Check 4 in response-validator.ts

**Confirmed: added AFTER the existing 3 checks** (immediately before the final `return { blocks, healed: false }`).

Fire condition (exactly per spec):
```ts
toolsUsed === 0 && NUMERIC_RE.test(userMessage) && (CURRENCY_OUT.test(rawResponse) || PERCENT_OUT.test(rawResponse))
```

**Heal implementation note:** the spec's pseudocode called Haiku with a bare prompt, but a tool-less Haiku call cannot actually ground numbers — it would just rephrase. So the heal uses `callAnthropicWithTools` (existing provider loop) with the real `query_business_data` + `compare_periods` tools and `executePOSTool` wired to the business. The heal only counts as successful when `healResult.tool_calls.length > 0` — i.e. the re-answer genuinely called a data tool. Haiku only, `maxIterations: 3`, 25s timeout, same graceful-fallback pattern (any failure → original blocks returned, request never blocked).

**Healed narrative text:** the production bug lived in narrative text ("this week $722.50"), not only blocks. So Check 4 also returns `healedText` (the grounded re-answer minus its json_blocks), and the main path replaces `cleanResponse` with it. Known limitation: the conversation row saved earlier in the turn still contains the original text — the user-visible response is healed; history backfill is a future sprint.

**Logging:** one `aria_ai_calls` row per fire — `agent_key='heal'`, `request_summary='ungrounded_numeric'`, `learning_signal='guard_fired:ungrounded_numeric'`, success true/false. User message truncated to 100 chars in the heal prompt.

**Check-order note:** the spec says Check 4 "fires AFTER checks 1–3 so a numeric heal can stack". Checks 1–3 return early when they heal (HEAL-1 contract, unchanged) — so stacking-in-one-pass isn't structurally possible without rewriting HEAL-1 (out of scope per DO NOT). In the dominant production case (well-formed blocks, fabricated numbers, tools:0) checks 1–3 pass through and Check 4 fires as intended.

## Part 3 — toolsUsed wiring

- **Main brain** (route.ts ~1671): `toolsUsed: toolResult.tool_calls.length` — same source as the `tools:N` response_summary string.
- **Deliverable** (route.ts ~575): `toolsUsed: 1` (grounded path; Check 4 can never fire).

The `AgentKey` type gained `'heal'` (needed by the provider loop's typed param), which required `heal` entries in three exhaustive `Record<AgentKey, …>` maps (agents.ts schemas, agents.ts model map, router.ts category map) — pure type-completeness additions, no behaviour change to those modules.

---

## Additive-only confirmation

Nothing removed or weakened: IRON RULES verbatim-untouched (GROUNDING appended as a new block beneath them); BREVITY INTENT untouched and coexisting; query_business_data tool definition untouched (SQL-GUARD-1 guards intact); HEAL-1's three checks unchanged in logic and order; BlockRenderer/ask-types/parseAriaResponse/extractBlocks untouched; no npm dependencies; vercel.json untouched. The only mutations are appends: a prompt block, a fourth check, an optional arg/return field, one `const`→`let`, and three map entries forced by type exhaustiveness.

---

## Test plan (founder runs after deploy)

1. "what's my revenue today?" — expect `tools:1+`, response cites a real number ($0)
2. "how much did I make this week?" — expect `tools:1+`, response cites a real number (currently $7)
3. "what's the capital of France?" — non-numeric, NUMERIC_RE doesn't fire, no extra heal
4. "explain how loyalty points work" — non-numeric explanation, no heal trigger
5. Chat Claude verifies via SQL:
```sql
select created_at, response_summary, left(request_summary, 80) as q
from aria_ai_calls
where created_at > now() - interval '15 minutes' and agent_key='ask_aria'
order by created_at desc;
```
**Pass criterion:** all ask_aria rows for queries 1+2 show `tools:` ≥ 1 in response_summary. Queries 3+4 may legitimately show `tools:0`. Bonus check: any `agent_key='heal'` rows with `learning_signal='guard_fired:ungrounded_numeric'` indicate the validator caught a slip-through.

---

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)
