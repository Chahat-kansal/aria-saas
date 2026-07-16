# INTEL-TRUTH-1 — Business Truth Typing

Extends GROUNDING-TEETH's existing no-invented-numbers rule into a real typed field: every figure
Aria states or displays carries an explicit provenance type — `verified` / `derived` / `estimated`.
This sprint surfaces and enforces the type; it does not compute anything new. It builds directly on
INTEL-COMPUTE-1's deterministic compute engine and its `Provenance`/`Grounding` substrate
(`src/lib/aria/compute/provenance.ts`), which already defined the 3-way type but was, before this
sprint, only actually consumed by one function (`getRevenueComparison`).

## Part 1 — schema/type: extend the compute engine's existing return shape

`src/lib/aria/compute/provenance.ts` already had `Grounding = 'verified' | 'derived' | 'estimated'`
and a `Provenance`/`ComputeResult<T>` shape — built in INTEL-COMPUTE-1 but adopted by almost nothing.
Extended (not replaced) onto every other canonical compute function:

- **`revenue-snapshot.ts`** — `getRevenueSnapshot()`/`getRevenueForRange()` are the two most-called
  functions in the whole compute engine (~20+ call sites across INTEL-COMPUTE-2/3/4) and had **no
  grounding tag at all**, despite being the clearest `verified` case in the codebase (a direct sum of
  real `completed`-status rows, no assumption). Added an additive `provenance: Provenance` field to
  both return shapes. Existing callers destructuring `.revenue`/`.transaction_count` etc. are
  unaffected — nothing had to change at any of those ~20+ sites.
