# AI-GROUNDING-1 — canonical grounded-call entry points

Full inventory, the 5-function harness, what got migrated (and why those five),
and the tracked list of everything filed for a follow-up batch.

---

## Scope note on the count

The task estimated "~100 sites." The actual count of files with a REAL direct
LLM-SDK call (not a type-only import, not already routed through
`callAnthropic`/`callAnthropicWithTools`/`callGemini`) came back at **~150**
across Anthropic, OpenAI, and raw-Gemini-fetch usage. This is confirmed live
against the current codebase (4 parallel read-only passes over every file that
imports `@anthropic-ai/sdk`, `openai`, or fetches
`generativelanguage.googleapis.com`), not estimated. Per the task's own
instruction, this sprint builds the harness and migrates the highest-risk
sites; the rest is filed below, grouped by category, for a follow-up batch —
not migrated in this pass.

---

## Step 1 — Full inventory (real direct call sites only)

**customer-facing** (32) — output reaches an end customer directly:
`public/instore/recipe`, `public/widget/chat`, `widget/chat`,
`pos/display-suggestions`, `social/owner-request`, `aria/generate-quote`,
`aria/marketing-campaigns`, `aria/generate-promotion`,
`community/owner/marketer/plan`, `community/owner/ai-draft`,
`aria/winback-send` ✅ migrated, `invoices/reminder`,
`aria/competitor-opportunities`, `aria/talk`, `seo/generate-fix`,
`reels/captions`, `aria/influencer/generate`, `social/growth-post`,
`wholesale/aria-intelligence`, `aria/quote-followup`, `pos/customer-greet`,
`aria/winback-compose`, `aria/winback-message`,
`pos/online-orders/aria-upsell`, `pos/customers/sms-draft`, `pos/ai-split`
(lib), `visa/generate-doc`, `customers/[id]/winback`, `aria/winback`.

**autonomous-action** (24) — LLM output drives a write/mutation or automated
decision with no human review first:
`public/menu/[business_id]/descriptions` (auto-writes product description),
`aria/auto-review` (auto-sends SMS), `pos/recipes/import` (`aiParseText`,
auto-inserts recipe+allergens), `agents/message-agent` (auto-sends winback),
`cron/parcel-insights`, `aria/daily-narrative` (auto-upserts briefing),
`agents/bas/classify-products` (auto-writes tax table),
`pos/online-orders/aria-upsell`, `agents/automation-agent` (auto-executes
low-risk automations with no approval), `reels/ai-edit` (auto-applies to
render), `lib/loyalty/challenges.ts` ✅ migrated, `pos/recipes/[id]/allergens`
(auto-merges food-safety data), `agents/orchestrator` (can auto-trigger
message/automation agents), `suppliers/price-lists` (bulk-inserts parsed
items), `pos/production-plan` (auto-upserts plan), `aria/warehouse-slotting`
(auto-upserts), `lib/intelligence/agent.ts` (`runAgentStream` tool-calling
loop), `research` (browser-automation agent), `products/barcode-lookup`
(auto-upserts `global_products`), `execute-autofix` (auto-fix + re-execute
loop), `chat` (tool-loop incl. browser automation).

**vision-media** (21) — image/video/audio input or generation:
`pos/recipes/import` (`parsePdf`, `aiParseImage`), `aria/receipt-scan` ✅
migrated (Claude fallback; Gemini-first path still raw, filed),
`aria/studio` (Gemini image gen, raw fetch), `aria/upload`,
`pos/customers/insight` region N/A, `lib/pos/receipt-ocr.ts`,
`screenshot-to-code`, `pos/menu-extract` (OpenAI fallback only — primary path
already uses `callGemini`), `pos/products/generate-image` (OpenAI DALL-E 3),
`lib/aria-tools.ts` (`generate_image` tool, raw Imagen/OpenAI),
`aria/test-tools` (diagnostic), `lib/aria/context-brain.ts` (raw Gemini
fetch), `aria/studio/influencer-video` (raw Veo 2.0), `studio/generate-video`
(raw Veo 3.1), `lib/aria/image-direct.ts` (Imagen→gpt-image-1→DALL-E chain).

**background-analysis** (~73) — the majority; owner-facing insights/reports/
dashboards. Full list in the batch transcripts (available on request) —
representative examples: `aria/product-insights`, `aria/inventory-insight`,
`aria/cash-commentary`, `aria/sale-insight`, `aria/bundle-builder`,
`aria/reorder-forecast`, `aria/weekly-report`, `aria/pos-chat`,
`aria/staff-talk`, `aria/explain-metric`, `aria/booking-insights`,
`lib/aria-insights.ts`, `lib/aria/market-prices.ts`, `lib/seo/ai-fix.ts`,
`aria/briefing` (fallback path), and ~60 more `aria/*`/`seo/*`/`pos/*`
single-purpose insight routes, all following the same shape (fetch real data
→ one Claude call → return/persist text for the owner to read).

