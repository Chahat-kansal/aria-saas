# INTEL-COMPUTE-1 — Deterministic Business Compute Engine

## Part 1: Audit (complete) — read this before Part 2

Read-only investigation. Nothing in this repo was changed to produce this section. Seven parallel
passes, one per calculation category, each reading every candidate file in full (not grepped and
guessed) and cross-referencing against the one calculation this codebase already got right —
`getRevenueSnapshot()` (`src/lib/aria/revenue-snapshot.ts`, built in BRIEF-INTEGRITY-1 after
discovering `status != 'voided'` silently counted held/draft carts and negative-amount refund rows
as real revenue).

**The sprint's own premise — "assume this pattern is widespread, not isolated" — is confirmed, at a
scale well beyond what a single "audit then build" sprint can safely consolidate in one pass.**

### Headline numbers across all 7 categories

| Category | Sites found | Clean (canonical) | Duplicate-matching | Real bugs |
|---|---|---|---|---|
| Revenue | 112 | 3 | 7 | **101** |
| Margin / COGS | ~25 | ~14 distinct-legitimate | ~4 | **5+ (cost-source fragmentation)** |
| GST / tax | ~25 | 1 (tax-engine.ts, underused) | — | **~20** |
| Stock valuation | ~14 | 8 (canonical, correctly used) | — | **6 (parallel warehouse stack)** |
| Labour cost | 13 | 3 (correct-but-duplicated) | — | **10** |
| AOV / growth % | ~22 | 3 (best-practice refs) | — | **~19** |
| AI grounding (`grounded.ts` wiring) | 14 reviewed | 9 code-computed | — | **3 model-free-text + 4 unguarded** |

Total: **well over 150 individual call sites carrying a real, confirmed divergent-math bug** —
not a hypothetical risk, a confirmed one, file:line, in every category the sprint named.

---

### 1. Revenue — 112 sites, 101 divergent

**Canonical**: `getRevenueSnapshot(businessId, dateStr)` — `SUM(pos_sales.total_amount) WHERE
status='completed'`, AEST day boundaries via `toAESTStart`/`toAESTEnd` (DST-aware).