- **`resolve-cost.ts`** — `ResolvedCost` gained a `grounding` field mapped from its existing
  `CostSource` tier:
  - `outlet` (today's real per-outlet cost) → **verified**
  - `last_delivery` / `purchase_order` (a real recorded price, but using it as "current cost" is one
    assumption removed) → **derived**
  - `catalogue` (`pos_products.cost_price` — a manually-maintained reference figure, not tied to any
    specific transaction) → **estimated**, matching `provenance.ts`'s own pre-existing documented
    example for this grounding ("a resolved cost falling back to an estimate")
  - `unknown` → `null` — no grounding at all, must be flagged, never defaulted to verified
- **`stock-value.ts`** — `computeStockValue()` propagates `cost_grounding` per product and
  `margin_grounding` (a computed ratio — always at least one step removed from its cost input). A new
  `worstGrounding()` fold computes the aggregate `at_cost_grounding` as the **worst** grounding across
  all costed products — a sum is only as trustworthy as its weakest input.
- **`clv-agent.ts`** — new exported `CLV_PREDICTION_GROUNDING = 'estimated'` constant. Every
  `predicted_*`/`p_alive`/`churn_probability` figure is a BG/NBD + Gamma-Gamma probabilistic forecast,
  categorically an estimate by construction — not something that varies per row, so a single named
  constant (not a DB column) is the correct, honest representation. Threaded through both CLV API
  routes (`agents/clv/customers/route.ts`, `agents/clv/route.ts`) as a top-level `figure_grounding`
  response field, so the frontend doesn't have to hardcode the type itself.

**Self-correction found during VERIFY** (see below): the first version of `margin_grounding` was
unconditionally `'derived'`, ignoring the underlying cost's own tier. Fixed to fold both together via
`worstGrounding([costGrounding, 'derived'])` — a margin computed over an `estimated` catalogue cost is
itself `estimated`, not falsely upgraded to `derived`.

## Part 2 — enforce at the 5 canonical grounded.ts entry points

An estimate stated as if verified is the exact conflation this whole thread exists to prevent — and
it's a **separate honesty axis** from ground-guard.ts's existing "is this number real at all" check.
A number can be a perfectly grounded, real allowed value and *still* misrepresent its own certainty if
it's an estimate presented with no hedge language.

- **`ground-guard.ts`** — new `checkEstimateHonesty(text, estimatedValues, opts)`. For each
  caller-marked estimated value that appears in the text, scans the ~45 characters immediately before
  it for hedge language (`estimated`, `projected`, `approximately`, `likely`, `forecast`, `could`,
  `may`, `might`, ...). No hedge nearby = violation. `mode: 'flag'` reports only (safe for JSON —
  never mutates, same reasoning as the existing ground-guard's JSON-safety split); `mode: 'redact'`
  strips the bare number (safe for prose). Never touches verified/derived values — stating a plain
  fact plainly is correct, not a violation.
- **`grounded.ts`** — `BaseParams` gained `estimatedValues?: number[]`. `withGrounding()` injects an
  explicit "ESTIMATE HONESTY" instruction block naming those values when present. All 5 canonical
  entry points (`runGroundedAnalysis`, `runCustomerFacingCopy`, `runActionPlanner` — both branches,
  `runBackgroundAgent`, `runVisionOrMedia`) now thread `estimatedValues` into both the prompt and a
  post-generation `checkEstimateHonesty` pass: flag-mode for the 4 JSON-returning entry points,
  redact-mode for `runCustomerFacingCopy` (prose is safe to actively strip, matching its existing
  ground-guard redact call).
- **Real wiring, not unused plumbing** — `daily-briefing/route.ts`'s existing `runGroundedAnalysis`
  call now passes `weather_forecast`'s real Open-Meteo `maxTemp` values as `estimatedValues` (a
  genuine external forecast — textbook `estimated`, real uncertainty, not a database fact). This is
  the one concrete, already-shipped call site touched; only 2 files in the whole codebase currently
  call the 5 canonical entry points directly (`daily-briefing/route.ts`, `loyalty/challenges.ts`) —
  broader adoption is a separate, future migration effort (AI-GROUNDING-1's original scope), not this
  sprint's.

## Part 3 — surface it, held to the standing quality bar

New `TruthBadge` component (`src/components/ui/index.tsx`), deliberately asymmetric:

- **verified / derived** render as a near-silent 6px dot (green / blue-grey) with a tooltip — a
  settled or calculated real fact doesn't need to shout about itself.
- **estimated** is the one that must never blend in: distinct amber color **plus** a short uppercase
  "estimate" text label — a forecast should always read honestly as a forecast, not differ by color
  alone (which a colorblind or inattentive reader could miss).

Inline-styled (not Tailwind classNames) so it renders identically regardless of whether the consuming
file uses Tailwind utility classes or raw style objects — this codebase mixes both across its
dashboard components.

Wired into the 3 owner-facing surfaces found via a targeted research pass, **one deliberate placement
per surface**, not a badge on every number:

| Surface | File | Figure | Badge |
|---|---|---|---|
| Revenue today / this week | `RetailDashboard.tsx` | KPI cards | `verified` |
| Inventory value (hero) | `InventoryValuePanel.tsx` | at-cost value + margin % chip | `at_cost_grounding` (dynamic) / `margin_grounding` (dynamic) |
| Customer Intelligence (CLV) | `dashboard/agents/page.tsx` | panel header | `estimated` (one badge, not repeated per-figure) |

Two explicit **non**-placements, both deliberate:
- `InventoryValuePanel.tsx`'s per-row margin was **not** badged — the existing per-row cost-source
  `Chip` already conveys finer-grained provenance there (outlet/last delivery/catalogue/unknown), and
  repeating an identical `derived`-or-`estimated` dot on every single row would be exactly the "wall
  of badges" the sprint explicitly warned against.
- The CLV panel gets **one** badge at the section header, not one per number — virtually every figure
  in that panel (`predicted_annual_revenue`, `avg_clv_*`, `at_risk_annual_revenue`,
  `if_rising_stars_add_1_visit`) is a forecast, so one honest label reads better than "estimate"
  repeated 8 times.

## VERIFY — one of each type, against real Sip Café data

**VERIFIED — revenue.** Sip Café's most recent trading day with real sales: **2026-07-14, $27.00
across 2 transactions** (`status='completed'`, direct sum — `getRevenueSnapshot()`'s exact rule).
`provenance.grounding` = `'verified'` by construction. This is the same canonical-rule figure
`RetailDashboard.tsx`'s "Revenue today"/"Revenue this week" cards display next to the new
`verified` badge.

**DERIVED — margin.** Real Sip Café product "Apple Juice": `item_cost = $2.50` (a real per-outlet
actual cost → `cost_source='outlet'` → `grounding='verified'`), `price = $6.00` →
`margin_pct = 58.3%`, `margin_grounding = worstGrounding(['verified','derived']) = 'derived'`
(one step removed from a verified cost, per the sprint's own worked example). Confirmed correctly
typed — and confirmed the **contrast case** on the same real data: "Big Breakfast"
(`cost_price = $9.60` catalogue-tier, no outlet/last-delivery cost recorded at all → `estimated`,
`margin_pct = 60%`) now correctly types its margin as `estimated`, not `derived` — this contrast is
exactly what caught the Part 1 bug described above (before the fix, both would have shown identically
as `derived`, silently overstating the Big Breakfast margin's real confidence level).

**ESTIMATED — CLV forecast.** `CLV_PREDICTION_GROUNDING = 'estimated'` is correct by construction for
every `predicted_*`/`p_alive` figure. Attempting to verify this against a *real* row surfaced a
genuine, unrelated production bug (documented in full below): `customer_clv_scores` had **zero rows**
for Sip Café — the only real business in this database — because the table was missing 3 columns
(`p_alive`, `expected_purchases_next_90d`, `expected_next_order_date`) that `clv-agent.ts`'s shipped
insert code has always written. Every CLV agent run has been silently failing its score write (the
Postgres error is caught into `AgentRunResult.errors`, non-fatal, so the run "succeeds" while writing
nothing). Fixed additively per RULE 10 (migration
`20260716000003_intel_truth_1_clv_scores_missing_columns.sql`, applied via Supabase MCP, verified
live via `information_schema` before/after, and confirmed a **real write succeeds** — not just that
the columns exist — by inserting a realistic row for a real Sip Café customer using `clv-agent.ts`'s
exact column list, confirming it landed with the right values, then deleting it with 0 residual rows
left behind). With the schema fixed, `figure_grounding: 'estimated'` on both CLV API routes is now a
genuinely reachable, correctly-typed end-to-end path from compute engine → API → owner-facing panel.

**An estimate is never displayed as verified**, confirmed three ways: (1) `TruthBadge`'s asymmetric
design makes `estimated` visually distinct by construction (color + text label, not color alone); (2)
`checkEstimateHonesty()` only ever fires against caller-marked estimated values, never touching
verified/derived numbers, so it can't misclassify a real fact as needing a hedge; (3) the CLV panel's
single `estimated` badge is attached at the exact source of every forecast figure in that surface,
not opt-in per number.

## Figures found that couldn't be cleanly typed (latent grounding gaps, filed for follow-up)

- **`daily-briefing/route.ts`'s `high_churn_count`** — a count of customers already classified
  `high`/`churned` via `pos_customers.churn_risk_score` (itself sourced from CLV's `estimated`
  churn probability). The count operation itself is deterministic once the labels exist, but the
  labels it counts are estimates — so is the resulting count `derived` (a deterministic tally) or
  `estimated` (inherits its inputs' uncertainty)? Not resolved this sprint; left untyped rather than
  guessed. Worth a follow-up once more of the AI-GROUNDING-1 call sites migrate onto the 5 canonical
  entry points, since the same ambiguity will recur for any count-of-a-classification figure.
- **Most AI call sites still bypass `grounded.ts` entirely.** Only 2 files in the whole codebase
  (`daily-briefing/route.ts`, `loyalty/challenges.ts`) call the 5 canonical entry points directly —
  e.g. `clv-agent.ts`'s own portfolio-summary AI call uses `base-agent.ts`'s `claudeStructured()`, a
  separate path that predates AI-GROUNDING-1 and doesn't go through `grounded.ts` at all. Part 2's
  estimate-honesty enforcement can only protect what's already wired through the canonical wrapper —
  migrating the remaining call sites is a larger, separate effort (AI-GROUNDING-1's original scope),
  not attempted here to avoid scope creep into a working agent's AI plumbing.
- **`InventoryValuePanel.tsx`'s per-row breakdown** — deliberately left unbadged (see Part 3 above),
  not because it can't be typed (every row's `cost_grounding`/`margin_grounding` is fully computed and
  available in the API response) but because the existing `Chip` already conveys equivalent
  information without adding a redundant, cluttering second badge per row.

## Bonus finding: CLV feature has never worked in production

Not part of the typing work itself, but surfaced directly by trying to VERIFY the `estimated` type
end-to-end: `customer_clv_scores` has been missing 3 columns since before this sprint, and no
migration for them ever existed in git (not "written but unapplied" — never written at all). Every
`CLVAgent.run()` since this code shipped has silently failed to write a single score row, for every
business, including Sip Café. Fixed this sprint (migration + live write verification, detailed in
VERIFY above) as a direct consequence of doing the VERIFY step honestly rather than assuming the
happy path.

## Outstanding — visual confirmation needed from the user

`tsc --noEmit` is 0 errors and `npm run build` is green throughout. The `TruthBadge` component itself
was verified rendering correctly in all 4 states (`verified`/`derived`/`estimated`/`null`) via a
throwaway unauthenticated test route hit with `curl` (confirmed the amber dot+label appears only for
`estimated`, and `null` renders nothing) — then deleted along with its stale `.next/types` artifact.
**The 3 real dashboard surfaces (RetailDashboard, InventoryValuePanel, the CLV panel) could not be
visually confirmed in an actual browser** — they're all `'use client'` components behind Supabase
auth, and no browser-automation tool is available in this environment. Please open each of the 3
pages and confirm the badge renders as intended (small dot next to "Revenue today"/"Revenue this
week"; a dot next to the inventory hero value and inside the margin % chip; the amber "ESTIMATE"
label next to the "💎 Customer Intelligence" heading) before considering Part 3 fully done.