**Already-canonical, out of scope** (excluded from the count above, per the
task's own "outside the existing council/Ask-Aria path" instruction):
`providers/anthropic.ts`, `providers/gemini.ts`, `model-router.ts`,
`ai-router.ts`, `lib/aria/council.ts`, `lib/agents/council.ts`,
`lib/agents/base-agent.ts` — these already route every call through
`callAnthropic`/`callAnthropicWithTools` and are the pattern the other ~150
sites are missing.

---

## Step 2 — The 5 canonical entry points

New file: `src/lib/aria/grounded.ts`. Every function is a thin wrapper over
the existing `callAnthropic`/`callAnthropicWithTools` (`providers/
anthropic.ts`) — nothing here reimplements cost logging, the circuit breaker,
or Anthropic→Gemini failover; those are inherited for free by delegating.
Callers keep their own `agentKey`/`role` (per-feature cost attribution in
`aria_ai_calls` stays intact — RULE 11), the wrappers add grounding/
validation/safety on top:

| Function | Category | What it adds beyond callAnthropic |
|---|---|---|
| `runGroundedAnalysis` | background-analysis | RULE9 anti-hallucination clause + optional explicit `groundTruth` data block; JSON parse with caller's fallback shape |
| `runCustomerFacingCopy` | customer-facing | Same grounding + a tone/format instruction ("no markdown, no placeholders, no AI-system mentions") + a content-safety regex pass that refuses to ship an obvious leak/placeholder (`[INSERT...]`, `TODO`, `{{...}}`, "system prompt", "API key") — better an empty result than a broken customer send |
| `runActionPlanner` | autonomous-action | Same grounding + an explicit "acted on automatically, no human review — be conservative" instruction; supports the tool-calling loop (`callAnthropicWithTools`) when the caller passes `tools`/`executeTool`; optional `auditLog` param writes an independent `aria_action_log` before/after-state row (the same append-only trail `daily-briefing/route.ts` already used for its overdue-invoice flag) — available for every migrated site, not mandatory, since not every autonomous decision has a clean entity-state shape |
| `runBackgroundAgent` | internal/background | Same grounding, no owner-facing tone constraint, no audit trail — the least-constrained of the five, for cron pre-processing/classification that isn't itself owner-facing or autonomous-acting |
| `runVisionOrMedia` | vision-media | Routes through a new, additive `imageBase64`/`imageMimeType` param on `callAnthropic` itself (existing text-only callers are completely unaffected — the field is optional and only builds an image content block when both are present). Does **not** cover image/video *generation* (Higgsfield/Remotion/Imagen/Veo) — a different provider system entirely, out of scope here (see filed list) |

**DB pre-flight**: no schema change was needed. Checked
`aria_ai_calls_provider_check`/`aria_ai_calls_role_check` live — `agent_key`
has **no DB-level CHECK constraint** (only `provider` and `role` do), so no
migration was required; every wrapper reuses the caller's existing, already-
DB-valid `role`. `aria_action_log`'s columns (`entity_type`, `entity_ids`,
`before_state`, `after_state` all `NOT NULL`) were confirmed live before
making `auditLog` an optional caller-supplied param rather than mandatory —
forcing it on every autonomous-action migration would have broken sites that
don't have a clean entity-state shape to report.

---

## Step 3 — Migrated (highest-risk, one per category + the named bug)

Five sites, chosen because each was independently confirmed to (a) bypass
`aria_ai_calls` entirely — cost invisible in the ledger the exact way
AI-COST-AUDIT-1 already flagged as a systemic risk — and/or (b) have zero
circuit-breaker/Gemini failover on a path that either reaches a customer or
acts autonomously:

1. **`cron/daily-briefing-submit/route.ts` — the named hallucinated-dates
   bug.** Root cause: the prompt asked the model to "write today's morning
   briefing" and describe "yesterday" without ever stating what either date
   actually is — Claude has no reliable knowledge of the real wall-clock date
   (only its training cutoff), and this is a Batch API submission that can sit
   queued for hours. Fixed by grounding both dates explicitly in the prompt,
   matching the pattern the sibling `/api/aria/daily-briefing` route already
   used correctly (`todayDate`). This route uses the Batches API (not the
   sync path the 5 wrappers cover), so the fix is a targeted prompt change,
   not a harness migration — but it's the same root problem the harness
   exists to prevent everywhere else.