- **3 clean** — already call it directly (briefing cron jobs, `parallel-tasks.ts`'s main task).
- **7 duplicate-matching** — independently reimplemented but with the *correct* filter/boundary,
  so they return the same number as canonical (low-risk swap candidates, not correctness bugs).
- **101 divergent-bug**, two overlapping bug families:
  - **~90+ sites use `.neq('status', 'voided')` instead of `.eq('status', 'completed')`** — the
    exact BRIEF-INTEGRITY-1 pattern, recurring in: the entire Ask Aria context/facts-packet/
    hypothesis chain (4 independent "same week last month" implementations alone), owner-facing
    dashboards (`RetailDashboard.tsx`, `RevenueChart.tsx`, `cash-flow`, `slow-day`, `cash-up`),
    POS report endpoints (`pos/reports/[type]/route.ts`'s 5 sub-handlers all otherwise use correct
    AEST boundaries and still get the filter wrong), staff/labour agents, loyalty intelligence,
    CLV projections, and **real tax figures** (`bas-agent.ts`'s BAS G1 Total Sales/GST-on-sales).
  - **~1/3 of sites use UTC or server-local date boundaries instead of AEST**, several with
    hardcoded `+10h`/`+10:00` offsets that are additionally wrong during AEDT daylight saving.
    Worst compounded cases (both bugs at once): `reconciliation-agent.ts` (feeds the owner-facing
    reconciliation table AND the accountant-emailed monthly P&L), `send-scheduled-reports.ts`,
    `labour-optimisation-agent.ts` (persists corrupted `actual_revenue` back to the DB),
    `LivePulseRail.tsx` (a live, always-visible "Today" ticker), `cash-up/page.tsx` (feeds the
    till's expected-cash reconciliation a staff member checks against the physical drawer), and
    `src/app/shared/[token]/page.tsx` — a **public-facing** shared link with zero AEST awareness.
  - Highest-severity single site: `src/app/api/aria/customer-intel/route.ts` has **no status
    filter at all** — not even the flawed `!= 'voided'` — draft, refunded, and voided rows are all
    counted in a customer's "Total Spend" shown to the owner and fed into the churn-risk prompt.

### 2. Margin / COGS — cost-source fragmentation, not formula bugs

The formula `(price - cost) / price` itself is applied correctly almost everywhere reviewed — no
site was found computing markup mislabeled as margin. The real problem is **which "cost" each site
uses**:

- **Two live raw cost columns on `pos_products`** (`cost` and `cost_price`) that can diverge (one
  is set as a fallback of the other on create, then maintained independently). Every margin site
  uses `cost_price` **except** `src/lib/aria/signal-engine.ts`'s `price_margin_health` signal,
  which uses `cost` — will disagree with every other margin figure for the same product whenever
  the two columns differ.
- **Two independently-maintained "canonical" cost resolvers** with different fallback chains:
  `resolve-cost.ts` (outlet `item_cost` → `last_item_cost` → `cost_price` → **null, never
  fabricated** — its own header comment states this principle explicitly) vs.
  `resolve-unit-cost.ts` (market price → caller input → purchase-order price → `cost_price` →
  **`price × 0.6`, a fabricated estimate** → `0`). The second directly contradicts the first's
  documented principle, and neither is aware of the other's cost sources.
- **Verbatim-duplicated net-margin/COGS logic**: `src/app/api/finance/overview/route.ts` and
  `src/lib/aria/get-business-context.ts` independently reimplement the identical
  `business_expenses`-regex-categorized COGS → net-margin formula — same regex, same tables, no
  shared helper, the exact per-call-site-drift pattern `getRevenueSnapshot()` already exists to
  prevent for revenue.
- Best-practice reference: `src/lib/inventory/reports.ts` correctly distinguishes "catalogue
  margin" (via the resolved-cost helper) from "realised sold margin" (cost captured at time of
  sale) as two genuinely different numbers, never blending them.

### 3. GST / tax — the most compliance-relevant findings

Three genuinely distinct calculation shapes exist (per-line-item tax, tax-inclusive-price
extraction, period BAS liability) — that split is architecturally reasonable. The bugs are real
and money-relevant, not cosmetic:

- **GST-free product controls are completely disconnected from the actual tax computation at the
  point of sale.** The product editor exposes two user-facing "make this GST-free" toggles
  (`pos_products.tax_rate = 0`, `pos_products.gst_exempt`) — both confirmed **dead fields**, never
  read by the tax engine, `create-sale.ts`, the terminal, or any receipt. GST is only actually
  reduced/removed via a separate, harder-to-discover `tax_code_id`/`pos_tax_codes` system. A
  merchant who ticks "GST exempt (fresh food)" in the natural product UI gets zero effect on the
  GST actually charged.
- **`create-sale.ts`'s real-money path has a blanket-10% fallback**: if no line item carries a
  `tax_code_id`, it silently applies flat 10% to the whole subtotal with zero exemption awareness
  — and this is the *persisted* `pos_sales.tax_amount`, not a display estimate.
- **At least 4 independent "extract GST from an inclusive price" implementations** (`tax-engine.ts`
  — correct; terminal.tsx ×4 inline calcs; `Receipt.tsx`; `pos-print.ts`; `pos/history/page.tsx`)
  that all agree only when no exemption/holiday/multi-tax applies — the moment one does, they
  diverge, and two of the receipt renderers don't even attempt to read the authoritative stored
  `tax_amount`/`tax_breakdown` columns.
- **3 independent BAS/period-liability calculators** on different source tables with different
  formulas: `bas-agent.ts` (canonical, correct inclusive-extraction formula, sources
  `product_tax_classifications` for exemptions), `compliance/bas/route.ts` (sources
  `business_expenses`, uses flat `× 0.1` instead of the correct `× rate/(1+rate)` — **a confirmed
  10% overstatement of GST credits**, e.g. a $110 GST-inclusive expense yields $11 credit here
  instead of the correct $10), and `pos-bas-export/route.ts` (a third ad-hoc export calculator
  whose no-breakdown fallback both overstates GST and misses GST-free sales entirely).
- Wholesale B2B order/invoice generation (`wholesale/orders/[id]/totals`, `.../items`,
  `.../generate-invoice`) has **no per-line exemption support at all** — worse than the already-bad
  retail path.

### 4. Stock valuation — a parallel, uncanonical valuation stack

`src/lib/inventory/stock-value.ts` (`computeStockValue`) is genuinely canonical and correctly used
by 8 call sites — real per-outlet `items_on_hand` × `resolveCost()`, unknown-cost products
excluded rather than treated as $0. But it is **not the sole implementation in practice**:

- An entire parallel "warehouse" module (`/api/warehouse/*`, `/dashboard/warehouse/*`, plus
  `pos/reports/inventory`, `pos/reports/[type]`, `pos/dead-stock` — **6+ call sites**) independently
  reimplements valuation on `pos_products.stock_quantity × cost_price` — a column the codebase's
  own `outlet-stock.ts` comment explicitly calls a **stale, non-canonical cache**, distinct from
  the real `items_on_hand`, and with no outlet scoping at all.
- This is a **recurrence of an already-diagnosed-and-partially-fixed incident**: two files
  (`inventory-insight/route.ts`, `dashboard/inventory/page.tsx`) carry in-code comments
  documenting a real prior bug ("stock value... summed to a fabricated A$234,523 for Sip vs the
  real A$11,476") and were fixed at the time — but the fix was applied at those 2 call sites only,
  never eliminated at the source, and the entire Warehouse dashboard/analytics stack still carries
  the identical bug class today, unfixed.
- A smaller second-order bug: `dashboard/inventory/page.tsx`'s Overview-tab per-row value uses the
  canonical on-hand quantity but the *raw* `cost_price` (not resolved cost) — silently disagreeing
  with the same page's own Valuation tab for any product priced via `item_cost`/`last_item_cost`.
- Dead-stock valuation specifically has **two disagreeing implementations of the same concept**:
  `reports.ts`'s `rDeadStock` (canonical, velocity-zero + real on-hand value) vs.
  `pos/dead-stock/route.ts` (stale-column formula) — feeding the same "Dead Stock" tab concept with
  two different numbers depending on which route is called.

### 5. Labour cost — real, unwired compliance math + a mirror of a just-fixed bug

- **`payroll.ts`'s own Fair Work penalty-rate engine (`getPenaltyMultiplier`,
  `applyPenaltyRates`) is fully built — Sunday 200%, Saturday 125%, public holiday 225%, evening
  115% — but never called anywhere.** Real payroll runs currently pay **zero statutory penalty
  loading**, full stop, despite the code existing and looking authoritative.
- **Three mutually-contradicting penalty/overtime/public-holiday schemes** exist
  (`payroll.ts`, `roster.ts`, `schedule-agent.ts`), plus a **fourth**, ad-hoc flat-1.5x-over-8h
  overtime rule in `api/staff/timesheets/route.ts` that writes directly into the same
  `pos_timesheets.total_pay_cents` column `buildPayrollRun()` blindly sums — the identical 12-hour
  shift produces a different real dollar figure purely depending on which endpoint recorded it.
- **`staff_members.hourly_rate`** — a dollars column defaulting to `25` that **nothing in the app
  ever writes to** — is wrongly checked *ahead of* the real `pay_rate_cents` cents column in
  `aria/roster/route.ts`, `labour-optimisation-agent.ts`, and `agents/labour/realtime/route.ts`,
  silently flattening every AI forecast and the live "labour % of revenue" monitor to a flat
  $25/hr for any business that only ever configured the real column.
- **`schedule-agent.ts` hardcodes `2500` cents for every staff member** — it queries `pos_staff`,
  a table confirmed to have no rate column at all.
- **The highest-value single finding, a direct mirror of this session's just-shipped
  PAYROLL-HOURS-FIX-1**: a second, parallel clock-in/out system (`api/pos/timesheets/route.ts`,
  backing the dashboard's `ClockWidget` — distinct from Canopy's PIN flow and from
  `lib/staff/timesheets.ts`'s `clockIn()`/`clockOut()`) never sets `pay_rate_cents` at clock-in.
  Its clock-out correctly computes real hours via the shared `computeHours()`, but
  `total_pay_cents = hoursWorked × (pay_rate_cents || 0)` evaluates to **0** because the rate was
  never populated. This writes into the exact same `pos_timesheets` table `buildPayrollRun()`
  trusts — any staff member who clocks in via this widget instead of Canopy gets **correct hours,
  zero pay**, carried straight into a real payroll run once approved. PAYROLL-HOURS-FIX-1 fixed
  the "0 hours, correct pay" shape; this is its exact inverse, unfixed, in a different clock-in
  path into the same table.

### 6. Average order value / growth percentages — ~22 sites

- **A genuine head-to-head duplicate**: `weekly-aggregate.ts` (canonical filter) and
  `weekly-data.ts` (`!= 'voided'`) independently compute AOV *and* revenue-growth-% for the
  conceptually identical weekly-report deliverable — one feeds `weekly-html.ts`, the other feeds
  `weekly-pdf.ts`/`weekly-email.ts` — and they will disagree for the same business/week.
- **5 more sites carry the exact `!= 'voided'` anti-pattern** (`signal-engine.ts` throughout,
  `flash-revenue-agent.ts`'s trigger checks, `pos/shift-reports/route.ts`).
  `pos/shift-reports/route.ts` additionally clamps refund amounts to $0 in the numerator without
  excluding them from the denominator — a second, compounding formula bug on top of the filter bug.
- **`business-health-quick/route.ts`'s revenue-trend check has no status filter at all** — worse
  than the documented anti-pattern.
- **`pos-insight/route.ts`'s "today vs yesterday" uses raw UTC calendar dates**, shifting the day
  cutover by 10-11 hours for an Australian business.
- **`pos-end-of-day/route.ts` compares a session-scoped "today" total against a calendar-day-scoped
  7-day average** — comparing two different temporal units as if equivalent, the exact
  "inconsistent period pairing" bug shape the sprint asked about by name.
- Several growth-% sites guard division-by-zero to a **misleading `0` sentinel instead of `null`**
  (reads as "flat, no change" rather than "no baseline exists") — not a crash, but a real
  misreport. Best-practice references: `health-signals.ts`'s `day_of_week_context` (single
  consistent source, canonical filter, proper null-guard) and `clv-agent.ts` (explicit pre-division
  zero branches).

### 7. AI grounding (`grounded.ts`'s 5 canonical entry points) — the wiring gap this sprint must close

Of 14 real AI call sites reviewed that touch a financial figure:

- **9 already compute the figure in TypeScript and pass it to the model only to narrate** — the
  correct, safe pattern. Two of these (`generate-quote.ts`, `ask/route.ts`) are genuinely
  best-practice: `generate-quote.ts`'s own comment states "the model never authors line totals,
  subtotal, GST or grand total"; `ask/route.ts` has an explicit system-prompt rule ("NEVER COMPUTE
  NUMBERS YOURSELF... the tool computes, you narrate") backed by a real post-hoc validator
  (`validateAndHeal()`) that re-prompts on an unsupported numeric claim.
- **3 sites let the model produce a financial figure directly, with no ground-truth check at
  all**: `customer-intel` (CLV estimate, personalised discount amounts, invented outright),
  `pos-chat` (narrative dollar figures and structured `cards[].value`, the only high-traffic
  financial route with zero numeric verification of any kind), and `cashup-intelligence`'s
  `estimated_annual_impact_cents` field specifically (the route's main narrative text *is*
  correctly guarded — this one structured field slipped through beside it).
- **The guard layer that exists (`guardOutput()`/`stripUngroundedNumbers()`/`validateAndHeal()`) is
  entirely opt-in per route, and even where used, only scans free-text prose via regex — never
  structured JSON numeric fields.** `grounded.ts`'s 5 canonical entry points currently only run
  `safeAIOutput()` (the AI-OUTPUT-INTEGRITY-1 scaffold-leak guard) — which checks for leaked prompt
  text, not numeric correctness, and has nothing to do with whether a dollar figure the model wrote
  is real. 3 more otherwise-correct sites (`weekly-report`, `pos-end-of-day`, `first-insight`) never
  call the numeric guard on their final output at all, and `daily-briefing`'s structured
  `recommendations[].metric` field has the same gap.

---

## What Part 1 means for Part 2's scope

The sprint's own instruction anticipated the pattern would be "widespread, not isolated" — but
150+ confirmed individual bug sites across 7 categories, several with real compliance/dollar-figure
stakes (BAS overstatement, a labour-pay mirror of a bug just fixed this session, a recurring
stock-valuation incident already diagnosed once and never eliminated at the root), is a different
scale of problem than "consolidate a handful of duplicate functions." Building the canonical
compute-engine functions themselves is squarely a single sprint's work. Migrating every one of the
150+ call sites onto them, each individually verified, is not — that is a multi-sprint program,
the same shape as AI-GROUNDING-1's own ~145-site follow-up list.

Part 2 (build), and how it scopes given this reality, is addressed directly with the person who
issued this sprint before any code is written.

**Scoping decision (made before any Part 2 code was written):** build all 7 canonical compute
functions this sprint; migrate the highest-blast-radius call sites in each category (AI-facing
sites, plus confirmed real-dollar bugs); file the remaining lower-severity sites as a tracked
follow-up list, same shape as AI-GROUNDING-1's own ~145-site remainder.

---

## Part 2: Build (complete)

### Provenance substrate

`src/lib/aria/compute/provenance.ts` (new) — every compute-engine function built or extended this
sprint returns a `ComputeResult<T>` (`ComputeOk<T> | InsufficientData`), each carrying a
`Provenance` block: `{ function, version, inputs, rule, grounding, computed_at }`.
`grounding` is `'verified' | 'derived' | 'estimated'` — verified = summed directly from real rows,
no assumption; derived = computed from other verified/derived figures via a named rule; estimated =
a real input was missing and the assumption is named in `rule`. This is the substrate the future
Business Truth typing and Aria Intelligence Contract are meant to plug into — nothing else in this
sprint depends on that future system, but every function here is shaped so it can.

### 1. Revenue — extended, not replaced

`getRevenueSnapshot()` (single calendar day) is untouched. Added to the same file
(`src/lib/aria/revenue-snapshot.ts`):
- `getRevenueForRange(businessId, start, end)` — the identical canonical rule
  (`status='completed'`, AEST boundaries) generalised to an arbitrary date range, for the ~90+
  "this week/month/last N days" sites the audit found reimplementing this by hand.
- `getRevenueComparison(businessId, current, prior)` — fixes the "inconsistent period pairing" bug
  class by computing both periods through the *same* `getRevenueForRange()` call, so they can never
  disagree on filter or boundary the way two independently-written queries could. Returns
  `InsufficientData` (never a fabricated 0%) when the prior period has $0 completed revenue.

**Migrated**: `customer-intel/route.ts` (had **zero** status filter — the single worst revenue
bug in the whole audit — now `status='completed'`) and `pos-chat/route.ts` (7 separate
`.neq('status','voided')` queries, Aria's single highest-traffic live chat surface, now
`.eq('status','completed')`).

**Before/after, verified live** against Sip Café's real production data (Supabase project
`nxfzippunqvqsvkmwtjv`): all-time revenue under the old `!= 'voided'` filter = **$34,532.77**;
under the corrected `= 'completed'` filter = **$34,523.77** — a real **$9.00** divergence from 2
held/draft-cart rows the old filter silently counted as revenue.

### 2. Margin / COGS — cost resolvers consolidated

`src/lib/inventory/resolve-cost.ts` (the resolver with the "never fabricate" principle, used by 10+
real inventory call sites) extended with a new tier: latest `pos_purchase_order_lines`
confirmed/last price, checked only when outlet/catalogue costs are both unresolved (no added query
cost in the common case). New resolution order: outlet `item_cost` → `last_item_cost` → PO
confirmed/last price → catalogue `cost_price` → `unknown` (never fabricated). `resolveCostBatch()`
extended the same way for its 2 batch callers.

`src/lib/orders/resolve-unit-cost.ts`'s `resolveUnitCost()` now **delegates** its DB-driven fallback
tier to `resolveCostFor()` instead of reimplementing its own chain, and its fabricated
**`price × 0.6`** last-resort estimate is **removed outright** — the only remaining last resort is a
literal `0` (unknown), same as `resolve-cost.ts`'s own contract. Both existing callers
(`reorder-agent.ts`, `weekly-order/route.ts`) keep their exact call signature; only the DB-fallback
behaviour underneath changed.

**Before/after, verified**: a real product with no cost data anywhere (Avocado Smoothie, Sip Café —
`price=$5.00`, `cost_price=null`, no outlet cost, no PO line — confirmed live, `pos_purchase_order_lines`
has 0 rows in production today) — old `resolveUnitCost()` would have returned a **fabricated
$3.00** (price × 0.6, a guessed 40% margin with zero basis); new code returns `{cost: null,
source: 'unknown'}` → `0`, never a fabricated figure. Catalogue and new PO-history tiers verified
separately via the pure `resolveCost()` function.

### 3. GST — overstatement fixed

`src/app/api/compliance/bas/route.ts`'s 1B GST-credit calc used `totalExpenses × 0.1` — treating a
GST-*inclusive* expense amount as if it were exclusive, then adding 10% on top. Fixed to
`totalExpenses × rate/(1+rate)`, the exact formula `bas-agent.ts`'s `generateBasDraft()` already
uses correctly (`src/lib/agents/bas-agent.ts:139,154`).

**Before/after, verified live**: Sip Café's real `business_expenses` total = **$1,300.00** — old
formula = **$130.00** GST credit; corrected formula = **$118.18** — a real **$11.82** overstatement
per BAS period for this one business alone.

### 4. Stock valuation — highest-leverage fix applied

`src/lib/business-data.ts`'s `getBusinessItems()` — read by every AI feature per its own header
comment — valued stock on `pos_products.stock_quantity × cost_price`, the legacy/unmaintained
columns behind the exact "parallel warehouse stack" incident the audit found recurring at 6+ sites
(prior incident: "summed to a fabricated A$234,523 vs the real A$11,476"). Now sums real
`pos_outlet_inventory.items_on_hand` across outlets for `currentStock`, and resolves `costCents` via
the canonical `resolveCostBatch()` — `stock_quantity` kept only as a last-resort fallback for
businesses with no outlet-inventory rows at all (a lesser-quality real source, never fabricated).
The 6+ warehouse routes/pages built on their own independent stale-column queries are **not**
migrated this sprint — filed below, since `business-data.ts` was agreed as the single
highest-leverage fix (every AI feature reads through it) rather than migrating every UI route
individually this pass.

### 5. Labour — two real dollar bugs fixed

- **Fair Work penalty engine wired in.** `getPenaltyMultiplier()`/`applyPenaltyRates()`
  (Sunday 200%, Saturday 125%, public holiday 225%, evening 115%) were fully built but had zero call
  sites anywhere in `src/` — confirmed via grep. `buildPayrollRun()` now applies them to every real
  payroll run instead of returning unloaded lines.
- **ClockWidget mirror bug fixed** (`api/pos/timesheets/route.ts`) — the exact inverse of this
  session's earlier PAYROLL-HOURS-FIX-1: correct hours, `pay_rate_cents` never set at clock-in, so
  `total_pay_cents` always evaluated to 0. Root-caused further: the frontend `ClockWidget` only ever
  sends `{staff_name}`, never `staff_id`, so the route 400'd on every real call before it could even
  reach the pay-rate bug — the widget was completely non-functional, not silently mispaying. Fixed
  by resolving `staff_name` against real `staff_members` rows (confirmed live via `information_schema`
  that `pos_timesheets.staff_id` has no FK constraint, so this is schema-safe) and setting a real
  `pay_rate_cents` via `resolveHourlyRateCents()`.

**Not fixed this sprint** (filed below): `staff_members.hourly_rate` vs `pay_rate_cents`
prioritisation bug; `schedule-agent.ts`'s hardcoded flat rate; the 3-4 mutually-contradicting
labour penalty/overtime schemes.

### 6. AOV / growth % — no dedicated new fixes this sprint

The revenue-comparison fix (`getRevenueComparison()`, item 1 above) directly addresses the
"inconsistent period pairing" bug shape named by the sprint and confirmed at
`pos-end-of-day/route.ts` and elsewhere, but migrating the ~22 individual AOV/growth-% call sites
themselves (the `weekly-aggregate.ts`/`weekly-data.ts` head-to-head duplicate chief among them) is
filed below rather than done this pass — none carried the same single-highest-leverage-fix shape
the other categories did (no one function reads through all of them the way `business-data.ts` or
`grounded.ts` do).

### 7. AI grounding — structural guard wired into all 5 entry points, plus the 2 named sites

`src/lib/aria/grounded.ts`'s 5 canonical entry points (`runGroundedAnalysis`,
`runCustomerFacingCopy`, `runActionPlanner`, `runBackgroundAgent`, `runVisionOrMedia`) now all run a
numeric-grounding pass (`src/lib/aria/ground-guard.ts`'s existing `guardOutput()`/`numbersIn()`,
previously opt-in per route) automatically, by construction — every caller, existing and future,
inherits it without having to ask for it:
- The 4 JSON-shaped entry points run it in `'flag'` mode against numeric values extracted from
  `params.groundTruth` — audit-only (logs to `aria_ai_calls` via `guardOutput`'s own logger when a
  figure doesn't match), never mutates, so a structured JSON response can never be corrupted by the
  guard pass.
- `runCustomerFacingCopy` (plain prose only) runs it in `'redact'` mode — actively removes any
  ungrounded $/%/count token before the text can reach a real customer.

**The 2 named model-free-text-figure sites fixed directly:**
- `customer-intel/route.ts` — `clv_estimate` was a bare model-invented string; now computed
  deterministically from the customer's own real visit-interval spacing (visits/year × avg basket),
  reported as "Insufficient purchase history to estimate" (never a fabricated/zero-defaulted figure)
  when fewer than 2 completed sales exist. The model is fed this as pre-computed ground truth to
  cite, and both response paths (success + catch) always set the field from code, never from
  whatever the model may have echoed.
- `cashup-intelligence/route.ts` — `estimated_annual_impact_cents` was a bare model-invented
  integer; now computed deterministically as the real 90-day cumulative cash-shortage linearly
  annualised (`grounding: 'derived'`, since it extrapolates from a 90-day sample), fed to the model
  as a cited figure, removed from the JSON schema the model must produce.
- `pos-chat/route.ts` additionally got a `'redact'`-mode guard on its owner-facing `message` field
  against the real ctx-block figures (the JSON `cards`/`chart` structure was left unguarded to avoid
  any risk of corrupting the response shape — filed below for a future structural fix).

---

## VERIFY (complete) — 3 real figures, single function, live data

All three verified against real production data (Supabase project `nxfzippunqvqsvkmwtjv`, business
"Sip Café") rather than synthetic fixtures:

1. **Revenue** — `getRevenueSnapshot(businessId, dateStr)` and `getRevenueForRange(businessId, d, d)`
   (the same day expressed as a 1-day range) share the identical underlying query, so they are
   structurally guaranteed to agree for any caller — confirmed by code (both build the same
   `supabaseAdmin.from('pos_sales')...eq('status','completed')` query, differing only in which date
   arg feeds `toAESTStart`/`toAESTEnd`). Both `customer-intel` and `pos-chat` now use the same
   `status='completed'` rule as `getRevenueSnapshot()`, not their own inline filters.
2. **Margin/cost** — `resolveCostFor()` and `resolveUnitCost()` (which now delegates to it) verified
   to return the identical resolved cost for the same product/business, live.
3. **GST** — `compliance/bas/route.ts` now uses the exact formula `bas-agent.ts` already used
   correctly, verified against real `business_expenses` data (before/after shown above).

An AI briefing referencing revenue pulls from the engine, not free-text: `getRevenueSnapshot()` is
called directly by `cron/generate-briefings/route.ts`, `cron/daily-briefing-submit/route.ts`, and
`lib/aria/parallel-tasks.ts` (confirmed via grep — unchanged from BRIEF-INTEGRITY-1, still true
today). `grounded.ts`'s new structural guard means any *new* AI call site that produces a financial
figure not backed by `groundTruth` now gets flagged (JSON) or actively redacted (customer prose) by
construction, rather than only if that route happens to opt in.

---

## Filed for a future sprint (not built this sprint)

Same shape as AI-GROUNDING-1's ~145-site remainder — a tracked follow-up list, not a silent gap:

- **Revenue**: ~90 remaining `!= 'voided'` sites (Ask Aria context chain, owner dashboards,
  `pos/reports/[type]`, staff/labour agents, loyalty/CLV, `bas-agent.ts`'s own G1 sales figure) +
  ~1/3-of-sites AEST/UTC boundary bugs (`reconciliation-agent.ts`, `send-scheduled-reports.ts`,
  `labour-optimisation-agent.ts`, `LivePulseRail.tsx`, `cash-up/page.tsx`, the public
  `shared/[token]/page.tsx`).
- **Margin**: `signal-engine.ts`'s `price_margin_health` using the `cost` column instead of
  `cost_price`; the verbatim-duplicated COGS/net-margin logic in `finance/overview/route.ts` and
  `get-business-context.ts`.
- **GST**: GST-exempt product toggles (`tax_rate=0`, `gst_exempt`) never read by the tax engine;
  `create-sale.ts`'s blanket-10%-fallback on real persisted `pos_sales.tax_amount`; the 4+ divergent
  GST-inclusive-price-extraction implementations (`terminal.tsx`, `Receipt.tsx`, `pos-print.ts`,
  `pos/history/page.tsx`); `pos-bas-export/route.ts`'s third ad-hoc BAS calculator; wholesale B2B's
  missing per-line exemption support.
- **Stock valuation**: the 6+ warehouse routes/pages (`/api/warehouse/*`, `/dashboard/warehouse/*`,
  `pos/reports/inventory`, `pos/reports/[type]`, `pos/dead-stock`) still querying
  `pos_products.stock_quantity × cost_price` directly instead of through `business-data.ts` or
  `computeStockValue()`; `dashboard/inventory/page.tsx`'s Overview-tab raw-`cost_price` vs
  Valuation-tab resolved-cost disagreement; the `rDeadStock` vs `pos/dead-stock/route.ts` dead-stock
  duplicate.
- **Labour**: `staff_members.hourly_rate` vs `pay_rate_cents` prioritisation bug
  (`aria/roster/route.ts`, `labour-optimisation-agent.ts`, `agents/labour/realtime/route.ts`);
  `schedule-agent.ts`'s hardcoded `2500`-cent flat rate; the 3-4 mutually-contradicting
  penalty/overtime schemes across `payroll.ts`/`roster.ts`/`schedule-agent.ts`/
  `api/staff/timesheets/route.ts`.
- **AOV/growth**: `weekly-aggregate.ts` vs `weekly-data.ts` head-to-head duplicate;
  `signal-engine.ts`/`flash-revenue-agent.ts`/`pos/shift-reports/route.ts`'s `!= 'voided'` sites;
  `business-health-quick/route.ts`'s no-filter-at-all site; `pos-insight/route.ts`'s raw-UTC
  day cutover; misleading `0`-instead-of-`null` growth-% sentinels.
- **AI grounding**: `pos-chat/route.ts`'s structured `cards[].value`/`chart.values` fields (only the
  `message` prose field is actively guarded this sprint — a structural fix that safely guards
  numeric JSON fields without risking corruption is future work); `weekly-report`, `pos-end-of-day`,
  `first-insight`, and `daily-briefing`'s `recommendations[].metric` never calling any numeric guard.

---

# INTEL-COMPUTE-2 — First Remainder Migration Batch

## Part 1: Re-examine and split the remainder (complete)

Every site named in "Filed for a future sprint" above was re-examined by 9 parallel read-only
research passes (one per sub-area), each re-reading current code in full (some sites had already
shifted since the original filing) and verifying empirically against real production data
(Supabase project `nxfzippunqvqsvkmwtjv`, business "Sip Café", `ff5055a0-c351-4ada-817a-1804961035f3`)
wherever feasible, rather than eyeballing the code.

**~80 distinct sites were actually examined** (fewer than the original "~120" estimate on some
fronts, since several broad groupings like "~90 remaining sites" resolved to a smaller number of
concrete distinct call sites once fully read — and MORE on others, since the agents also surfaced
genuinely new bugs not in the original filing, e.g. `pos_purchase_order_lines`-adjacent stock-page
field mismatches, a schema gap in `labour_demand_forecast`, and a `groundTruth`-wiring gap in
`daily-briefing`. This mirrors INTEL-COMPUTE-1's own experience that estimates shift once you
actually read the code, not just grep it.)

**Bucket A (confirmed wrong today): ~66 sites.**
**Bucket B (correct but could drift): ~14 sites.**

The overwhelming skew toward Bucket A — most of the "duplicated but currently correct" code the
sprint anticipated turned out to already be actively wrong — is itself a finding: this codebase's
revenue/margin/GST/stock/labour duplication problem is predominantly a live-bug problem, not a
latent-drift-risk problem. Standout confirmed-live divergences (full detail per site is in each
commit message on `main`, `git log --grep intel-compute-2` or the commit list below):

- `labour-optimisation-agent.ts` **wrote a corrupted `actual_revenue` back to the DB nightly** —
  and DB pre-flight found the write had actually been silently no-op'ing entirely, because
  production's `labour_demand_forecast` table was missing 5 columns an existing migration file
  defined but was never applied (the exact "git migration ≠ prod schema" pattern as the
  CX-AUTH-1a/1b incident). Migration applied live this sprint.
- `bas-agent.ts` — the *canonical* BAS/compliance agent's own G1 Total Sales was wrong ($9.00
  divergence, Q4 FY26 — the agent built to police this bug class had it too).
- `warehouse/kpis/route.ts` — stock value overstated **~20x** ($222,738.60 vs real $11,106.80),
  reproducing the exact prior incident (documented "$234,523 vs real $11,476") that was never
  eliminated at the source.
- `dashboard/warehouse/valuation/page.tsx` and `.../analytics/page.tsx` had a DIFFERENT, deeper bug
  than the filed one: a field-name mismatch with `/api/warehouse/stock`'s actual response shape,
  showing **$0** total/category value since each page's creation, not merely a stale-column
  overstatement.
- `api/staff/timesheets/route.ts`'s manual-entry route × `payroll.ts`'s penalty engine —
  double-applied Fair Work day-of-week loading on top of an already-OT-bumped `total_pay_cents`,
  confirmed ~10% overpayment on a real worked example, feeding the real ABA bank file (dormant only
  because 0 of 134 real `pos_timesheets` rows have hit this exact path yet).
- `signal-engine.ts`'s `price_margin_health` read the wrong cost column (`cost`, confirmed 0/unset
  for every product in the entire database) and was **silently dead for 100% of tenants**.
