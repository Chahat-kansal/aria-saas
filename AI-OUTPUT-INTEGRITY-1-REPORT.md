# AI-OUTPUT-INTEGRITY-1 — app-wide scaffold-concat audit + generalized output guard

Read this first if you're deciding whether the BRIEF-INTEGRITY-1 failure class ("scaffold
strings built after the LLM call and glued onto/replacing real output, on the success path")
exists anywhere else in the app. Short answer at the top, evidence below.

## Verdict

**The exact bug signature was audited across all 197 real AI-call/AI-consumer files in the app
and found in zero of them beyond the one already-fixed incident
(`src/app/api/cron/generate-briefings/route.ts`, fixed and re-verified clean twice this sprint).**
This specific vulnerability class is closed everywhere it was searched.

That is **not** the same as "every AI call site is now hardened." ~146 call sites still call the
Anthropic/OpenAI/Gemini SDKs directly instead of through the 5 canonical `grounded.ts` wrappers
this sprint hardened with `safeAIOutput()`. Those sites are clean of *this specific* bug today
(confirmed by the same audit), but they get **no structural backstop** if the pattern is ever
introduced into one of them later — only the 5 wrappers + anything built on them going forward
are protected by construction. Section 4 lists all of them, unfiltered.

---

## 1. Audit — full inventory, methodology, results

### Scope construction

Two independent greps, unioned and deduplicated, rather than trusting AI-GROUNDING-1's prior
inventory from memory (files change; re-derived live against current `src/`):

1. Direct SDK/API usage: `new Anthropic(`, `from '@anthropic-ai/sdk'`, `from 'openai'`,
   `generativelanguage.googleapis.com` — **181 files**.
2. Consumers of the shared AI-calling infrastructure that *don't* call an SDK directly themselves
   (the exact shape of the original bug — `generate-briefings/route.ts` never imports
   `@anthropic-ai/sdk`, it calls `runParallelAriaAgents`, which does): `runParallelAriaAgents`,
   `runGroundedAnalysis`, `runCustomerFacingCopy`, `runActionPlanner`, `runBackgroundAgent`,
   `runVisionOrMedia`, `callAnthropic(`, `callAnthropicWithTools(`, `runAgentStream`,
   `callGemini(` — **26 files**.

Union, deduplicated: **197 files.**

### The exact signature searched for

Hardcoded label/section/scaffold strings (internal prompt-construction artifacts — section
headers, instructional notes, things like `"DO NOT open with..."` or
`"TODAY'S RECOMMENDATION (max 1):"`) **concatenated or assigned onto/around an AI response
variable AFTER the call returns**, where the combined/mutated value is then **stored or returned
on the success path** (not an error/catch branch).

Explicitly **not** a match: building context and feeding it **into** the prompt as call input
(the correct, common pattern); genuinely user-facing formatting (email wrapping, currency
symbols, a caveat sentence addressed to the reader like response-validator.ts's "I couldn't
verify some specific figures..." hedge, or ask/route.ts's "Here's your full business overview:"
lead-in) — these read as content for the human, not artifacts meant for the model.

### Method

All 197 files read in full (not grepped-and-guessed) by 8 parallel audit passes plus 3 files
independently re-verified directly by the orchestrating pass after one sub-agent's report came
back inconclusive on completion status. Each file traced from the point an AI response variable
is received through to wherever it's stored (DB insert/update) or returned
(`NextResponse.json`/streamed response), checking every concatenation/reassignment touching that
variable along the way.

### Result: 0 matches, 197/197 clean

- **196 files**: no match. Every hardcoded string found was either input-side (fed into the
  prompt before the call — correct and common) or genuine user-facing framing/caveats (explicitly
  excluded by the signature definition above).
