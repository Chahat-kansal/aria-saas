# HEAL-1 — Aria response validator + self-healing pipeline

MODE: SOLO. pwd must confirm C:\Users\kansa\aria-saas-audit.

## What this sprint does
Adds a response-layer validator that sits AFTER both pipeline forks (main brain + deliverable) and BEFORE the response is returned to the client. It catches three failure classes at runtime and heals them in a single same-request retry:

1. Malformed json_blocks JSON → repair via Haiku rewrite
2. Block-type mismatch vs user intent (spreadsheet asked, data_table returned) → corrective re-emit
3. Empty blocks array on a data question → re-prompt with explicit block requirement

Additive only. Zero existing logic removed. Happy path adds zero latency (validator is a synchronous check, not an LLM call). LLM repair fires only on failure (~800ms–1.5s extra, only on the broken path).

## PRE-FLIGHT (mandatory)
1. `pwd` → must be C:\Users\kansa\aria-saas-audit.
2. Read in full:
   - src/app/api/aria/ask/route.ts — focus on lines 551–578 (intent router fork), the extractBlocks call site, and the response assembly path before NextResponse.json
   - src/lib/aria/deliverables.ts — note generateDeliverable's return shape (the [DELIVERABLE:outputId] sentinel) and where it's logged to aria_ai_calls
   - src/lib/aria/ask-types.ts — full list of AskBlock types so the validator knows what's a valid block
3. Verify: grep -n "extractBlocks\|json_blocks\|generateDeliverable" src/app/api/aria/ask/route.ts to confirm the exact lines where blocks are produced on both paths.
4. Confirm aria_ai_calls.learning_signal column exists (it does per earlier verify) — we'll use it to tag healed responses for the weekly learning sprint.

## BUILD

### New file: src/lib/aria/response-validator.ts

Exports a single async function:
```ts
export async function validateAndHeal(args: {
  userMessage: string
  blocks: AskBlock[]
  rawResponse: string
  pipelinePath: 'main' | 'deliverable'
  businessId: string
}): Promise<{
  blocks: AskBlock[]
  healed: boolean
  healReason?: 'malformed_json' | 'wrong_block_type' | 'empty_on_data_question'
  healLatencyMs?: number
}>
```

Three checks in this exact order:

**Check 1 — Malformed JSON (only fires on main-brain path):**
```
if pipelinePath === 'main' AND rawResponse contains '<json_blocks>' AND blocks.length === 0:
  → extract raw text between <json_blocks> and </json_blocks>
  → call claude-haiku-4-5-20251001 with prompt: "The following JSON is malformed. Fix the syntax errors and return ONLY the corrected JSON array, no other text. Original: ${rawText}"
  → max_tokens 1500, temperature 0
  → try JSON.parse on result, if valid return blocks with healed=true, healReason='malformed_json'
  → if still invalid, return original blocks (graceful fallback, don't crash)
```

**Check 2 — Block type mismatch vs explicit intent:**
```
const SPREADSHEET_RE = /spreadsheet|\bcsv\b|excel|export/i
const CHART_RE = /\bchart\b|visuali[sz]e|graph|plot/i
const REASONING_RE = /\bwhy\b|reasoning|because|explain why/i

if SPREADSHEET_RE.test(userMessage) AND !blocks.some(b => b.type === 'spreadsheet'):
  → call Haiku to re-emit ONLY a spreadsheet block from the existing data
  → prompt: "User asked for a spreadsheet but got a different format. Convert this content into a spreadsheet AskBlock (type: 'spreadsheet', columns: [...], rows: [...]). Existing content: ${JSON.stringify(blocks).slice(0, 2000)}. Return ONLY a JSON object matching the spreadsheet AskBlock schema."
  → max_tokens 2000, temperature 0
  → on parse success: PREPEND the spreadsheet block to existing blocks (do not replace — additive)
  → healed=true, healReason='wrong_block_type'

(Repeat pattern for CHART_RE → ensure styled_chart present; REASONING_RE → ensure ai_reasoning present. If pipelinePath === 'deliverable', skip the chart/reasoning checks since that pipeline emits HTML, not blocks.)
```