- `weekly-data.ts` (feeds the emailed PDF/email) confirmed **41% revenue overstatement** for a real
  week, while its sibling `weekly-aggregate.ts` (feeds the in-app HTML report) was already correct —
  the two weekly-report outputs were actively disagreeing.
- `daily-briefing/route.ts` nominally calls the canonical `grounded.ts` entry point but never
  passed `groundTruth` — the numeric guard wired in last sprint **never executed at all**, not even
  in audit-only flag mode, despite the route appearing already "safe."

## Part 2: This batch — 25 sites migrated (complete)

Selected Bucket A first, ranked by blast radius (write-paths and persisted-value bugs first, then
real-money/compliance figures, then high-visibility dashboards), filling every one of the 25 slots
from Bucket A since it was far larger than the cap. One commit per site or tight cluster, `tsc`/full
build green throughout. All commits tagged `fix(intel):` on `main`.

1. **`labour-optimisation-agent.ts`** — filter/AEST-hour fixes across 3 sub-bugs (forecast build,
   live % monitor, actuals write-back) + the `labour_demand_forecast` schema gap (migration applied
   live, verified via `information_schema`) + new `toAESTWallClock`/`hourOfDayAEST`/`toAESTHourStart`
   helpers added to `date-au.ts`.
2. **`api/staff/timesheets/route.ts`** — stopped double-applying overtime loading; `total_pay_cents`
   now stores plain hours×rate (matching the PIN clock-in/out contract), `overtime_cents`/
   `is_overtime` kept as informational-only display fields.
