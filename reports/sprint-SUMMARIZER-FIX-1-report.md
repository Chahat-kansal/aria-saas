# Sprint SUMMARIZER-FIX-1 — Code-Level Fabrication Scan on the Summary Writer
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green
**Closes:** PUSHBACK-AUDIT-1 Mechanism B at the WRITER (the feedback loop: Aria fabricates → summarizer records it as a "concern" → council reads it back next conversation).

---

## Files changed (4 + report)

| File | Parts |
|---|---|
| `src/lib/aria/validate-summary.ts` | NEW — Part 1 `filterUngrounded(items, sources)` |
| `src/lib/aria/response-validator.ts` | Shared-scanner refactor: `extractNumbers` + `RISKY_NUMERIC_RE` exported (Check 5 now references the shared const — logic byte-identical) |
| `src/lib/aria/memory/summarize.ts` | Parts 2+3+4: filter hook before insert, summarizer_guard logging, optional `groundTruth` param |
| `src/app/api/aria/ask/route.ts` | Part 4: groundTruth plumbed at both call sites |

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — Grep classification (every match)

| File:line | Classification |
|---|---|
| `src/lib/aria/memory/summarize.ts:34-99` (`summariseConversation`, upsert :89) | **WRITER — the only one** |
| `src/lib/aria/memory/recall.ts:106-107,126` (`fetchRecentSummaries`) | READER — NOT modified |
| `src/app/api/aria/conversation-summaries/route.ts:29-30` (UI list endpoint) | READER — NOT modified |
| `src/lib/aria/agents.ts:70,118` / `router.ts:21` / `types.ts:17` | OTHER (AgentKey schema/model/category map entries) |
| `src/types/database.types.ts:1401-1437` | OTHER (generated types) |

### Q3 — The WRITER, verbatim (pre-edit)

Function signature (summarize.ts:34-38):
```ts
export async function summariseConversation(
  businessId: string,
  messages: ConversationMessage[],
  conversationId: string,
): Promise<void> {
```

The Anthropic prompt (SUMMARIZER_SYSTEM, :16-32):
```
You extract a concise structured summary from an Aria OS business conversation.

Return ONLY valid JSON (no code fences, no preamble):
{
  "summary": "2-3 sentences covering what was discussed and any key insights",
  "key_decisions": ["explicit decision the owner made or confirmed", "..."],
  "key_concerns": ["ongoing worry raised by the owner", "..."],
  "followup_promised": ["something Aria said it would check or the owner asked to revisit", "..."]
}

Rules:
- summary: 2-3 sentences max. Plain English. Specific to this conversation.
- key_decisions: only if the owner made an explicit choice. Max 3. Empty array if none.
- key_concerns: only recurring or significant worries. Max 3. Empty array if none.
- followup_promised: only if Aria or the owner mentioned checking something later. Max 3.
- Never invent content not in the conversation.
- If nothing notable happened, return summary only with empty arrays for the rest.
```
(NOT modified, per DO NOT — the "Never invent" rule is already there and is exactly what live evidence shows being ignored; we filter the output instead.)

The insert (:88-97):
```ts
const today = new Date().toISOString().slice(0, 10)
await supabaseAdmin.from('aria_conversation_summaries').upsert({
  business_id: businessId,
  conversation_date: today,
  mode: 'ask_aria',
  summary: parsed.summary.slice(0, 500),
  key_decisions: Array.isArray(parsed.key_decisions) ? parsed.key_decisions.slice(0, 3) : [],
  key_concerns: Array.isArray(parsed.key_concerns) ? parsed.key_concerns.slice(0, 3) : [],
  followup_promised: Array.isArray(parsed.followup_promised) ? parsed.followup_promised.slice(0, 3) : [],
}, { onConflict: 'business_id,conversation_date,mode' })
```

### Q4 — The summarizer's INPUTS
`aria_conversations.messages` — the call sites fetch the conversation row's messages JSON; summarize.ts builds a transcript from the **last 20 user+assistant messages** (each truncated to 600 chars, :41-45). **Aria's own replies ARE in the transcript** — that is the fabrication vector: the model "extracts" Aria's invented "19% reconciliation" as an owner concern.

