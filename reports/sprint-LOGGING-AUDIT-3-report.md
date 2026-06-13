# Sprint LOGGING-AUDIT-3 — Unify aria_ai_calls Role/Provider Validation + Error Checking
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green
**Stacks on:** amended COUNCIL-LOG-FIX-1 (`fc44e6aa`, unpushed) — both commits push together.

> The CHECK-constraint silent-drop bug (COUNCIL-LOG-FIX-1) affected **23 role + 8 provider** literal
> values across ~28 loggers. Every off-list value made its agent_key write ZERO rows. Fixed all to
> the nearest valid CHECK value, added `.error` checks to the central loggers, and added a typed
> `logAICallSafe` helper so future off-list values are a COMPILE error, not a silent runtime drop.

---

## Files changed (33 + report)

- `src/lib/aria/log-ai-call.ts` — NEW (Part 4 helper)
- 23 role + 8 provider value fixes across ~28 route/lib loggers (Part 2)
- `.error` checks added to central loggers: `providers/anthropic.ts` ×2, `providers/openai.ts` ×2, `providers/gemini.ts`, `agents/base-agent.ts` (Part 3)

---

## PRE-FLIGHT

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Part 1 — every aria_ai_calls insert site (grep, ~60 matches)
Full `grep -rn "from('aria_ai_calls').insert"` returned 60 sites (file:line list captured in session). Per-insert role+provider extracted via awk. Of the 60: ~28 carry literal `role:`/`provider:` values (the rest are the central providers using `role: params.role`, or fire-and-forget `waitUntil` blocks using legacy column names — see notes).

### Part 5 — existing helper?
None existed (`ls src/lib/aria/log-ai-call.ts` → not found). Created fresh (Part 4).

---

## Part 2 — Mismatch table (file:line × old → new × reason)

**Roles** (verified valid list: generator, judge, search, data, forecast, chat, classify, analysis, embed, narrative, reorder, rostering, competitor, social, briefing, generate_image, image, document, pricing, product, customer, inventory, schedule, compliance, other):

| File:line | old role | new role | semantic basis |
|---|---|---|---|
| aria/competitive-brief:66 | brief | briefing | a competitive brief |
| aria/competitor-opportunities:78 | opportunities | competitor | competitor analysis |
| aria/delivery-prediction:66 | prediction | forecast | prediction = forecast |
| aria/menu-optimisation:76 | menu_insights | analysis | analytical insight |
| aria/recipe-scale:54 | scale | other | no scale role |
| aria/sale-insight:73 | sale_analysis | analysis | sales analysis |
| aria/social-listening:57 | sentiment | social | social listening |
| aria/supplier-savings:83 | procurement | reorder | procurement≈reorder |
| aria/theft-detection:80 | loss_prevention | other | no LP role |
| customers/import-map:62 | import | data | data import |
| customers/[id]/summarise:79 | summary | narrative | produces a summary narrative |
| invoices/draft-ai:66 | draft | other | no draft role |
| invoices/reminder:111 | draft | other | " |
| pos/quick-promo-suggest:56 | flash_promo | pricing | promo = pricing action |
| recipes/compare:61 | compare | other | no compare role |
| recipes/import:91 | import | data | data import |
| sentry/webhook:130 | diagnosis | other | no diagnosis role |
| tickets/generate:61 | generate | generator | generate→generator |
| lib/aria/context-brain:33 | council | analysis | council context = analysis (matches COUNCIL-LOG-FIX-1) |
| lib/aria/memory/summarize:111 | guard | other | summarizer_guard |
| lib/aria/response-validator:36 | validator | other | heal validator |
| lib/aria-tools:715 | guard | other | sql_guard |
| lib/reports/weekly-ai:160 | promo | pricing | promo = pricing |

**Providers** (verified valid list: anthropic, openai, google, xai, perplexity, tavily, exa, openrouter, go-upc, upcitemdb, open-meteo, geoapify, moonshot, zai, other):