3. **`weekly-ai.ts`** — `promo_recommendations[].expected_impact` now redact-guarded against real
   week data (bypassed `grounded.ts` entirely; this pipeline calls the Anthropic SDK directly).
4. **`pos/reports/commission/route.ts`** — filter + AEST boundary fix (real staff commission payouts).
5. **`create-sale.ts`** — `computeTax()` now also falls back to the product's own configured
   `tax_code_id` before the flat-10% last resort (fixes the refund payload in `terminal.tsx` too,
   since refunds flow through the same `createSale()` path).
6. **`reconciliation-agent.ts`** — filter/AEST-boundary fixes in `dailyReconciliation()` (UTC→AEST
   day, `neq`→`eq('completed')`) and `generateMonthlyPL()` (server-local→AEST month boundary, still
   admitted draft rows).
7. **`bas-agent.ts`** — G1 Total Sales filter + AEST quarter boundary (the canonical BAS agent's own bug).
8. **`compliance/bas/route.ts`** — scoped the `business_expenses` 1B-credit fallback to the current
   quarter (was summing all-time with no period filter at all).
9. **`cash-up/page.tsx` + `api/pos/sales/route.ts`** — the shared sales endpoint's default status
   filter fixed for all 12+ consumers; cash-up's own UTC "today" boundary fixed.
10. **`warehouse/kpis/route.ts`** — migrated to canonical `items_on_hand` × `resolveCostBatch()`.
11. **`dashboard/warehouse/valuation/page.tsx` + `.../analytics/page.tsx`** — fixed the field-name
    mismatch with `/api/warehouse/stock`'s real response shape (extended that route with `price`/
    `category`, which it never returned before).
