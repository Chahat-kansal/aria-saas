# Sprint COUNCIL-PORT-1 — Activate Every Prior Sprint's Work on the Council Branch
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green

> Provenance note: an interrupted COUNCIL-FIX-1 run had already applied equivalents of Parts 1, 5
> and 8 plus an interim synthesis clause (never committed). This sprint upgraded the interim clause
> to the verbatim ports and added Parts 4, 6, 7 — everything lands in this ONE commit.

---

## Files changed (4)

| File | Parts |
|---|---|
| `src/app/api/aria/ask/route.ts` | Part 1 (brevity fall-through) + Parts 6/7 (validator hook on council return) |
| `src/lib/aria/council.ts` | Parts 2/3/4 (BREVITY + GROUNDING + RICH appended to synthesis prompt) + Part 5 (request_summary plumbing) |
| `src/lib/aria/response-validator.ts` | Part 6 supporting: `'council'` added to pipelinePath union; Check 3 gate widened to non-deliverable paths |
| `src/components/dashboard/BlockRenderer.tsx` | Part 8 (ai_reasoning + clay_chart cases) |

---

## PRE-FLIGHT (verbatim quotes)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q1 — Council synthesis prompt (council.ts:257-279 `buildSynthesisPrompt` + `SYNTHESIS_PROMPT_BODY` :281+)

Opening, verbatim:
```
return 'You are Aria — the final voice synthesising 3 expert advisors for: "' + question + '"\n' +
  'Business: ' + businessName + ' (' + industry + ')\n' +
  honestyRules + '\n' +
  'Write a direct, specific answer to "' + question + '" that weaves all three perspectives.\n' +
  'Start with the most important insight. Use their actual business numbers.\n' +
  'Every sentence must be specific to this business — no generic advice.\n\n' +
  SYNTHESIS_PROMPT_BODY

const SYNTHESIS_PROMPT_BODY = `GROUNDING RULES — ABSOLUTE — NEVER BREAK:
1. CUSTOMER COUNT: Use customers.pos_customer_count … NEVER default to zero or invent a number. …
2. PROMOTIONS: ONLY describe a promotion as "working" … if it appears in promotions.active …
3. FACTUAL CLAIMS: Every count, dollar figure, percentage, or causal statement must come directly from values passed to you in the data. Never infer, estimate, or guess. …
4. ANSWER THE QUESTION ACTUALLY ASKED — NEVER SILENTLY SUBSTITUTE A DIFFERENT METRIC: …
   - NARRATIVE FIRST — ABSOLUTE: final_briefing must contain at least 2 sentences of narrative BEFORE any block references …