| File:line | old provider | new provider | reason |
|---|---|---|---|
| aria/artifact-parse-failure:10 | system | other | 'system' off-list |
| aria/deliverable-email:85 | system | other | " |
| aria/deliverable-pdf:32 | system | other | " |
| warehouse/suppliers/[id]/send-order:127 | system | other | " |
| tickets/generate:61 | internal | other | 'internal' off-list |
| lib/aria/context-brain:36 | gemini | google | provider name is 'google' (Gemini API) |
| lib/aria/memory/summarize:111 | internal | other | 'internal' off-list |
| lib/aria-tools:715 | internal | other | " |

**Excluded (NOT loggers):** `provider:'gemini'/'veo'/'user_upload'/'openai-mini'/'none'` at aria-tools.ts:1043-1045, studio routes, social-suggest — these are image-model config objects / generation results, not `aria_ai_calls` inserts.

## Part 3 — .error checks added (central, high-traffic loggers)
`providers/anthropic.ts` :99 (callAnthropic) + :245 (callAnthropicWithTools — the ask_aria main path), `providers/openai.ts` :67 + :143, `providers/gemini.ts` :109, `agents/base-agent.ts` :101. Each now `const { error } = await …insert(…); if (error) console.error('[aria_ai_calls insert failed]', { agentKey, role, reason })`. Standardised log line is greppable in Vercel. These carry the bulk of traffic; the long-tail one-off route loggers now write valid values (so they land) and the typed helper is the migration path for adding `.error` to them incrementally.

**Flagged for follow-up (not fixed — type-level, beyond value scope):** the central loggers insert `role: params.role` where `params.role: AgentRole`. The `AgentRole` union (types.ts:21) still contains `'agent'` and `'export'`, which are **off the CHECK list** — any caller passing those will now be SURFACED by the new `.error` log (previously silent). Tightening `AgentRole` to the CHECK list (or routing all callers through `logAICallSafe`) is a clean follow-up (LOGGING-AUDIT-4).

## Part 4 — `logAICallSafe` helper (`src/lib/aria/log-ai-call.ts`)
Exports `AiCallRole` + `AiCallProvider` literal unions (mirroring the pg_constraint lists) + `AiCallRow` type + `async logAICallSafe(row): Promise<boolean>` that inserts, checks `.error`, logs the standardised line, and returns success. Off-list role/provider is now a **TypeScript compile error**. New loggers (and incremental migration of existing ones) use this single entry point.

## Confirmations
- **No agent_key renamed** — only `role`/`provider` values standardised. Every `agent_key` (`heal`, `sql_guard`, `summarizer_guard`, `council_*`, `competitive_brief`, `sale_insight`, …) is byte-identical ✓
- **Semantic meaning preserved** — each role mapped to its nearest valid CHECK value (table above); the *task type* each row records is unchanged (a forecast stays a forecast, a reorder a reorder) ✓
- **CHECK constraint not modified** (out of scope — schema) ✓ · no dependencies ✓ · no non-logging code path touched (every edit is inside an `aria_ai_calls` insert or the new helper) ✓ · RULE 0: values corrected + error-checking + helper ADDED, nothing removed ✓

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓ (helper's literal unions compile)
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH**

## Verify post-deploy
After one full test chat:
```sql
select agent_key, role, provider, count(*) as fires
from aria_ai_calls
where agent_key in ('summarizer_guard','sql_guard','heal','advisor_guard',
  'council_synthesis','council_cache','council_log_failure')
  and created_at > now() - interval '30 minutes'
group by agent_key, role, provider order by agent_key;
```
Pass: rows appear for every agent_key the test exercises; role ∈ valid list (heal/sql_guard/summarizer_guard → `other`; council_synthesis → `analysis`; council_cache → `other`). Any NEW silent rejection now emits `[aria_ai_calls insert failed]` in Vercel logs with the exact agent_key + role + reason.
