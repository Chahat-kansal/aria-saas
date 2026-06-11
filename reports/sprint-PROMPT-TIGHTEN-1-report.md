# Sprint PROMPT-TIGHTEN-1 — Brevity Intent Strict Override
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green

---

## Files changed

| File | Change |
|---|---|
| `src/app/api/aria/ask/route.ts` | BREVITY INTENT — STRICT OVERRIDE block appended after RICH RENDERER SELECTION; `requestSummary: message.slice(0, 100)` passed at both `agentKey: 'ask_aria'` call sites |
| `src/lib/aria/providers/anthropic.ts` | Additive `requestSummary?: string` param on `ToolLoopParams`; `request_summary` now written in the `aria_ai_calls` insert |

---

## Pre-flight findings

### The offending "2 paragraphs narrative" rule — exact text (found in TWO places)

**Location 1 — line 1067** (under `### CRITICAL — narrative before blocks (non-negotiable)`):
> ALWAYS write at least 2 full paragraphs of narrative analysis BEFORE the <json_blocks> tag. Never output a block without preceding narrative text. If you have data to show in a chart or table, explain what it means first, then add the block. A response that starts with or only contains a block is always wrong.

**Location 2 — line 1153** (last bullet of CRITICAL RENDERER RULES in the RICH RENDERER SELECTION section):
> - ALWAYS write 2 full paragraphs of narrative BEFORE the json_blocks tag, even for simple queries

Note the second one says "even for simple queries" — this is the direct cause of the advisory-paragraph behaviour on brevity questions. Neither rule was removed (RULE 0 / append-only); the new BREVITY block explicitly SUSPENDS them when brevity signals fire.

### Council trigger rule
No explicit `council_read` trigger rule exists anywhere in the system prompt (grep for `council_read` in route.ts: zero matches in the prompt text). The council behaviour comes from the route-level `runAriaCouncil` calls (route logic — untouched per DO NOT). Per spec, the safety line was therefore added at the end of the BREVITY block:
> "When BREVITY fires: NEVER emit council_read, comparison_table, alert_card, or ai_reasoning. These are advisory-mode blocks only."

### request_summary logging
Verified: the `aria_ai_calls` insert for `agent_key='ask_aria'` lives in `callAnthropicWithTools` in `src/lib/aria/providers/anthropic.ts` (line ~244), not in route.ts directly — and it never wrote `request_summary` (explains the SQL finding of all-empty values). Fix: additive optional `requestSummary` param on `ToolLoopParams`, written as `request_summary: params.requestSummary ?? null`, and `requestSummary: message.slice(0, 100)` passed from BOTH `ask_aria` call sites in route.ts:
- General/web-search path (line ~493)
- Main chat tool-loop path (line ~1500)

---

## Insertion location of the BREVITY block

Inserted in the system prompt template immediately AFTER the final CRITICAL RENDERER RULES bullet and BEFORE `### Plain text`. Surrounding lines:

```
- Can return MULTIPLE blocks together — e.g. aurora_summary + progress_bars + activity_stream for a weekly debrief
- ALWAYS write 2 full paragraphs of narrative BEFORE the json_blocks tag, even for simple queries

### BREVITY INTENT — STRICT OVERRIDE        ← NEW BLOCK STARTS HERE (line ~1155)
...
ADVISORY MODE — DEFAULT (unchanged)
...

### Plain text                               ← existing section, untouched
```

The block contains: the suspension rule, the BREVITY signal list, the three fire examples, the two CORRECT/WRONG example pairs, the council/advisory-block suppression safety line, and the ADVISORY MODE default clarification — exactly as specified.

---

## Additive-only confirmation

No rules removed, only new enforcement appended: the two existing "2 paragraphs" rules, the full RICH RENDERER SELECTION table, the AUTONOMOUS FORMAT SELECTION table, and the SPREADSHEET OVERRIDE all remain verbatim; the BREVITY block is a conditional override layered on top, and the `requestSummary` parameter is optional (all other `callAnthropicWithTools` callers are unaffected — they simply log `request_summary: null` as before).

---

## Test plan — 6 queries with expected output format

| # | Query | Expected |
|---|---|---|
| 1 | "just tell me how much I made this week" | ONE `bold_metric` block, ≤1 sentence, NO advisory words (bundle/outreach/lever/gap) |
| 2 | "what's my revenue today?" | ONE `animated_kpi` block, ≤1 sentence, no next-steps, no weekly comparison |
| 3 | "today's orders" | ONE `bold_metric` or `animated_kpi`, number only |
| 4 | "what should I focus on this week?" | Full advisory — 2-paragraph narrative, council_read/action_list allowed |
| 5 | "why is revenue down?" | `ai_reasoning` + supporting blocks, full narrative |
| 6 | "give me deep analysis of last 30 days" | Multi-block advisory (aurora_summary/charts/tables), full narrative |

Also verify in `aria_ai_calls`: new `ask_aria` rows now have `request_summary` = first 100 chars of the question (was `''` on the last 25 rows) — this is the measurement hook for the brevity-adherence sprint.

---

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)
