# Sprint HEAL-1 — Aria Response Validator + Self-Healing Pipeline
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green

---

## Files changed

| File | Change |
|---|---|
| `src/lib/aria/response-validator.ts` | NEW — `validateAndHeal` function: 3-check validator with Haiku-powered self-healing |
| `src/app/api/aria/ask/route.ts` | Import `validateAndHeal`; hook on main-brain path (after `extractBlocks`); hook on deliverable path (after `generateDeliverable`); surface `healed`/`heal_reason` in both responses |

---

## What was built

### New: `src/lib/aria/response-validator.ts`

Exports a single async function `validateAndHeal` that runs three checks after both pipeline forks and before the response is returned to the client.

**Check 1 — Malformed JSON** (`healReason: 'malformed_json'`)
- Fires when: `pipelinePath === 'main'` AND `rawResponse` contains `<json_blocks>` AND `blocks.length === 0` (i.e. the tag was present but `JSON.parse` failed on the contents)
- Repair: Haiku rewrites the raw text between the tags, returns the corrected JSON array
- `max_tokens: 1500, temperature: 0`
- On success: returns the repaired blocks with `healed=true`
- On failure: returns original empty blocks (graceful degradation)

**Check 2 — Block type mismatch** (`healReason: 'wrong_block_type'`)
- Three sub-checks, each fire independently and accumulate into `prependBlocks`:
  - `SPREADSHEET_RE` (`/spreadsheet|\bcsv\b|excel|export/i`) AND no `spreadsheet` block present — fires on **both** main and deliverable paths; uses `rawResponse` (the deliverable HTML) as source when blocks is empty
  - `CHART_RE` (`/\bchart\b|visuali[sz]e|graph|plot/i`) AND no chart block present — main path only; requires existing blocks as source
  - `REASONING_RE` (`/\bwhy\b|reasoning|because|explain why/i`) AND no `ai_reasoning` block present — main path only; requires existing blocks as source
- Repair: Haiku emits the missing block type from existing content; block is **prepended** (additive — original blocks kept)
- On success: `healed=true` with prepended blocks
- If all sub-checks fail to parse: falls through (graceful)

**Check 3 — Empty blocks on data question** (`healReason: 'empty_on_data_question'`)
- Fires when: `DATA_RE` (`/how much|how many|revenue|sales|customers|orders|top|best|worst|average|total|count/i`) matches AND `blocks.length === 0` AND `pipelinePath === 'main'`
- Repair: Haiku re-emits at least one `kpi_card`, `data_table`, or `aurora_summary` block wrapped in `<json_blocks>[...]</json_blocks>`
- `max_tokens: 2000, temperature: 0`
- On success: returns the re-emitted blocks

All Haiku calls:
- Model: `claude-haiku-4-5-20251001` (never Sonnet/Opus)
- Wrapped in `try/catch` — any error returns original blocks with `healed=false` (NEVER crashes the request)
- Logged to `aria_ai_calls` with `agent_key='heal'`, `request_summary=healReason`, `response_summary='healed'|'heal_failed'`, `learning_signal='healed:<reason>'`
- Message content truncated to 100 chars in prompts for privacy (user question slice)

### Hook into `src/app/api/aria/ask/route.ts`

**Main-brain path — called at lines 1636–1644 (after `extractBlocks`, before task_plan prepend and `NextResponse.json`)**
```ts
let richBlocks = extractBlocks(rawResponse)   // changed const→let
const validated = await validateAndHeal({
  userMessage: message, blocks: richBlocks, rawResponse,
  pipelinePath: 'main', businessId: bid,
})
if (validated.healed) richBlocks = validated.blocks
```
Then `validated.healed` and `validated.healReason` are included in the `NextResponse.json` response payload as `healed` and `heal_reason`.

**Deliverable path — called at lines 571–580 (after `generateDeliverable`, before `NextResponse.json`)**
```ts
const delivValidated = await validateAndHeal({
  userMessage: message, blocks: [], rawResponse: result.html ?? '',
  pipelinePath: 'deliverable', businessId: bid,
})
```
`result.html` is passed as `rawResponse` so Check 2 (SPREADSHEET_RE) can extract a spreadsheet block from the HTML table content even when no AskBlocks exist. The deliverable `NextResponse.json` is augmented with `blocks`, `healed`, `heal_reason` fields.

---

## Additive-only confirmation

**Nothing was removed, stubbed, or weakened.** `extractBlocks` is completely untouched — the validator is a post-extraction layer, not a replacement. The deliverable pipeline's `generateDeliverable` function and its HTML generation logic are untouched. The system prompt is untouched. The `SPREADSHEET_RE` gate added in FIX-2 remains in place (the validator is a second safety net, not a replacement for it). `parseAriaResponse` in ask-aria/page.tsx is untouched. No block renderer was changed. No new npm dependencies were added — the existing `@anthropic-ai/sdk` already in the project is used. The happy path adds zero LLM latency: all three validator checks are guarded by synchronous regex/length conditions that are false for the vast majority of responses. The LLM repair fires only on failure (~800ms–1.5s extra latency, only on the broken path).

---

## Test plan — 4 queries to try in live UI

**Query 1 — Malformed JSON repair (Check 1)**
Send: _"Show me my top 5 products this month"_
Simulate failure: Temporarily break the JSON in a response (e.g. ask the same question twice rapidly during heavy load, or check `aria_ai_calls` for rows with `agent_key='heal'` and `request_summary='malformed_json'`). In normal operation: verify the response renders blocks correctly and there are no `[object Object]` or raw JSON in the conversation.

**Query 2 — Spreadsheet via deliverable path (Check 2 on deliverable)**
Send: _"Show me a dashboard of my top products"_ (triggers deliverable path) followed by _"Can you give me that as a CSV export?"_
Expected: The second query should either be routed through main brain (SPREADSHEET_RE gate) or trigger Check 2 on the deliverable path. Verify a `spreadsheet` block appears in the response — not a 404 or HTML widget.

**Query 3 — Chart mismatch (Check 2, main path)**
Send: _"Visualize my sales trend as a chart over the last 30 days"_
Expected: Response must contain a `styled_chart` or `clay_chart` block. If the main brain returned only text/table blocks, `heal_reason: 'wrong_block_type'` appears in the response JSON (visible in Network tab → `/api/aria/ask` response). BlockRenderer renders the chart correctly.

**Query 4 — Empty blocks on data question (Check 3)**
Send: _"How much revenue did I make this week?"_
Expected: Response contains at least one `kpi_card` or `aurora_summary` block. If the main brain returned pure text with no `<json_blocks>`, the validator fires and `heal_reason: 'empty_on_data_question'` appears in the response. Check `aria_ai_calls` table for a row with `agent_key='heal'`, `learning_signal='healed:empty_on_data_question'`.

---

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)