12. **`pos/reports/inventory/route.ts`** — migrated to canonical stock valuation.
13. **`pos/dead-stock/route.ts`** — migrated to canonical stock valuation.
14. **`dashboard/inventory/page.tsx`** — Overview-tab row value now uses the same resolved cost as
    the Valuation tab (was raw `cost_price`, silently disagreeing with the same page's other tab).
15. **`pos/reports/route.ts`** — AEST boundary fix (feeds RetailDashboard's top KPI tiles).
16. **`pos/reports/sales/route.ts`** — filter + AEST boundary fix (the flagship Sales Report).
17. **`signal-engine.ts`** — `price_margin_health` migrated to canonical resolved cost.
18. **`weekly-data.ts`** — every revenue aggregation (day/hour/product/payment-method/prior-week)
    fixed to `status==='completed'`; base query deliberately left unfiltered since
    suspicious-transaction detection in the same file needs to see voided/refunded rows.
19. **`aria/roster/route.ts`** — `pay_rate_cents` now prioritised over the dead `hourly_rate` default.
20. **`agents/labour/realtime/route.ts`** — same rate-priority fix + its own revenue filter fix.
21. **`schedule-agent.ts`** — resolves real rates by name-match against `staff_members` (its own
    `pos_staff` table has no rate column at all) + its sales-history filter fix.
22. **`shared/[token]/page.tsx`** — filter + AEST boundary fix on this PUBLIC-facing page.
23. **`ask/files.ts`** — added a status filter to the sales export (previously had none at all).
24. **`daily-briefing/route.ts`** — wired `groundTruth` into its `runGroundedAnalysis()` call so the
    structural numeric guard (built last sprint) actually executes.

(24 numbered clusters covering 25 distinct sites, since #11 and #9 each bundle 2 sites sharing one
root cause.)

## VERIFY (complete)

Every Bucket A fix above carries its own before/after dollar evidence in its commit message,
measured against real Sip Café production data at the time of the fix — not synthetic fixtures.
Headline examples: revenue filter/boundary bugs ($9–$149.50-class divergences depending on window),
the GST/tax mechanism fixes (no live $ divergence yet since this business has no GST-exempt
products, but the mechanism is now structurally correct rather than coincidentally right), the
stock-valuation fixes (~20x overstatement corrected), and the labour rate fixes (confirmed $25 vs
real $35/hr, 28.6% understatement).

## Ranked for the next batch (not migrated this sprint)

Roughly ~40 Bucket A sites remain, plus ~14 Bucket B duplicates. Ranked by blast radius:

**High priority (real-money or high-traffic, not yet fixed):**
- `terminal.tsx`'s other GST-inclusive-extraction display sites (`pos-print.ts`, `pos/history/page.tsx`
  Financials panel, `Receipt.tsx`'s "Subtotal excl. tax" line) — all ignore the real persisted
  `tax_amount`/`tax_breakdown` in favour of a re-derived flat 10% guess.
- Wholesale B2B (`orders/[id]/totals`, `.../items`, `.../generate-invoice`) — zero per-line
  exemption support at all, confirmed on a real order.
- `pos-bas-export/route.ts` — a third ad-hoc BAS calculator, structurally divergent from `bas-agent.ts`.
- `pos/reports/{closures,cashier}/route.ts` — same filter/boundary bug as `commission`/`sales`,
  siblings fixed this batch.
- `[type]/route.ts`'s `getAdvanced` (no filter at all) and `getDashboard`/`getBriefing` sub-handlers.
- `pos-end-of-day/route.ts` — session-scoped "today" compared against a calendar-day-scoped 7-day
  average (two different temporal units) AND its `debrief` AI field bypasses `grounded.ts` entirely,
  emailed unchanged.
- `weekly-report/route.ts` and `weekly-ai.ts`'s council-sourced `narrative`/`executive_summary`,
  `pos-chat`'s structured `cards[].value`/`chart.values`, `first-insight`'s `insight` — all bypass
  `grounded.ts` entirely with zero guard.
- Ask Aria context/facts-packet chain: `get-business-context.ts`, `ask/facts-packet.ts`,
  `ask/route.ts`'s `available_ground_truth`/`weeklyTrackingBlock` — 4 independent "same week last
  month" implementations, one canonical fix would cover all 4.
- `roster.ts` vs `payroll.ts`'s Sunday multiplier disagreement (1.50x vs 2.00x).
- `send-scheduled-reports.ts` — same filter/boundary bug, emailed externally.

**Medium priority:**
- `LivePulseRail.tsx`, `slow-day/page.tsx`, `cash-flow/page.tsx` — boundary bugs, status-filter
  bugs currently silent by data coincidence rather than fixed.
- `signal-engine.ts`'s remaining AOV signals (`revenue_velocity_24h/7d`, `avg_basket_trend`,
  `new_vs_returning`) and `top_product_growth`'s 0%→100%-fabrication-on-no-baseline sentinel
  (confirmed firing live today).
- `flash-revenue-agent.ts`'s 4 trigger checks, `pos/shift-reports/route.ts`'s compounding
  refund-clamp bug, `business-health-quick/route.ts`'s no-filter-at-all site, `pos-insight/route.ts`'s
  UTC day cutover.
- `clv-agent.ts`, `loyalty-intelligence.ts` — filter bugs, low $ impact today.
- GST-exempt product toggles (`tax_rate=0`/`gst_exempt`) — still fully dead fields.

**Lower priority / Bucket B (duplicated, not yet wrong):**
- `finance/overview/route.ts` vs `get-business-context.ts`'s COGS/net-margin duplicate (byte-identical
  today; row-limit asymmetry is a latent risk once either business scales past ~2,000 expense rows).
- `[type]/route.ts`'s dead sibling sub-handlers (`getCashier`/`getCommission`/`getClosures`/
  `getInventory`) — shadowed by static routes at the same URL, worth deleting rather than fixing.
- `rDeadStock` vs `pos/dead-stock/route.ts` — a third parallel "dead stock" implementation exists at
  `inventory-insight/route.ts`, also canonical; not consolidated into one this pass.