### Q5 — Is groundTruth available at the call sites?
The summarizer received NO groundTruth (3-param signature). Call sites:
- **Council branch** — route.ts:747 (inside the fire-and-forget `.then` after the council return). `augCtx` (business context JSON + facts packet + GROUNDING-TEETH's `available_ground_truth` anchors) **IS in closure scope** → passed directly.
- **Main path** — route.ts:1738. `augCtx` does not exist there; `ctx` (AskAriaContext) does → a small anchors JSON is derived from it (cents→dollars), zero extra queries. `payment_coverage_real_pct` / `customer_count_with_consent` are not in ctx and were NOT recomputed on this path (extra per-chat queries in a hot path; the council path — where the live fabrication occurred — gets all 4 anchors via augCtx). Documented as the deliberate scope cut.

---

## Spec-internal conflict resolved (documented decision)
Part 1 says sources = "concatenation of **all messages** + groundTruth + business context", but the gate ("a concern/decision can only be recorded if it traces to (a) the **user's own messages** … or (b) a ground-truth anchor") and the required test case ("19% reconciliation → no source match → dropped") are only satisfiable if **Aria's assistant messages are EXCLUDED** from the numeric-grounding corpus — the fabricated 19% lives in an assistant message, so an all-messages corpus would self-ground it and the loop would survive. Implemented per the gate: `sources = user messages + groundTruth`. The exclusion is the entire point of the sprint and is commented in both validate-summary.ts and summarize.ts.

## Per-part insertion locations

| Part | Location | Shape |
|---|---|---|
| 1 | NEW `src/lib/aria/validate-summary.ts` — `filterUngrounded(items, sources): { kept, dropped }`; zero-numeric items always kept; numeric tokens matched verbatim or ±2% against `extractNumbers(sources)` | new file |
| 1 (shared scanner) | response-validator.ts: `RISKY_NUMERIC_RE` hoisted to an exported const; `extractNumbers` exported; Check 5's inline regex replaced by the shared const (`const RISKY = RISKY_NUMERIC_RE`) — **no duplicated logic**, Checks 1–4 untouched, Check 5 behaviour byte-identical | export refactor |
| 2 | summarize.ts: after `JSON.parse`, before the upsert — `userCorpus` (role==='user' only) + groundTruth → `filterUngrounded` on key_decisions and key_concerns; `kept` arrays written; empty arrays allowed; **summary text + followup_promised always write** (insert never blocked) | append |
| 3 | summarize.ts: one aria_ai_calls row per dropped item — `agent_key='summarizer_guard'`, `role='guard'`, `request_summary=dropped.slice(0,100)`, `response_summary='dropped_before_insert'`, `learning_signal='guard_fired:fabricated_summary_dropped'`, try/catch wrapped | append |
| 4 | summarize.ts signature: + optional `groundTruth?: string` (4th param). route.ts:747 → `summariseConversation(bid, msgs, _cid, augCtx)`; route.ts:1738 → small `mainGroundTruth` JSON `{revenue_today, revenue_this_week_calendar, revenue_this_month}` from ctx cents fields | optional param + 2 call sites |

Note on the regex: the spec's token list includes bare `\b\d+(?:\.\d+)?×`; the shared `RISKY_NUMERIC_RE` (from GROUNDING-TEETH) requires `×/x` + `higher|lower|more|less`. Reused unchanged per "do NOT duplicate logic" — a bare "3×" without a comparative word won't flag (minor, documented; changing the shared regex would alter Check 5 behaviour, out of scope).

## Additive-only / DO-NOT compliance
Parts 1–4 additive ✓ (new file, exported helpers, optional param, filter before an unchanged upsert). READERS untouched ✓ (recall.ts `fetchRecentSummaries` + conversation-summaries route byte-identical). Summarizer prompt text untouched ✓. No existing summary rows touched ✓. Insert never blocked ✓ (drops degrade to empty arrays; summary/followups still write). No dependencies ✓. No schema change ✓ (`summarizer_guard` is just a new agent_key string).

## Test cases traced through `filterUngrounded`

| # | Item | Sources contain | Trace | Outcome |
|---|---|---|---|---|
| 1 | "POS payment reconciliation at only 19% — transaction records are missing" | user msgs (no 19), anchors {payment_coverage_real_pct: 100, …} | `19%` → 19 vs corpus {100, 7, …}: no match ±2% | **DROPPED** + summarizer_guard row (the live evidence case) |
| 2 | "Owner agreed to launch the Tuesday bundle" | — | zero numeric tokens → qualitative | **KEPT** (no fabrication risk) |
| 3 | "Owner noted revenue is $7 this week" | anchors {revenue_this_week_calendar: 7} | `$7` → 7 ∈ corpus exact | **KEPT** |
| 4 | "Revenue dropped to $4,442.90 vs target" | user message contains "$4,419.90" | 4442.9 vs 4419.9 → Δ0.52% ≤ 2% | **KEPT** (tolerance prevents false drops on rounding) |
| 5 | "Owner worried sales are 5× lower than usual" | no 5 anywhere in user msgs/anchors | `5× lower` → ungrounded | **DROPPED** + guard row |

Edge: model returns non-string array entries → skipped defensively; all items dropped → empty arrays write, summary row still lands.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy
Have any normal chat (≥4 messages), wait ~5 min, then:
```sql
select created_at, conversation_date,
  key_concerns::text as concerns,
  key_decisions::text as decisions
from aria_conversation_summaries
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
order by conversation_date desc limit 3;
```
Pass: no fabricated %/$/× claims in concerns/decisions; qualitative items still recorded; and when something WAS dropped:
```sql
select created_at, left(request_summary, 80) as dropped_item
from aria_ai_calls
where agent_key='summarizer_guard'
order by created_at desc limit 10;
```