HOW ARIA RESPONDS:
- Leads with the single most important insight … - Under 50 words of prose — let the blocks carry the content
AGREEMENT RULE: … CONFLICT RULE: …
```
Closing format directive: `AVAILABLE BLOCK TYPES — choose only what fits the question and data:` followed by per-block JSON examples (lead, metric_row, chart, kpi_card, comparison_table, pushback, brain_readouts, council_split, …). The new blocks were inserted between CONFLICT RULE and AVAILABLE BLOCK TYPES.
Note: a second `SYNTHESIS_PROMPT` const exists at council.ts:369 but is **unused** (no references) — only `buildSynthesisPrompt` is called (at :828 → synthesis at :862-869).

### Q2 — Council aria_ai_calls insert sites

ONE shared helper, `logAICall` (council.ts:85-103), verbatim surroundings:
```
async function logAICall(params: {
  agent_key: string; model_id: string; provider: string
  input_tokens: number; output_tokens: number; success: boolean
  business_id: string; error_message?: string
}) {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: params.business_id, agent_key: params.agent_key,
      provider: params.provider, model_id: params.model_id, role: 'council',
      input_tokens: …, output_tokens: …, success: …, error_message: params.error_message ?? null,
    })
  } catch (e) { console.error('[non-fatal]', e) }
}
```
Call sites: callBrain success (:228) + callBrain failure (:243) + synthesis (:865, was :850). **`message` is NOT in scope** inside `callBrain`/`logAICall` — plumbed additively: `requestSummary?: string` param on both, `activeQuestion.slice(0, 100)` passed from the 4 brain invocations and the synthesis log. `runAriaCouncil`'s public signature unchanged (it already receives `question?` as its 4th arg; `activeQuestion` derives from it at :581).

### Q3 — councilToolCallCount source

**The council never invokes tools** — all 4 brains and the synthesis are plain `client.messages.create` calls with NO `tools` param (callBrain :216-222, synthesis :~840). There are no advisor tool_calls to sum. The council's grounding is the **pre-fetched context**: `getBusinessContext(bid)` + `buildFactsPacket(...)` (route.ts:651-653) — direct DB reads injected as VERIFIED FIGURES / INTENT-GROUNDED FACTS. Implementation mirrors GROUND-1's deliverable convention (a grounded data source counts as 1):
```ts
const councilToolCallCount = bizCtx && bizCtx.length > 50 ? 1 : 0
```
**Documented trade-off:** with `1` in the normal case, validator Check 4 only fires when the context fetch failed (toolsUsed=0). The "council fabricates despite grounded context" class is addressed by Parts 2+3 (prompt) — not Check 4 — because firing Check 4 on every numeric council answer would replace rich council output with a thin Haiku re-answer on every question (RULE 0 regression).

### Q4 — Renderer correction (FastGridLayout lesson, third occurrence)

The spec names `src/components/aria/BlockRenderer.tsx` — **that file already has both `ai_reasoning` and `clay_chart` cases** and is used by `/pos/ask` only. The renderer on the OPS-AUDIT-1 chain (council → route.ts blocks → chat UI) is **`src/components/dashboard/BlockRenderer.tsx`** (imported at `app/dashboard/ask-aria/page.tsx:15` and `components/dashboard/AriaBriefingCard.tsx:3`), which was missing BOTH cases — `ai_reasoning` fell through to the text fallback and returned **null** (no content/title/description fields), i.e. silently dropped; `clay_chart` rendered as bare title text. The two cases were added THERE, matching the file's existing inline-styled if-chain (the file uses hand-rolled bars, not Recharts — clay_chart implemented as a horizontal bar list consistent with the existing `chart` case styling).

### Q5 — Source block locations in route.ts (dormant for council until now)

- `### BREVITY INTENT — STRICT OVERRIDE`: route.ts **lines 1166-1194** (incl. TIGHTEN-1-REDO override header + ADVISORY MODE)
- `### GROUNDING RULE — STRICT`: route.ts **lines 1196-1225**
- `### RICH RENDERER SELECTION`: route.ts **lines 1119-1164** (STEP 1 + STEP 2 tables + CRITICAL RENDERER RULES)
All three remain verbatim in route.ts for the main-brain path (untouched by this sprint except the Part 1 gate far above them).

---

## Per-part insertion locations + diff shape