- **1 file** (`src/app/api/cron/generate-briefings/route.ts`) was the historical, already-fixed
  incident. Independently re-verified clean by two separate audit passes this sprint: all
  previously-glued-on context blocks (revenue, stock, movers, weekly labour, weather, AU news,
  today's recommendation, anti-repetition) are confirmed fed **into**
  `runParallelAriaAgents` as `extraTasks` before the LLM call, not concatenated after; the stored
  value derives only from `parallelResult.merged` through `suppressUpbeatCloser` and
  `safeBriefingContent()`, with no scaffold string glued on anywhere on the success path. No
  regression.

### Closest non-matches, for the record (all ruled out, reasoning kept for future audits)

- `src/app/api/aria/roster/route.ts:216` — `reasoning = \`${reasoning} ${note}\`.trim()` appends
  a real guardrail disclosure ("Aria limits closures to 2 days/week — reopened N day(s)...") to
  the AI's reasoning text. User-facing explanation of an action actually taken on the data, not an
  internal instruction — not a match.
- `src/app/api/widget/chat/route.ts` — strips a `FOLLOWUP:` scaffold marker **out of** the AI's
  own text before returning it (the inverse of the bug — cleanup, not contamination).
- `src/lib/aria/parallel-orchestrator.ts:128` — `r.label + ': ' + r.result` concatenation only
  fires in the merge LLM's own `catch` block (error path, explicitly excluded).
- `src/app/api/aria/ask/route.ts:745` — the `[DELIVERABLE:...]` embed-token pattern. Looks
  adjacent to a scaffold leak but is a deliberate, documented UI sentinel the frontend
  (`ask-aria/page.tsx`) strips via regex before rendering — never reaches the end-user surface
  unprocessed. Flagged for awareness, not counted as a match.
- `src/lib/aria/documents/long-doc-processor.ts:44` — `[Pages ${range}]:` prefix on chunk
  summaries is a page-provenance citation useful to the reader, not an internal artifact.

No code changes were needed as a result of the audit itself — there was nothing new to fix.

---

## 2. `safeAIOutput()` — generalized from `safeBriefingContent()`

New file: `src/lib/aria/ai-output-guard.ts`.

```ts
export function safeAIOutput(text: string | null | undefined, fallback: string, opts?: SafeAIOutputOptions): string
```

Same contract `safeBriefingContent()` already enforced for `aria_daily_briefings.content` —
never returns raw/empty/scaffold-contaminated text, only the trimmed real text or the caller's
fallback, nothing partially glued — generalized to accept any fallback string and any marker set,
so it's usable by every AI-output write/return path in the app, not just one table.

`GENERIC_SCAFFOLD_MARKERS` is a superset combining three previously-separate marker lists that
existed independently before this sprint:
- The exact strings BRIEF-INTEGRITY-1 confirmed leaking in production (`"DO NOT open"`,
  `"max 1)"`, `"prior briefings"`).
- This app's own internal prompt-scaffold header text (`grounded.ts`'s `withGrounding()`
  produces `"ANTI-HALLUCINATION"` and `"REAL DATA (the only source of truth..."` blocks) — a real
  leak of either means the model echoed system-prompt internals back into its output.
- AI-GROUNDING-1's `runCustomerFacingCopy` leak-pattern regexes (`[INSERT...]`, `TODO`,
  `{{...}}`, `placeholder`, `system prompt`, `API key`), previously checked only for
  customer-facing text — now checked for every output kind.

`src/lib/aria/briefing-guard.ts` — **extend, not replace**: `safeBriefingContent()` and
`hasScaffoldMarkers()` keep their exact existing signatures and behavior for their 3 existing
callers (`generate-briefings.ts`, `daily-briefing-submit.ts`, `daily-briefing-poll.ts`), now
implemented as thin delegations to `safeAIOutput()`/the generic `hasScaffoldMarkers()` with the
briefing-specific marker set. Zero behavior change for briefings; the generic function is now the
one real implementation instead of a parallel copy.

---

## 3. Folded into the 5 canonical `grounded.ts` entry points

Every one of `runGroundedAnalysis`, `runCustomerFacingCopy`, `runActionPlanner` (both its
tool-loop and plain branches), `runBackgroundAgent`, and `runVisionOrMedia` now routes the
model's raw response text through `safeAIOutput(resp.raw, '', { label })` **before** it's parsed
into structured data or returned as plain text:

- For the four JSON-shaped wrappers, a scaffold match or empty response collapses `resp.raw` to
  `''`, which the existing `cleaned ? parse(...) : resp.data` fallback logic already handles
  correctly — a scaffold-contaminated raw response can no longer leak through
  `parseLLMJsonOr`'s parsing into `data`.
- `runCustomerFacingCopy` now uses `safeAIOutput()` as its single safety pass instead of a
  separate local `LEAK_PATTERNS` array — that array's regexes were folded into
  `GENERIC_SCAFFOLD_MARKERS` (a dedup, not a narrowing: the same checks still run, plus the
  scaffold-marker checks every other wrapper now shares).

This means migrating a not-yet-migrated call site through `grounded.ts` and closing this specific
vulnerability for that site become the same unit of work — the stated motivation for finishing
the ~146-site AI-GROUNDING-1 backlog, not a separate competing task.

tsc: 0 errors. Build: green (see build log referenced in the commit).

---

## 4. Honest remaining-risk list — not silently "all clear"

