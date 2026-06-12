# Sprint TIGHTEN-1-REDO — Brevity Actually Suppresses "2 Paragraphs" Rules
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green

> Note: the sprint wrapper asked for `reports/sprint-WEEK-1-report.md` — that file belongs to the
> already-committed WEEK-1 sprint (`4c51eed6`) and was NOT overwritten. This sprint's report is this file.

---

## Files changed

| File | Change |
|---|---|
| `src/app/api/aria/ask/route.ts` | Both "2 paragraphs" rules wrapped in BREVITY conditionals; override reminder line added at top of BREVITY block. Pure prompt edit — zero code-logic changes. |

---

## Pre-flight findings

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Both "ALWAYS" rules — verbatim as found (lines shifted slightly since PROMPT-TIGHTEN-1 due to GROUNDING/BREVITY insertions)

**Rule 1 — line 1070** (under `### CRITICAL — narrative before blocks (non-negotiable)`):
> ALWAYS write at least 2 full paragraphs of narrative analysis BEFORE the <json_blocks> tag. Never output a block without preceding narrative text. If you have data to show in a chart or table, explain what it means first, then add the block. A response that starts with or only contains a block is always wrong.

**Rule 2 — line 1156** (last bullet of CRITICAL RENDERER RULES, two lines above the BREVITY block):
> - ALWAYS write 2 full paragraphs of narrative BEFORE the json_blocks tag, even for simple queries

### Block presence confirmed
- `### BREVITY INTENT — STRICT OVERRIDE` present at line 1158 (PROMPT-TIGHTEN-1, commit `28f1966f`) ✓
- `### GROUNDING RULE — STRICT` present at line 1186 (GROUND-1, commit `fd7d1e8d`) ✓

### Pre-flight grep (verbatim)
```
grep -n "2 full paragraphs|BREVITY INTENT|GROUNDING RULE" src/app/api/aria/ask/route.ts
1070:ALWAYS write at least 2 full paragraphs of narrative analysis BEFORE the <json_blocks> tag. Never output a block without preceding narrative text. If you have data to show in a chart or table, explain what it means first, then add the block. A response that starts with or only contains a block is always wrong.
1156:- ALWAYS write 2 full paragraphs of narrative BEFORE the json_blocks tag, even for simple queries
1158:### BREVITY INTENT — STRICT OVERRIDE
1186:### GROUNDING RULE — STRICT
```

---

## Edits applied (exactly per spec)

**Rule 1** now reads:
```
### CRITICAL — narrative before blocks (non-negotiable)
UNLESS BREVITY INTENT FIRES (see BREVITY block below):
ALWAYS write at least 2 full paragraphs of narrative analysis BEFORE the <json_blocks> tag. […]
This rule is SUSPENDED when the user's message matches a BREVITY signal — emit ONE block + at most one sentence, no advisory.
```

**Rule 2** now reads (kept as a single bullet for list integrity):
```
- UNLESS BREVITY INTENT FIRES (see BREVITY block below): ALWAYS write 2 full paragraphs of narrative BEFORE the json_blocks tag, even for simple queries. This rule is SUSPENDED when the user's message matches a BREVITY signal — emit ONE block + at most one sentence, no advisory.
```

**BREVITY block** opening line inserted:
```
### BREVITY INTENT — STRICT OVERRIDE

THIS BLOCK OVERRIDES THE "2 PARAGRAPHS NARRATIVE" RULES ABOVE. When a BREVITY signal fires, treat those rules as if they don't exist for this response.
```

## Constraints honoured
- Neither "2 paragraphs" rule deleted — both still apply verbatim in advisory mode (additive-in-spirit: wrapped, not removed)
- No other system-prompt rule changed; GROUNDING block untouched; BREVITY signals/examples untouched
- HEAL-1 / GROUND-1 validator code untouched
- Pure prompt edit — zero TypeScript logic changes (the diff is entirely inside the template literal)

## Verify (founder + chat Claude, post-deploy)
1. Ask: **"just tell me how much did I make today?"**
2. Pass: one `bold_metric` OR `animated_kpi` block; ≤1 sentence; ZERO occurrences of "bundle", "activate", "lever", "gap", "crisis", "customers", "11 consented".
3. Chat Claude SQL:
```sql
select left((messages::jsonb->-1->>'content'), 400) as last_aria_reply
from aria_conversations
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
order by last_message_at desc limit 1;
```
Pass = response is short, single block.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)