| Part | Location | Shape |
|---|---|---|
| 1 — Brevity fall-through | route.ts ~:648 — `BREVITY_SIGNALS` + `SHORT_FACTUAL` consts inserted above the council branch; condition became `if (!isBrevityQuestion && (isStrategicQuestion \|\| ariaIntent.intent_type === 'analytical'))`. `runAriaCouncil(...)` call literal unchanged. Exact regexes: `/^\s*(just tell me\|just \|quickly\|tldr\|tl;dr\|in one number\|single number)\b/i` and `/^.{0,60}\b(how much\|what'?s my\|what is my\|today'?s\|this week'?s\|this month'?s\|revenue today\|orders today)/i` | append + 1-condition conjunct |
| 2 — BREVITY port | council.ts SYNTHESIS_PROMPT_BODY, after CONFLICT RULE, before AVAILABLE BLOCK TYPES | append (council-adapted: `<json_blocks>` XML example lines omitted — council emits JSON `ask_blocks`, not XML; `council_read`→`council_split` to match council's real block name) |
| 3 — GROUNDING port | same position, after BREVITY | append (council-adapted: the "MUST call query_business_data" tool mandate replaced by "must come from the data passed to you in THIS turn" — synthesis has NO tools to call; FORBIDDEN list + ESCAPE clause verbatim) + the spec's COUNCIL-SPECIFIC GROUNDING line verbatim |
| 4 — RICH port | same position, after GROUNDING, with the spec's `RICH OUTPUT (…opt-in…)` prefix | append (council-adapted: spreadsheet/export row, kinetic_text row, styled_chart references and the 2-paragraphs bullet omitted — export/progressive blocks are main-brain-only and the narrative bullet contradicts council's "Under 50 words of prose" rule; all retained types exist in AskBlock and the chat renderer) |
| 5 — request_summary | council.ts logAICall (+`request_summary` field), callBrain (+`requestSummary?` param), 4 brain call sites + synthesis log pass `activeQuestion.slice(0, 100)` | append-only params/fields |
| 6 — validateAndHeal hook | route.ts council branch, AFTER `runAriaCouncil` and BEFORE `upsertConversation` (so the SAVED conversation gets healed text too — improvement over the main path's post-save hook); healed `councilText`/`councilBlocks` used in upsert, memory extraction, and the response JSON | append + 3 variable substitutions in the existing return |
| 7 — councilToolCallCount | inside Part 6 hook (see Q3) | append |
| 8 — renderer cases | components/dashboard/BlockRenderer.tsx, after `aurora_summary`, before the graceful fallback | append (2 new if-blocks; existing cases + fallback untouched) |
| validator | response-validator.ts: union `'main' \| 'deliverable' \| 'council'`; Check 3 gate `=== 'main'` → `!== 'deliverable'` | additive union member + 1 gate widening (Check 1 stays main-only — XML only exists there; Check 2 already covered council via its `!== 'deliverable'` form) |

## Untouched confirmation
- **ops_narrative** — zero changes (agents.ts, invoke.ts, router.ts, live-intelligence, business-brain, daily-narrative, profit-analysis all untouched)
- **agents.ts** — untouched
- **briefing crons** — untouched
- **AriaCommandBar / /api/aria/command** — untouched (COMMAND-FIX-1 later)
- **runAriaCouncil signature** — unchanged (message already flowed in as `question?`)
- **Existing council prompt rules** — verbatim; all new blocks appended between CONFLICT RULE and AVAILABLE BLOCK TYPES
- **route.ts BREVITY/GROUNDING/RICH blocks** — still present verbatim for the main-brain path
- No new dependencies; vercel.json untouched

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy (founder, fresh hard-refreshed chat)

| # | Query | Expected | Validates |
|---|---|---|---|
| 1 | "just tell me how much I made today" | ONE block, ≤1 sentence, no advisory words | Part 1 gate + BREVITY |
| 2 | "how am I doing this week?" | council fires, grounded numbers only, no "19%"/"5× higher" | Parts 2+3+6+7 |
| 3 | "what's my revenue today?" | ONE block (short-factual gate), tools≥1 in aria_ai_calls | Part 1 + GROUND-1 |
| 4 | "show me weekly revenue as a chart" | chart/clay_chart block renders without fallback | Parts 4+8 |

Chat Claude SQL (note: real council agent_keys are `council_growth/risk/strategy/context/synthesis` — not `council_synth/planner/advisor` as in the spec template):
```sql
select created_at, agent_key, role,
  left(coalesce(request_summary,''),60) as q,
  response_summary, success, learning_signal
from aria_ai_calls
where created_at > now() - interval '20 minutes'
  and (agent_key in ('ask_aria','heal','deliverable') or agent_key like 'council_%')
order by created_at desc limit 25;
```
Pass: Q1+Q3 → agent_key='ask_aria', tools≥1, request_summary populated. Q2+Q4 → agent_key='council_*' WITH request_summary populated (new). Zero fabricated figures. Any council Check-4 fire shows a 'heal' row with `learning_signal='guard_fired:ungrounded_numeric'` (only expected if the context fetch failed — see Q3 trade-off).