**Check 3 — Empty blocks on data question:**
```
const DATA_RE = /how much|how many|revenue|sales|customers|orders|top|best|worst|average|total|count/i

if DATA_RE.test(userMessage) AND blocks.length === 0 AND pipelinePath === 'main':
  → call Haiku once with: "User asked a data question but the response had no visual blocks. Re-emit the response with AT LEAST one appropriate AskBlock (kpi_card, data_table, or aurora_summary). User question: ${userMessage}. Original text: ${rawResponse.slice(0, 1500)}. Return ONLY <json_blocks>[...]</json_blocks>."
  → max_tokens 2000, temperature 0
  → extract blocks from the response
  → healed=true, healReason='empty_on_data_question'
```

All Haiku calls in this file:
- Use the existing Anthropic SDK client from src/lib/aria/ (do not import a new one)
- Wrap in try/catch — on any error, return original blocks with healed=false (NEVER crash the request)
- Log each heal attempt to aria_ai_calls with agent_key='heal', request_summary='${healReason}', response_summary=success/failure
- Set learning_signal='healed:${healReason}' on the row so the weekly learning pass can see the pattern

### Hook into route.ts

In src/app/api/aria/ask/route.ts:

1. Import validateAndHeal at the top with other lib imports.

2. On the MAIN-BRAIN path: AFTER the existing `const blocks = extractBlocks(rawResponse)` (or equivalent), BEFORE the NextResponse.json return, add:
```ts
const validated = await validateAndHeal({
  userMessage: message,
  blocks,
  rawResponse,
  pipelinePath: 'main',
  businessId: business_id
})
// use validated.blocks instead of blocks from here on
// include validated.healed and validated.healReason in the JSON response (for client diagnostics / future UI badge)
```

3. On the DELIVERABLE path: AFTER generateDeliverable returns the [DELIVERABLE:outputId] sentinel, call validateAndHeal with pipelinePath='deliverable' and blocks=[] — this catches the spreadsheet-class bug for cases where SPREADSHEET_RE didn't match in the gate but the user's intent was still a spreadsheet. The validator's Check 2 will prepend a spreadsheet block if needed using the deliverable's data (read the deliverable's output content from aria_outputs table if needed — keep this read-only, do not mutate the deliverable).

4. Use additive str_replace edits. Do not rewrite route.ts wholesale.

### What this sprint does NOT do
- Does not modify extractBlocks (parser stays as-is)
- Does not modify the system prompt
- Does not modify the deliverable pipeline's generation logic
- Does not change the intent router gate (the SPREADSHEET_RE addition from FIX-2 stays)
- Does not remove parseAriaResponse client-side legacy parser
- Does not change any block renderer
- Does not add new npm dependencies

## BUILD GATE
- npx tsc --noEmit → 0 errors
- npm run build → PASS
- ONE commit: `feat(heal-1): response validator with malformed-json repair, block-type heal, empty-blocks heal`
- STOP before push. Write reports/sprint-HEAL-1-report.md including:
  - Exact line numbers where validateAndHeal is called on both paths
  - One paragraph confirming: extractBlocks untouched, deliverable pipeline untouched, system prompt untouched, no features removed
  - Test plan for founder verification: 4 queries to try in live UI (one malformed-JSON case, one spreadsheet ask via deliverable path, one chart ask, one "how much revenue" with empty-block edge case)

## DO NOT
- Do not touch vercel.json (stays at 22 functions)
- Do not block the request on heal failure — always degrade gracefully
- Do not call Sonnet or Opus from this validator — Haiku only (cost + speed)
- Do not log full message content to aria_ai_calls (use first 100 chars only — privacy)
