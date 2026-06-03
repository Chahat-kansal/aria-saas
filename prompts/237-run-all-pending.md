# Prompt 237 — Run All Pending Prompts (95, 96, 97, 99, 209B) — Upgrade-Only, Audit-Verified

## PRE-FLIGHT (mandatory before anything)
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
Read CLAUDE.md. Read every file you will edit IN FULL before writing a single line.
UPGRADE-ONLY: never remove, stub, or downgrade anything. Fix forward only.
One commit per task. `git push origin main` after every commit.

---

## WHAT IS ALREADY DONE — DO NOT REIMPLEMENT

Full code audit confirmed these are already built:

- **A4 Theme persistence** — `POSSidebar.tsx` already uses `localStorage.getItem('pos_theme')` and `localStorage.setItem('pos_theme', theme)`. ✅ SKIP.
- **A5 API client** — `src/lib/api/client.ts` exists (57 lines) with `apiFetch` + `ApiError`. ✅ SKIP.
- **A6 Roster guard rails** — `src/app/api/aria/roster/route.ts` (278 lines) already has guard logic. ✅ SKIP.
- **B1 Welcome chooser** — `src/app/in-store/[business_id]/welcome/page.tsx` exists. Main page already redirects to welcome. ✅ SKIP.
- **B2 Markdown stripping** — `stripBasicMarkdown` already in `src/app/in-store/[business_id]/KioskClient.tsx`. ✅ SKIP.
- **C2 Market fetcher lib** — `src/lib/aria/market-prices.ts` exists. ✅ SKIP.
- **C3 Scan routes** — `/api/market-prices/scan` (203 lines) + `/api/market-prices/results` (112 lines) with daily limit + background fire. ✅ SKIP.
- **C4 Market Prices tab** — competitors dashboard already has market prices. ✅ SKIP.
- **C6 Market price cron** — `/api/cron/market-price-refresh` exists. ✅ SKIP.
- **D1 Share links API** — `/api/share-links` (96 lines), `/shared/[token]` (117 lines), `/dashboard/settings/sharing` (189 lines) all exist. ✅ Mostly done — see gap below.
- **D2 Schedule cron** — `/api/cron/send-scheduled-reports` (271 lines, generates PDF), `/dashboard/settings/reports` (234 lines) both exist. ✅ Mostly done — see gap below.
- **E1 CSS overflow fix** — `aria-landing.css` already has `overflow-y: auto` and `scrollbar-width: none`. ✅ SKIP.
- **E3 h2 font clamp** — already applied. ✅ SKIP.
- **E4 Remotion compositions** — all 6 exist: AskAriaComp, BrainOrbComp, DailyBriefingComp, POSCheckoutComp, RevenueChartComp, WinbackComp. ✅ SKIP.

---

## GENUINELY PENDING — GAPS CONFIRMED BY CODE AUDIT

---

## TASK 1 — A1: Briefing Cache Invalidation

**What exists:** `/api/aria/briefing/route.ts` and `/api/aria/daily-briefing/route.ts` exist. No `dashboard-briefing` route.
**What's missing:** No `?fresh=true` param handling. No post-mutation briefing refresh in invoice/parcel/customer pages.

### Fix
Read `/api/aria/briefing/route.ts` (147 lines) fully first.

Add `?fresh=true` / `force_refresh=true` support: when this param is present, skip cache and regenerate the briefing immediately. Pattern — at the top of the GET handler:
```typescript
const forceRefresh = req.nextUrl.searchParams.get('fresh') === 'true'
// If forceRefresh, bypass any cached row and regenerate
```

Then in the invoice page (`src/app/dashboard/invoices/page.tsx`), after marking an invoice paid/sent/voided, call:
```typescript
fetch(`/api/aria/briefing?businessId=${bid}&fresh=true`, { method: 'GET' }).catch(() => {})
```
Apply same pattern to: parcel status changes, customer winback sends, social post publish.

Commit: `"fix(aria-briefing): fresh=true param forces regeneration + post-mutation refresh on invoice/parcel/customer"`

---

## TASK 2 — A2: Competitor Scan/Read Table Mismatch