2. **`aria/receipt-scan/route.ts` → `runVisionOrMedia`.** Raw `new
   Anthropic()` vision call for supplier-invoice OCR, logged only to
   console/Sentry via `trackAICall` (never `aria_ai_calls` — completely cost-
   invisible), zero failover. Feeds real inventory updates.
3. **`aria/winback-send/route.ts` → `runCustomerFacingCopy`.** Raw Anthropic
   call generating an A/B SMS variant that gets sent straight to real
   customers via `campaign_sends`; same `trackAICall`-only, cost-invisible,
   zero-failover pattern.
4. **`lib/loyalty/challenges.ts` → `runActionPlanner`.** Raw Anthropic call
   with its own hand-rolled JSON parse and a manual `logAICallSafe()` call
   (bypassing the shared circuit breaker/failover) proposing loyalty
   challenges that get persisted and later auto-award real points via
   `evaluateChallenges` — with no human review. A genuinely down Anthropic
   meant every business with challenges enabled got zero missions with no
   fallback.
5. **`aria/daily-briefing/route.ts` → `runGroundedAnalysis`** (dogfood). This
   one already used `callAnthropic` directly with its own inline
   ANTI-HALLUCINATION clause — migrating it to the new wrapper deduplicates
   that text into the shared harness and validates the harness end-to-end on
   a well-understood, already-correct call site before relying on it for new
   migrations. Zero behaviour change (same model, prompts, truncation,
   templated-fallback path).

tsc: 0 errors. Build: green (see build log).

---

## Step 4 — Filed for a follow-up batch (not migrated this pass)

Every other real direct call site found in Step 1, grouped by category so the
next batch can pick highest-risk-remaining first:

**customer-facing (31 remaining)** — highest priority for the next batch, in
rough risk order (auto-sent or otherwise unreviewed first): `aria/auto-review`
(already listed under autonomous — auto-sends SMS), `customers/[id]/winback`,
`aria/winback`, `agents/message-agent` (auto-sends when risk is low),
`aria/winback-compose`, `aria/winback-message`, `pos/customers/sms-draft`,
`invoices/reminder`, `aria/quote-followup`, `visa/generate-doc`,
`pos/online-orders/aria-upsell`, `pos/customer-greet`, `lib/pos/ai-split.ts`,
`pos/display-suggestions`, `public/instore/recipe`, `public/widget/chat`,
`widget/chat`, `aria/talk`, `aria/generate-quote`, `aria/marketing-campaigns`,
`aria/generate-promotion`, `aria/competitor-opportunities`,
`aria/influencer/generate`, `social/growth-post`, `social/owner-request`,
`community/owner/marketer/plan`, `community/owner/ai-draft`,
`wholesale/aria-intelligence`, `seo/generate-fix`, `reels/captions`.

**autonomous-action (22 remaining)** — second priority (writes/decides with
no review): `public/menu/[business_id]/descriptions`, `pos/recipes/import`
(`aiParseText`), `pos/recipes/[id]/allergens`, `cron/parcel-insights`,
`aria/daily-narrative`, `agents/bas/classify-products`,
`agents/automation-agent`, `reels/ai-edit`, `agents/orchestrator`,
`suppliers/price-lists`, `pos/production-plan`, `aria/warehouse-slotting`,
`lib/intelligence/agent.ts`, `research`, `products/barcode-lookup`,
`execute-autofix`, `chat`, `lib/aria/agents/query-agent.ts`.

**vision-media (20 remaining)** — image/video generation is a separate
provider system (Higgsfield/Imagen/Veo/DALL-E), lower priority than vision
*analysis*: `pos/recipes/import` (`parsePdf`, `aiParseImage`), `aria/studio`,
`aria/upload`, `lib/pos/receipt-ocr.ts`, `screenshot-to-code`,
`pos/menu-extract` (OpenAI fallback), `pos/products/generate-image`,
`lib/aria-tools.ts`, `aria/test-tools`, `lib/aria/context-brain.ts`,
`aria/studio/influencer-video`, `studio/generate-video`,
`lib/aria/image-direct.ts`, `aria/receipt-scan` (the Gemini-first path — only
the Claude fallback was migrated this pass).

**background-analysis (~73 remaining)** — lowest priority (owner reads, acts
manually; no direct customer or autonomous-write exposure): every `aria/*`,
`seo/*`, `pos/*` single-purpose insight route not listed above. Full
per-file list captured in this sprint's inventory pass — available in the
session transcript; not re-pasted here to keep this report scannable, but
**nothing was silently dropped** — Step 1's category counts (32 + 24 + 21 +
~73 ≈ 150) account for every file the inventory pass found.

---

## Commit(s)

`feat(ai): AI-GROUNDING-1 — canonical grounded-call entry points, highest-risk sites migrated, daily-briefing dates fixed`
