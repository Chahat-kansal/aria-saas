# INTEL-CONTRACT-1 — Aria Intelligence Contract

A consistent structured shape behind every substantive Aria response, so the system always retains
the facts/calculations/assumptions/confidence/provenance underneath an answer, even when the UI
shows only natural prose. Cheap only because its two inputs already existed: INTEL-COMPUTE-1's
deterministic figures and INTEL-TRUTH-1's verified/derived/estimated typing. This sprint assembles
them into one contract — it computes and types nothing new.

## Part 1 — the schema

New `src/lib/aria/contract.ts`, one typed shape:

```ts
interface AriaIntelligenceContract {
  answer: string
  facts: ContractFigure[]          // grounding === 'verified'
  calculations: ContractFigure[]   // grounding === 'derived' | 'estimated'
  assumptions: string[]
  confidence: number               // 0-1
  uncertainties: string[]
  recommendedActions: RecommendedAction[]
  approvalRequired: boolean
  provenance: Provenance[]
}
```

Every field is assembled, never invented:

- **`facts`/`calculations`** are a straight split of caller-supplied `ContractFigure[]` — each one a
  direct reference to a real compute-engine result (`{ label, value, provenance }`) — by its own
  INTEL-TRUTH-1 grounding. `buildContract()` classifies; it never computes a figure itself.
- **`assumptions`** are read directly from estimated calculations' own `Provenance.rule` —
  `provenance.ts`'s own documented convention already names the assumption there when grounding is
  `'estimated'`; nothing new to invent.
- **`confidence`** is a deterministic weighted average over the grounding mix backing the answer
  (`verified=1.0, derived=0.8, estimated=0.5`), never an LLM self-report — ties confidence directly
  to truth-typing instead of letting the two drift independently. Zero backing figures → `0.3`,
  never silently high.
- **`uncertainties`** surface `ground-guard.ts`'s existing "ungrounded number" flags — numbers the
  answer states with no backing fact/calculation — rather than a parallel gap-detection mechanism.
- **`approvalRequired`** ties to the *existing* propose-approve gate (`AgentDecision.status` /
  `aria_action_log`), not a new concept: true whenever there are recommended actions and this
  response didn't already execute one autonomously (an `aria_action_log` row is that gate's own
  record of an already-approved-by-settings execution).

## Part 2 — enforced at the 5 canonical grounded.ts entry points

All 5 (`runGroundedAnalysis`, `runCustomerFacingCopy`, `runActionPlanner` — both branches,
`runBackgroundAgent`, `runVisionOrMedia`) now assemble and return a `contract:
AriaIntelligenceContract` alongside their existing response. `BaseParams` gained
`contractFigures?: ContractFigure[]` and `recommendedActions?: RecommendedAction[]` — caller-supplied,
since only the caller (who called the compute engine) knows what real figures back their prompt.
`auditUngroundedNumbers()` now returns the flagged values it used to discard, so a claim with no
backing fact/calculation is no longer silently lost — it becomes a named `uncertainties[]` entry.
`runActionPlanner` additionally passes `actionAlreadyExecuted` (true when `auditLog` was written and
the call succeeded) so `approvalRequired` correctly reflects the real propose-approve state rather
than defaulting to true unconditionally.

**Real wiring, not unused plumbing.** `daily-briefing/route.ts`'s existing `runGroundedAnalysis` call
now passes `contractFigures` built from `loss-detector.ts`'s real profit-leak/margin-leak/slow-period/
lapsing-customer findings (new exported `LOSS_SIGNAL_GROUNDING = 'estimated'` constant, matching the
`CLV_PREDICTION_GROUNDING` pattern from INTEL-TRUTH-1) and `recommendedActions` from each signal's
`act_label`/`payload`.

**Retained, not just computed and discarded.** "The contract is always retained internally even when
the UI renders only prose" only means something if it survives past the request that produced it —
`daily_briefings` gained an additive `contract` jsonb column (migration
`20260716000004_intel_contract_1_daily_briefings_contract.sql`, applied via Supabase MCP, verified
live via `information_schema`), persisted on both the fresh-generation and cache-hit response paths.