**What exists:** `/api/aria/competitors/route.ts` (159 lines) — writes to `aria_competitor_watches` AND `competitor_businesses`. Competitors dashboard (726 lines) — reads from neither (uses its own fetch pattern).
**What's missing:** Dashboard page doesn't read from the tables the scan writes to. Also needs 0-result error surfacing.

### Fix
Read `src/app/dashboard/competitors/page.tsx` fully. Find where it fetches competitor data.
Read `src/app/api/aria/competitors/route.ts` fully. Note what it writes.

Reconcile: ensure the dashboard's fetch calls hit the same tables the scan writes to. Specifically:
- If dashboard reads from a different endpoint, either update it to read from `competitor_businesses` + `competitor_snapshots`, or update the scan route to also populate whatever the dashboard reads.
- Add error handling: when scan returns 0 results, surface a clear message to the owner ("No competitors found within 5km — try expanding the radius or running a new scan").

Do NOT remove any existing competitor data tables or columns. Add to what exists.

Commit: `"fix(competitor-watch): scan + read tables reconciled, 0-result error surfaced"`

---

## TASK 3 — A3: Puppeteer Fix for PDF Generation

**What exists:** `src/app/api/reports/weekly-generate/route.ts` (109 lines) — imports from `src/lib/reports/weekly-pdf.ts`. No puppeteer import in the route itself.
**What's missing:** Need to check `src/lib/reports/weekly-pdf.ts` — that's where the actual browser launch happens.