The audit (section 1) found the *specific bug* nowhere outside the one already-fixed file. It did
**not** find zero risk everywhere: every file below calls an AI SDK directly rather than through
one of the 5 guarded wrappers, so none of them benefit from `safeAIOutput()` by construction —
only from whatever ad hoc handling each file already has. If the scaffold-concat pattern is ever
introduced into one of these (a new "helpful" prefix, a debug label left in during a future
edit), nothing in the shared infrastructure would catch it. This is the same ~146-site list
AI-GROUNDING-1 filed for a follow-up batch, carried forward here as the concrete "at risk" answer
this sprint's own instruction requires, in the same category order (highest real-world risk
first):

**customer-facing (31)** — output reaches an end customer directly, unreviewed:
`aria/auto-review` (auto-sends SMS), `customers/[id]/winback`, `aria/winback`,
`agents/message-agent` (auto-sends when risk is low), `aria/winback-compose`,
`aria/winback-message`, `pos/customers/sms-draft`, `invoices/reminder`, `aria/quote-followup`,
`visa/generate-doc`, `pos/online-orders/aria-upsell`, `pos/customer-greet`, `lib/pos/ai-split.ts`,
`pos/display-suggestions`, `public/instore/recipe`, `public/widget/chat`, `widget/chat`,
`aria/talk`, `aria/generate-quote`, `aria/marketing-campaigns`, `aria/generate-promotion`,
`aria/competitor-opportunities`, `aria/influencer/generate`, `social/growth-post`,
`social/owner-request`, `community/owner/marketer/plan`, `community/owner/ai-draft`,
`wholesale/aria-intelligence`, `seo/generate-fix`, `reels/captions`.

**autonomous-action (22)** — writes/decides with no human review:
`public/menu/[business_id]/descriptions`, `pos/recipes/import` (`aiParseText`),
`pos/recipes/[id]/allergens`, `cron/parcel-insights`, `aria/daily-narrative`,
`agents/bas/classify-products`, `agents/automation-agent`, `reels/ai-edit`,
`agents/orchestrator`, `suppliers/price-lists`, `pos/production-plan`,
`aria/warehouse-slotting`, `lib/intelligence/agent.ts`, `research`, `products/barcode-lookup`,
`execute-autofix`, `chat`, `lib/aria/agents/query-agent.ts`.

**vision-media (20)** — image/video generation, separate provider system (Higgsfield/Imagen/Veo/
DALL-E), lower priority than vision *analysis* (already migrated via `runVisionOrMedia`):
`pos/recipes/import` (`parsePdf`, `aiParseImage`), `aria/studio`, `aria/upload`,
`lib/pos/receipt-ocr.ts`, `screenshot-to-code`, `pos/menu-extract` (OpenAI fallback),
`pos/products/generate-image`, `lib/aria-tools.ts`, `aria/test-tools`,
`lib/aria/context-brain.ts`, `aria/studio/influencer-video`, `studio/generate-video`,
`lib/aria/image-direct.ts`, `aria/receipt-scan` (Gemini-first path only — the Claude fallback is
already migrated).

**background-analysis (~73)** — owner reads, acts manually; lowest priority for migration since
there's no direct customer or autonomous-write exposure, but still unguarded by construction:
every remaining `aria/*`, `seo/*`, `pos/*` single-purpose insight route not listed above — e.g.
`aria/product-insights`, `aria/inventory-insight`, `aria/cash-commentary`, `aria/sale-insight`,
`aria/bundle-builder`, `aria/reorder-forecast`, `aria/weekly-report`, `aria/pos-chat`,
`aria/staff-talk`, `aria/explain-metric`, `aria/booking-insights`, `lib/aria-insights.ts`,
`lib/aria/market-prices.ts`, `lib/seo/ai-fix.ts`, and ~60 more. Full per-file list is
AI-GROUNDING-1-REPORT.md's Step 4 background-analysis section, carried forward unchanged — this
sprint's audit read every one of them (section 1) and found none newly at risk of the specific
scaffold-concat bug, but confirms they remain outside the guarded wrapper set.

31 + 22 + 20 + ~73 ≈ **146**, matching this sprint's own "~145 remaining" estimate.

---

## Plain answer to the sprint's own question

**Is the vulnerability class closed everywhere?** For the exact signature audited (post-call
scaffold concatenation) — yes, confirmed against all 197 real AI-call/consumer files, zero
instances beyond the one already-fixed incident. **Is every AI output path structurally
guaranteed against this class forever?** No — only the 5 canonical `grounded.ts` entry points (and
anything built on them from here on) carry the `safeAIOutput()` backstop by construction. ~146
call sites are clean *today* but structurally unprotected; migrating each through `grounded.ts`
is the only way to make that guarantee permanent for that site, which is exactly what
AI-GROUNDING-1's remaining backlog now also accomplishes for this bug class as a side effect.

## Build/typecheck verification

```
npx tsc --noEmit   → 0 errors (main app)
npx next build     → green
```