## Part 3 — owner-facing "how Aria knows this"

New `AriaWhyPanel` component (`src/components/dashboard/AriaWhyPanel.tsx`). Default view renders
**nothing but a collapsed toggle** — the existing clean-prose briefing is untouched; the full contract
is one tap away, not buried and not a data dump:

- A confidence bar, color-tiered to match the same palette the figures below carry.
- Facts/Calculations as individual rows, each with its own `TruthBadge` (reused from INTEL-TRUTH-1,
  not a parallel color system) — an owner sees at a glance which figures are settled facts vs
  projections, not just a bare "confidence: 65%" with no way to see why.
- Assumptions and "unverified in this answer" as plain-language lists, not raw `Provenance` objects
  (function/version/inputs/computed_at are never shown — only `label`, `value`, and the grounding
  badge — a curated read, not a JSON dump).

Follows the exact progressive-disclosure idiom already established in `AriaBriefingCard.tsx`
(`useState` boolean, rotating chevron, text-label swap, conditional JSX) rather than inventing a new
interaction pattern. Wired into `dashboard/daily-briefing/page.tsx`, rendered only for the live
briefing (gated on `!historyView`, since historical entries predate this sprint and carry no
`contract`).

## VERIFY — one real substantive answer, traced end to end

Traced `detectLapsingCustomers()` (one of `loss-detector.ts`'s 5 signal types) against real Sip Café
data — a genuine "profit-leak-adjacent finding," the sprint's own suggested example:

**Real query result** (Sip Café, `business_id ff5055a0-...`, replicating the detector's exact logic
live via SQL): 12 customers with `total_spent > 0` and `last_visit_at` more than 45 days ago. Total
spend across them: **$4,492.90**. Average: **$374.41**. `marketing_consent = false` for all 12, so
`targetCount = custs.length = 12`. `monthlyLoss = round(totalSpend / 3) = round(1497.63) = $1,498`.

**Traced through the contract construction** (`daily-briefing/route.ts`'s wiring → `buildContract()`):

| Field | Value | Why |
|---|---|---|
| `contractFigures[0].label` | `"12 regular customers lapsing"` | `sig.title` |
| `contractFigures[0].value` | `1498` | `sig.estimated_monthly_loss_aud` |
| `contractFigures[0].provenance.grounding` | `'estimated'` | `LOSS_SIGNAL_GROUNDING` — a projection extrapolated from real spend history, genuine uncertainty |
| `contract.facts` | `[]` | this figure's grounding isn't `'verified'` |
| `contract.calculations` | `[the figure above]` | grounding is `'estimated'`, correctly classified as a calculation not a fact |
| `contract.assumptions` | `["12 customers who spent with you previously haven't returned in 45+ days. Avg spend $374. Estimated $1498/month at risk."]` | read directly from the figure's own `Provenance.rule`, i.e. `sig.insight` |
| `contract.confidence` | `0.5` | one figure, weight for `'estimated'` = 0.5 |
| `contract.recommendedActions` | `[{ label: "Create winback campaign for 12 customers", action_type: 'lapsing_customers', ... }]` | `sig.act_label` was present |
| `contract.approvalRequired` | `true` | recommended actions exist and `actionAlreadyExecuted` is unset for `runGroundedAnalysis` (this path never auto-executes) |

**An estimate is never displayed as verified**: this contract's only figure carries `'estimated'`
grounding end to end — `facts` is correctly empty, `calculations` correctly holds it, and
`AriaWhyPanel` would render it with the amber `TruthBadge` + "ESTIMATE" label, never the silent green
dot reserved for `'verified'`.

**Honest limitation of this specific VERIFY**: `contractFigures` for this call is currently built
*only* from `loss-detector.ts`'s signals, which are categorically all `'estimated'` — so this
real-data trace produced zero `facts` (no `'verified'` figures), by construction of what's wired
today, not because the mechanism can't handle facts (Part 1's classification logic handles a mixed
`facts`+`calculations` array correctly; INTEL-TRUTH-1's own `getRevenueSnapshot()` output already
demonstrates a real `'verified'` figure). Filed below as a completeness gap, not a defect.

**Bonus finding, fixed**: tracing `detectMarginLeaks()` (the true "margin-leak" signal, closest to a
literal "profit leak") surfaced the same `neq('status','voided')` bug class fixed repeatedly across
INTEL-COMPUTE-2/3/4 — fixed to `status='completed'`. It currently returns `null` for Sip Café (no
`pos_sale_items.cost_price` populated for recent sales — a separate, more primitive cost field than
the canonical `resolveCost()` chain INTEL-TRUTH-1 typed), which is why `detectLapsingCustomers` was
used as this VERIFY's live example instead.

## Response paths that couldn't produce a complete contract (latent gaps, filed for follow-up)

- **`daily-briefing/route.ts`'s `contractFigures` carries no `'verified'` facts today** — only
  `loss-detector.ts`'s estimated signals. The route already computes several genuinely verified
  figures (`revToday`, `rev7`, etc., via `getBusinessSales()`) that could be added as `facts[]`
  alongside the calculations, but confirming `getBusinessSales()`'s own filter is the canonical
  `status='completed'` rule (needed before honestly tagging them `'verified'`) wasn't done this
  sprint, to avoid scope creep into auditing yet another shared data-access function under time
  pressure. Worth a small follow-up to make this specific contract's `facts[]` non-empty.
- **`detectMarginLeaks()` returns nothing for Sip Café** — not a contract defect, but means the
  single detector closest to "margin leak" (this sprint's and the CLAUDE.md prime directive's own
  named example) has never actually fired on the app's only real business, because
  `pos_sale_items.cost_price` isn't populated the way the canonical `resolveCostBatch()` chain is.
  Wiring this detector onto the canonical cost resolver (rather than the raw `cost_price` column) is
  a real, separate fix worth its own follow-up sprint — out of scope here since it's a compute-engine
  change, not a contract/typing one.
- **Only 2 files in the whole codebase call the 5 canonical `grounded.ts` entry points directly**
  (`daily-briefing/route.ts`, `loyalty/challenges.ts`, per INTEL-TRUTH-1's own audit) — every other
  substantive AI response (e.g. `clv-agent.ts`'s portfolio summary via `base-agent.ts`'s
  `claudeStructured()`, or `router.ts`/`agents.ts`'s `ariaInvoke()` path that the Profit Leaks page's
  `ops_narrative` call actually uses) bypasses `grounded.ts` entirely, so no contract is produced or
  retained for those responses yet. Part 2's mechanism can only protect what's already wired through
  the canonical wrapper — migrating the remaining call sites is a larger, separate effort (the same
  boundary INTEL-TRUTH-1's report named), not attempted here.
- **The Profit Leaks page/table itself** (`src/app/dashboard/profit-leaks/page.tsx`,
  `profit_leaks` table) has no code path in `src/` that inserts new rows — confirmed via project-wide
  search, only referenced in `supabase/schema.sql`'s `CREATE TABLE`. Whatever populates it lives
  outside this repo's `src/` tree (or is currently dead), so it couldn't be used for this sprint's
  VERIFY despite being the sprint's own named example; `loss-detector.ts`'s real, live-firing signals
  were used instead as the closest genuine equivalent.

## Outstanding — visual confirmation needed from the user

`tsc --noEmit` is 0 errors and `npm run build` is green (confirmed below). `AriaWhyPanel`'s render
logic was verified via a throwaway unauthenticated test route hit with `curl`: the collapsed toggle
renders with the correct label, a full realistic contract (including individual `grounding` tags)
serializes correctly through the page, and both a `null` and an all-empty contract correctly render
nothing rather than an empty shell — then the test route was deleted. **The click-to-expand
interaction itself, and the panel's appearance inside the real Daily Briefing page, could not be
visually confirmed in an actual browser** — no browser-automation tool is available in this
environment, and the page is a `'use client'` component behind Supabase auth. This reuses a UI
mechanism (`useState` + conditional render) already proven working elsewhere in this codebase
(`AriaBriefingCard.tsx`), so the risk is low, but please open the Daily Briefing page, click "How
Aria knows this" under the Executive Summary, and confirm it expands cleanly before considering
Part 3 fully done.