### Fix
Read `src/lib/reports/weekly-pdf.ts` fully first. If it uses plain `puppeteer`, replace with:
```typescript
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
})
```
Run: `npm i @sparticuz/chromium puppeteer-core`
Remove plain `puppeteer` from package.json if present (check it's not used elsewhere first).

In `vercel.json`, find the weekly-generate function config and ensure memory is at least 1024MB and maxDuration 60s. Do NOT exceed 22 total functions and do NOT change cron schedules.

If `weekly-pdf.ts` already uses `@sparticuz/chromium` → skip this task.

Commit: `"fix(reports): @sparticuz/chromium for serverless PDF + memory/timeout in vercel.json"`

---

## TASK 4 — A7: Aria Says Honest Empty States

**What exists:** Page-insight briefing exists. No evidence of honest empty state copy.
**What's missing:** Generic "not enough data" text needs replacing with specific reasons. Auto-regenerate if stale.

### Fix
Search for "not enough data" and "keep using Aria" across dashboard pages. For each occurrence:
- Replace with specific reason why data is missing (e.g. "Connect your POS to see sales insights" or "Run your first SEO audit to see results")
- Add a retry/regenerate button that re-calls the briefing endpoint with `?fresh=true`

Do NOT remove any existing Aria Says banners. Only improve their empty-state copy.

Commit: `"fix(aria-says): specific empty states + regenerate button on stale briefings"`

---

## TASK 5 — B3: BlockRenderer Missing Block Types

**What exists:** `src/components/aria/BlockRenderer.tsx` (436 lines) — has: number, lead, text, chart, metric_row, brain_readouts, council_split, action_list, action_single, html, live_render, styled_chart, line, area, pie.
**What's missing:** `menu_list`, `recommendation_card`, `action_card`, `theme` prop for light mode.

### Fix
Read `src/components/aria/BlockRenderer.tsx` fully first. It's 436 lines — understand the existing pattern for adding block types before writing anything.

Add to BlockRenderer (ADDITIVE — do not change existing block types):

**`theme` prop** — add `theme?: 'light' | 'dark'` to the component props. Default `'dark'`. When `theme='light'`, use white/ink colours instead of dark. Pass through to child renderers.

**`menu_list` block type:**
```tsx
// { type: 'menu_list', title: string, items: { name: string, price: string, description?: string }[] }
// Layout: section title, 1-column list, name + price right-aligned, description in muted text below, border between items
```

**`recommendation_card` block type:**
```tsx
// { type: 'recommendation_card', name: string, price: string, reason: string, image_url?: string }
// Layout: name in Fraunces italic, price, reason in muted text, optional image left
```

**`action_card` block type:**
```tsx
// { type: 'action_card', title: string, body: string, buttons: { label: string, href: string }[] }
// Layout: title, body text, buttons row
```

In the kiosk chat page (`src/app/in-store/[business_id]/KioskClient.tsx` or similar), pass `theme="light"` to BlockRenderer since kiosk uses Pipel light theme.

Commit: `"feat(BlockRenderer): add menu_list, recommendation_card, action_card block types + theme prop for light mode"`

---

## TASK 6 — B4: Action Card for In-Stock Items in Kiosk

**What exists:** Instore chat API (`src/app/api/public/instore/chat/route.ts`, 446 lines) returns blocks. No action_card for in-stock confirmations.
**What's missing:** When Aria confirms an item is in stock, it should return an `action_card` block with "Add to basket" button.

### Fix
Read `src/app/api/public/instore/chat/route.ts` fully. Find where in-stock responses are constructed.

Update the system prompt to include: when confirming an item is in stock, include an `action_card` block:
```json
{
  "type": "action_card",
  "title": "Yes, we have it",
  "body": "{product_name} — {price}",
  "buttons": [{"label": "Add to basket", "href": "/in-store/{slug}/cart?add={product_id}"}]
}
```

The cart page already exists at `/in-store/{slug}/cart`. Ensure it accepts a `?add={product_id}` query param to pre-add an item (read the cart page first to check if this already works).

Commit: `"feat(kiosk-chat): action_card with Add to basket when Aria confirms in-stock items"`

---

## TASK 7 — C1: Market Price DB Migrations

**What exists:** `pos_market_price_cache` table exists but missing the new columns. `market_price_scans` table does not exist.
**What's missing:** New columns on `pos_market_price_cache` + `market_price_scans` table.

### DB (run via Supabase MCP)
```sql
ALTER TABLE pos_market_price_cache
  ADD COLUMN IF NOT EXISTS retailer_type text DEFAULT 'competitor',
  ADD COLUMN IF NOT EXISTS price_gap_cents int,
  ADD COLUMN IF NOT EXISTS price_gap_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS is_underpriced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_overpriced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS search_query text;

CREATE TABLE IF NOT EXISTS market_price_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  products_scanned int DEFAULT 0,
  prices_found int DEFAULT 0,
  overpriced_count int DEFAULT 0,
  underpriced_count int DEFAULT 0,
  potential_revenue_gain_cents int DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  error_detail text,
  triggered_by text DEFAULT 'manual'
);
ALTER TABLE market_price_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_scans_owner" ON market_price_scans
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

Commit: `"feat(db): market_price_scans table + pos_market_price_cache new columns"`

---

## TASK 8 — C5: Market Prices in Daily Briefing

**What exists:** `/api/aria/briefing/route.ts` (147 lines). No market price data included.
**What's missing:** Market price summary block in the briefing when scan data exists.

### Fix
Read `/api/aria/briefing/route.ts` fully. Find where business context data is assembled.

Add a market prices block — query `market_price_scans` for the most recent completed scan < 7 days old. If found, query `pos_market_price_cache` for overpriced/underpriced items. Add to briefing context:
```
Market prices (last scanned {date}): {overpriced_count} products above market. Biggest gap: {product} at ${owner_price} vs market ${market_avg}. Potential recovery: ${weekly_estimate}/week.
```
Industry-specific framing: liquor mentions Dan Murphy's, cafe mentions local average, retail mentions Coles/Woolworths.

If no scan data exists (most businesses initially) → skip silently, do not add empty market section.

Commit: `"feat(market-prices): market price summary in daily briefing when scan data exists"`

---

## TASK 9 — D1: Share Links — ReadOnly Context Missing

**What exists:** `/shared/[token]/page.tsx` (117 lines) — validates token, renders shared view. No ReadOnly context — action buttons are NOT hidden.
**What's missing:** ReadOnly context provider that hides mutation buttons in the shared view.

### Fix
Read `src/app/shared/[token]/page.tsx` fully.

Create `src/contexts/ReadOnlyContext.tsx`:
```typescript
import { createContext, useContext } from 'react'
export const ReadOnlyContext = createContext(false)
export const useReadOnly = () => useContext(ReadOnlyContext)
```

In the shared route, wrap rendered content with `<ReadOnlyContext.Provider value={true}>`.

In each dashboard page component that can be shared (invoices, cash-flow, sales, staff, reports, profit-leaks, competitors), add:
```typescript
const isReadOnly = useReadOnly()
// Then: hide action buttons when isReadOnly is true
// e.g. {!isReadOnly && <button>Mark as paid</button>}
```

Do NOT remove buttons from the normal dashboard — only hide them in the read-only shared context. This is purely additive.

Commit: `"feat(sharing): ReadOnly context provider — hides action buttons in shared dashboard view"`

---

## TASK 10 — D2: Schedule PDF Button on Dashboard Pages

**What exists:** `/api/cron/send-scheduled-reports` (271 lines, generates PDF) ✅, `/dashboard/settings/reports` (234 lines) ✅. No "Schedule PDF" button visible on dashboard pages.
**What's missing:** The "Schedule PDF" trigger button on each major dashboard page so owners can discover and use the feature.

### Fix
Read `src/app/dashboard/layout.tsx` or the main dashboard shell to understand where the top bar renders.

Add a small "Schedule PDF" button (calendar icon) to the top-right area of the dashboard layout — visible on every dashboard page. On click, open a modal:
- Label (prefilled with current page name from `usePathname()`)
- Frequency: Daily / Weekly / Monthly
- Day/time selector (depending on frequency)
- Recipients: up to 5 emails
- "Schedule" → POST to existing `/api/scheduled-reports` route (find the actual route that writes to `scheduled_pdf_reports`)

On mobile, collapse the button into an overflow/actions menu.
Do NOT modify the cron or settings pages — they already work. Only add the discovery surface.

Commit: `"feat(scheduled-reports): Schedule PDF button in dashboard top bar — modal to create scheduled report"`

---

## TASK 11 — E2: Fix Remotion Player Scene Sizes

**What exists:** All 6 compositions exist. `aria-landing.css` has `overflow-y: auto`. But `.scene` still has `align-items: flex-start` and `padding: 0 32px` — Players may still overflow.
**What's missing:** Player `compositionHeight` values may still be too large for the viewport.

### Fix
Read each scene component in `src/components/marketing/landing/`:
- `MeetAriaScene.tsx`, `SmartPOSScene.tsx`, `BrainScene.tsx`, `ReorderScene.tsx`, `AskScene.tsx`, `ProblemSceneNew.tsx`

For each that has a Remotion Player, check the `compositionHeight`. If it exceeds 380px, reduce it. Also remove any feature grids stacked below the Player that cause overflow.

**DO NOT touch:** ProblemScene, ScheduleScene, AustraliaScene, TestimonialScene, PricingTiersScene, OutroScene, TenMinutesScene, AustraliaWideScene, PricingAgentScene, LandingShell.tsx, StickyOverlay.tsx, ProgressBar.tsx, scene-data.ts.

If all Player heights are already ≤ 380px → skip this task.

Commit: `"fix(landing/scenes): reduce Remotion Player compositionHeight to fit viewport"`

---

## FINAL RULES
- `npx tsc --noEmit` + `npm run build` before every commit
- `git push origin main` after every commit
- Vercel: max 22 functions, cron schedules daily only
- UPGRADE-ONLY: never remove existing code — only add
- Amounts in dollars (numeric), never cents
- Models: `claude-haiku-4-5-20251001` for AI calls

## PRIORITY ORDER if limit runs low
1. Task 7 (C1 DB) — market_price_scans table needed for scan routes to work
2. Task 3 (A3 Puppeteer) — PDF generation broken without this
3. Task 5 (B3 BlockRenderer) — kiosk needs menu_list + theme prop
4. Task 1 (A1 Briefing cache) — invoice stale state bug
5. Task 2 (A2 Competitor tables) — scan/read mismatch bug
6. Task 9 (D1 ReadOnly) — share links need this to be secure
7. Task 10 (D2 Schedule button) — discoverability
8. Task 8 (C5 Briefing market) — nice to have
9. Task 6 (B4 action_card) — kiosk add-to-basket
10. Task 4 (A7 empty states) — copy polish
11. Task 11 (E2 Remotion sizes) — landing polish
