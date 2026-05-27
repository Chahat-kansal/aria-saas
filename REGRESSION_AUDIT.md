# Aria OS — Feature Regression Audit
Generated: 2026-05-27

Method: for each upgraded page, `git log` found the pro-upgrade commit, `git show <parent>:<path>` extracted the pre-upgrade version, and `comm -23` listed identifiers (functions, fetch URLs) that exist in OLD but not in CURRENT. Each candidate was then *verified manually* against the current page to filter out renames, inlinings, and intentional replacements. Only genuinely lost capabilities are listed under "Pages with regressions".

## Pages with regressions (features removed)

### src/app/dashboard/staff/page.tsx (prompt 43)
upgrade commit `70a89bc`, pre-upgrade `36b77ae`
- **REMOVED: ClockWidget** — old page had an in-dashboard clock-in / clock-out widget (`clockIn()` POST `/api/pos/timesheets/clock`, `clockOut(sessionId)`). Owners could log shifts straight from the dashboard. Current dashboard surfaces an *On-shift* live readout only — no way to clock in/out from this page; that's now POS-terminal-only.
- **(Already restored 2026-05-27 in commit `c931a24`)**: auto-roster generation + Publish + Notify Staff. That regression was the original trigger for this audit and is fixed; ClockWidget is the remaining loss.

### src/app/dashboard/customers/page.tsx (prompt 34)
upgrade commit `ab9c172`, pre-upgrade `9c50ceb`
- **REMOVED: RFM column + `RfmBadge`** — old customers table had an "RFM" column rendering a tier badge calculated from `calcRFM(spend, visits, lastV)` via `@/lib/rfm`. Current table has Phone, Last visit, Lifetime spend, Visits, Loyalty — no RFM segmentation column. The `@/lib/rfm` module still exists and is used elsewhere (e.g. churn page interface), so this is purely a UI surface loss.

### src/app/dashboard/intelligence/page.tsx (prompt 54)
upgrade commit `94ea78f`, pre-upgrade `d87f736`
- **REMOVED: `acknowledgeAll` / "Clear all" bulk dismiss** — old page had a one-click button to mark every unread intelligence signal as acknowledged in a single action. Current nerve-centre redesign only exposes per-signal Mark resolved / Dismiss in the right detail panel — there is no bulk-acknowledge button. With high signal volume this means many individual clicks where one click used to suffice.

## Pages clean (no genuine features lost)

The following pages flagged candidate identifiers in the script output, but verification showed each was a rename, inlining, or intentional replacement — capability preserved:

- **src/app/dashboard/daily-briefing/page.tsx** (prompt 32) — no removals.
- **src/app/dashboard/page.tsx** (prompt 33, 44) — `ActivityDot`, `ChurnBadge`, `SeverityBadge` sub-components inlined as direct className-based pill spans (`map[c.churn_risk]`, `sev[alert.severity]`); same visual + same data sources. No regression.
- **src/app/dashboard/invoices/page.tsx** (prompt 35) — no removals.
- **src/app/dashboard/compliance/page.tsx** (prompt 38) — `saveNote()` collapsed into the generic `patch()` helper that writes `evidence_note` and `evidence_url`; the "Add evidence notes" textarea + persistence is still wired. Behaviour preserved.
- **src/app/dashboard/profit-leaks/page.tsx** (prompt 39) — no removals.
- **src/app/dashboard/churn/page.tsx** (prompt 40) — `riskBadge()` helper inlined; the `churn_risk` field is still present on the `ChurnCustomer` interface and rendered as a pill. Behaviour preserved.
- **src/app/dashboard/winback/page.tsx** (prompt 41) — `generateMessage()` + `sendCampaign()` replaced by `winback-compose` + `winback-send` + `winback-automations` flow. Same capability, richer surface. No regression.
- **src/app/dashboard/reviews/page.tsx** (prompt 42) — no removals.
- **src/app/dashboard/bookings/page.tsx** (prompt 45) — no removals.
- **src/app/dashboard/quotes/page.tsx** (prompt 46) — skipped (file only present from the upgrade onward; nothing to compare against).
- **src/app/dashboard/recipes/page.tsx** (prompt 47) — no removals.
- **src/app/dashboard/competitors/page.tsx** (prompt 48) — no removals (prior regression where `watches`/`newCompetitor` state was lost was fixed separately in the TSC-clearing pass).
- **src/app/dashboard/social/page.tsx** (prompt 49) — no removals.
- **src/app/dashboard/loyalty/page.tsx** (prompt 50) — no removals.
- **src/app/dashboard/parcel-tracking/page.tsx** (prompt 51) — no removals.
- **src/app/dashboard/shift-reports/page.tsx** (prompt 52) — `dt`, `dur`, `fmt` are trivial date/duration/currency formatters; functionally inlined or restated under different names in the rewrite. No capability loss.
- **src/app/dashboard/weekly-reports/page.tsx** (prompt 53) — `fmtAud`, `fmtWeek` formatter helpers replaced with inline equivalents (`'A$' + n.toLocaleString(...)` and `weekRange()`). No capability loss.

## Summary
- Total pages audited: **20**
- Pages with regressions: **3** (staff, customers, intelligence)
- Pages clean: **16**
- Skipped (no pre-upgrade history): **1** (quotes)
- Total features removed across all pages: **3** distinct features (ClockWidget, RFM customer column, Clear-all-signals button)

## Priority restore list

1. **Intelligence — Clear all signals button** *(cheapest to restore, real UX value)* — re-add `acknowledgeAll()` (or equivalent "Mark all read" header button) to `IntelligencePage`. Pattern is one PATCH per unread event, or extend `/api/intelligence-events` PATCH to accept a bulk-mark-read action. Low blast radius.

2. **Customers — RFM column** *(medium effort, real analytics value)* — re-add the RFM column to the customers table by importing `calcRFM`, `TIER_COLOR`, `RfmTier` from `@/lib/rfm` and rendering a small badge with `calcRFM(spend, visits, lastV)`. The library is still in the codebase.

3. **Staff — ClockWidget** *(medium effort, optional)* — re-introduce the dashboard clock-in/out widget for owners managing their own hours from the dashboard. Less critical now that POS terminal clock-in/out is the primary path, but worth restoring for solo operators. Calls existing `POST /api/pos/timesheets/clock` (verify route still exists before restore).

— end of report —