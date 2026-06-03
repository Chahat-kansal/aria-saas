# Prompt 237 — Run All Pending Prompts (95, 96, 97, 99, 209B) in Sequence

## HOW TO RUN THIS
Run each numbered section below IN ORDER. After each section:
1. `npx tsc --noEmit` — must pass
2. `npm run build` — must pass
3. `git push origin main`
4. Move to the next section

Do NOT jump ahead. Each section builds on the last.

---

## SECTION A — Prompt 95: Stabilization Sweep

**Priority tasks from this prompt (in order):**

### A1 — Briefing cache invalidation
In the briefing API at `/api/aria/dashboard-briefing/[page]`, accept a `?fresh=true` query param that forces regeneration. After every invoice status change (mark-as-paid, send, void), the frontend calls the briefing API with `?fresh=true`. Apply same pattern to all feature briefings (parcels, customers, social, loyalty).

Commit: `"fix(aria-briefing): cache invalidation on invoice/parcel/customer mutations"`

### A2 — Competitor scan/read table mismatch (confirmed bug)
Read `src/app/dashboard/competitor-watch/page.tsx` — identify every table it queries.
Read the scan route at `/api/aria/competitor-scan` — identify every table it writes to.
The scan writes to `aria_competitor_watches` but the page reads from `competitor_businesses` and `competitor_snapshots`. Fix: make the scan also write to the tables the page reads from. Add error handling when 0 competitors found.

Commit: `"fix(competitor-watch): scan writes to same tables page reads from"`

### A3 — Puppeteer fix for PDF generation
In `/api/reports/weekly-generate/route.ts`, replace puppeteer with:
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
Remove plain `puppeteer` if present.
In vercel.json, increase memory to 1024MB and timeout to 60s for the weekly-generate function.

Commit: `"fix(reports): use @sparticuz/chromium for serverless PDF generation"`

### A4 — Theme persistence
Wherever POS theme is stored in useState, persist to localStorage on change and read on mount.

Commit: `"fix(theme): persist light/dark choice across refreshes"`

### A5 — Surface API errors
Add `src/lib/api/client.ts`:
```typescript
export class ApiError extends Error {
  constructor(public status: number, public body: string, public url: string) {
    super(`API ${status}: ${url}`)
  }
}
export async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts)
  if (!r.ok) {
    const body = await r.text()
    throw new ApiError(r.status, body, url)
  }
  return r.json()
}
```
Wrap key dashboard fetches in this helper. Show a toast or inline error state when ApiError is thrown.

Commit: `"feat(api-client): unified fetch helper + error surfacing across dashboard"`

### A6 — Roster guard rails
In the roster generation prompt/route, add hard rules: never recommend closing more than 2 days/week. If fewer than 4 weeks of historical revenue data, do not make closure recommendations — default to scheduling everyone evenly.

Commit: `"fix(roster): guard rails against recommending mass closures"`

### A7 — Aria Says honest empty states
For every dashboard page with an Aria Says banner, verify the briefing generator triggers on page load with an empty-state fallback if data is missing. Replace generic "not enough data" text with specific reasons. Auto-regenerate if briefing is missing.

Commit: `"fix(aria-says): honest empty states + auto-regenerate on page load if briefing missing"`

---

## SECTION B — Prompt 96: Kiosk Welcome Chooser + Structured Response Formatting

### B1 — Welcome chooser page
Create `src/app/in-store/[business_id]/welcome/page.tsx`:
1. On mount, read `?t=` from URL. POST to `/api/in-store/redeem-token`.
2. Fetch `/api/public/instore/config?slug={business_id}` to read `scan_and_go_enabled`.
3. Render two cards:
   - PRIMARY: "Skip the queue — scan as you shop" → `/in-store/{slug}/cart` (hidden if scan_and_go_enabled = false)
   - SECONDARY: "Ask Aria a question" → `/in-store/{slug}/chat`
4. If scan_and_go is OFF, skip chooser entirely — redirect directly to chat.
5. Pipel design system (light, hard ink borders, Inter, lime accent).

Also ensure `instore_kiosk_configs` has `scan_and_go_enabled boolean DEFAULT false` column (already added today — skip if exists).

Modify `/in-store/[business_id]/page.tsx` to redirect to `/welcome?t={token}` when token is in URL.

Commit: `"feat(kiosk): welcome chooser page — fork to scan-and-go or chat after token redeem"`

### B2 — Markdown stripping (fast win)
In the kiosk chat page, add a markdown-to-plain-text pass before rendering:
```typescript
function stripBasicMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
}
```
Apply to every Aria reply text before rendering.

Commit: `"fix(kiosk-chat): strip markdown from Aria replies — no more literal asterisks"`

### B3 — Structured blocks in kiosk chat
In the kiosk chat API route (likely `/api/public/instore/chat/route.ts`):
- Update system prompt to prefer structured blocks over markdown for list-shaped answers
- Return `{ response: <plain text>, blocks: [...] }` same format as `/api/aria/ask`

In the kiosk chat page:
- Import `BlockRenderer` from `src/components/aria/BlockRenderer.tsx`
- Add `theme="light"` prop support to BlockRenderer if not already present
- Render blocks below text when present

Add `menu_list` block type to BlockRenderer if missing:
- Section title, 1-column list with name + price right-aligned
- Optional description in muted text, border between items

Add `recommendation_card` block type if missing:
- Name (Fraunces italic), price, reason in muted text, optional image

Commit: `"fix(kiosk-chat): structured blocks + BlockRenderer — replies look like a menu not raw markdown"`

### B4 — Action card for in-stock items
When Aria confirms an item is in stock, return an `action_card` block with "Add to basket" button → `/in-store/{slug}/cart` with product pre-added.

Commit: `"feat(kiosk-chat): action_card 'Add to basket' when Aria confirms in-stock items"`

---

## SECTION C — Prompt 97: Market Price Comparison

### C1 — DB migrations (run via Supabase MCP)
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

Commit: `"feat(db): market_price_scans table + pos_market_price_cache enhancements"`

### C2 — Market price fetcher lib
Create `src/lib/aria/market-prices.ts`:

```typescript
interface MarketPriceResult {
  source_name: string
  source_url: string
  shelf_price: number
  confidence: 'high' | 'medium' | 'low'
  search_query: string
}
```

Strategy A (always runs): fetch retailer search HTML → pass to Haiku to extract price.
Retailer URLs per industry:
- liquor: danmurphys.com.au, bws.com.au, liquorland.com.au
- cafe/retail/bakery: coles.com.au, woolworths.com.au
- restaurant: ubereats.com/au, menulog.com.au

SSRF guard: allowlist only the above domains. Never follow redirects to private IPs.
Rate limits: 2s between different domains, 5s between same domain, max 5 retailers/product.
Cache: 24h (check expires_at before re-fetching).

Strategy B (fallback if GOOGLE_CUSTOM_SEARCH_CX env exists): Google Custom Search API.

Haiku prompt for price extraction:
```
Extract the price of "{productName}" from this search result HTML.
Return JSON: { "found": true/false, "price": number_or_null, "product_name": string_or_null }
If multiple results, return the lowest price for the most closely matching product.
Only return JSON, nothing else.
```

Commit: `"feat(market-prices): market price fetcher lib — HTML fetch + Haiku extraction"`

### C3 — Scan API routes
`POST /api/market-prices/scan` — creates scan row, fires background scan, returns `{ scan_id }` immediately.
- 1-scan-per-day limit (failed scans don't count)
- Scans top 20 active products by revenue DESC
- Writes to `pos_market_price_cache` with price_gap_cents, is_overpriced, is_underpriced
- Logs Haiku calls to `aria_ai_calls`

`GET /api/market-prices/scan/[scan_id]` — returns scan status + summary.

`GET /api/market-prices/results` — returns products with cached market prices.

Commit: `"feat(market-prices): scan API routes (trigger + poll + results)"`

### C4 — Market Prices tab in competitor-watch dashboard
In `/dashboard/competitor-watch/page.tsx`, add a "Market Prices" tab:
- Scan trigger button + "Last scanned: X ago"
- AriaSays banner with summary
- 3 stat cards: Overpriced / Underpriced / In range
- Product table: Product | Your price | Market low | Market avg | Gap | Status | Action
- Status: 🔴 Overpriced / 🟢 Underpriced / ⚪ In range
- "Match price" button → updates pos_products.price with confirmation dialog
- "View source" link → opens found_url in new tab
- Retailer breakdown per product
- Mobile responsive: cards stack to 1-column

Commit: `"feat(competitor-watch): Market Prices tab with product comparison table"`

### C5 — Daily briefing integration
In the daily briefing generator, add a market prices block if `market_price_scans` has a completed scan < 7 days old. Industry-specific framing:
- liquor: Dan Murphy's pricing context
- cafe: local average comparison
- retail: Coles/Woolworths comparison

Commit: `"feat(market-prices): daily briefing integration + industry-specific insights"`

### C6 — Daily cron
New route: `/api/cron/market-price-refresh`
Add to vercel.json: `"schedule": "0 15 * * *"` (3pm UTC = 1am AEST)
Auto-scan top 10 products for businesses that used the feature in last 30 days but haven't scanned in 20h.

Commit: `"feat(market-prices): daily cron auto-refresh for active businesses"`

---

## SECTION D — Prompt 99: Share Dashboard + Schedule PDF

### D1 — Shared read-only dashboard links

#### API routes
`POST /api/share-links` — create (auth required, validates business ownership)
`GET /api/share-links` — list for business (auth required)
`DELETE /api/share-links/[id]` — deactivate (auth required)
`GET /api/shared/[token]` — validate token + return business_id and allowed pages (PUBLIC, no auth)

Tables `dashboard_share_links` and `scheduled_pdf_reports` may already exist — check first, skip migration if they do.

If not, create:
```sql
CREATE TABLE IF NOT EXISTS dashboard_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  label text NOT NULL,
  recipient_name text,
  recipient_email text,
  pages_allowed text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  access_count int DEFAULT 0,
  last_accessed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE dashboard_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_share_links" ON dashboard_share_links
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS scheduled_pdf_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  share_link_id uuid REFERENCES dashboard_share_links(id) ON DELETE SET NULL,
  label text NOT NULL,
  page text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  day_of_week int,
  day_of_month int,
  hour_aest int DEFAULT 8,
  recipients jsonb NOT NULL DEFAULT '[]',
  include_share_link boolean DEFAULT true,
  is_active boolean DEFAULT true,
  last_sent_at timestamptz,
  next_send_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE scheduled_pdf_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_scheduled_pdf" ON scheduled_pdf_reports
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

#### Shared view route
Create `src/app/shared/[token]/page.tsx`:
1. Validate token via `GET /api/shared/[token]` — if invalid/expired: friendly error page
2. If valid: increment access_count, render shared view
3. Top bar: business name, "Shared by Aria OS", date
4. Sidebar: only pages from pages_allowed
5. ReadOnly context provider: hides action buttons, prevents mutation
6. Footer: "Read-only view shared by {business_name}. Data refreshes daily."

Shareable pages: overview, cash-flow, invoices, sales, staff, weekly-reports, profit-leaks, competitors
NOT shareable: customers, loyalty, winback, ask-aria, settings, admin

#### Settings page
Add `/dashboard/settings/sharing` page:
- List existing share links (label, recipient, pages, expires, access count, active toggle, delete)
- "Create new share link" form: label, recipient name+email, pages checkboxes, expiry, "Generate link" button
- Shows copy-able URL + "Email this link" button after creation

Commit: `"feat(sharing): read-only dashboard share links for accountants/partners"`

### D2 — Schedule dashboard page as PDF email

#### Schedule PDF modal
Add a "Schedule PDF" button (calendar icon) to every major dashboard page top bar. Opens a modal:
- Label (prefilled with page name)
- Frequency: Daily / Weekly / Monthly
- Weekly: pick day of week; Monthly: pick day of month
- Time: hour in AEST (default 8am)
- Recipients: up to 5 email addresses
- Include share link toggle
- "Schedule" button → creates row in `scheduled_pdf_reports`

#### PDF generation
Reuse `@sparticuz/chromium` + `puppeteer-core` (already installed in Section A3).
Navigate to the shared link for the relevant page, wait for render, generate PDF, send via SendGrid.

#### Cron
New route: `/api/cron/send-scheduled-reports`
Add to vercel.json: `"schedule": "0 20 * * *"` (8pm UTC = 6am AEST)
Query `scheduled_pdf_reports` where is_active=true and next_send_at < now().
For each: generate PDF, email to recipients, update last_sent_at, compute next_send_at.

`computeNextSend` function:
```typescript
function computeNextSend(freq: string, dayOfWeek: number|null, dayOfMonth: number|null, hourAest: number): Date {
  const now = new Date()
  const hourUtc = (hourAest - 10 + 24) % 24
  if (freq === 'daily') {
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }
  if (freq === 'weekly' && dayOfWeek !== null) {
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7 || 7
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return next
  }
  if (freq === 'monthly' && dayOfMonth !== null) {
    const next = new Date(now)
    next.setUTCDate(Math.min(dayOfMonth, 28))
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1)
    return next
  }
  return now
}
```

Email template (SendGrid):
- Subject: "{label} — {month} {year}"
- Body: business name, "Here is your scheduled {frequency} report for {label}", date range, PDF attached
- If include_share_link: "View the live dashboard here: {url}"
- Footer: "You're receiving this because {owner_name} set up this scheduled report."

#### Settings page
Add `/dashboard/settings/reports` page: list all scheduled reports with status, last sent, next send, edit/delete/pause buttons.

#### Sidebar entries
Under SETTINGS in sidebar: "Sharing" and "Scheduled Reports"

Commit: `"feat(scheduled-reports): schedule any dashboard page as PDF email with recurring delivery"`

---

## SECTION E — Prompt 209B: Landing Page Layout Fix

### E1 — Fix scene overflow in aria-landing.css
In `src/styles/aria-landing.css`, find `.landing-v3 .scene` and change:
- `overflow: hidden` → `overflow-y: auto; overflow-x: hidden`
- `padding: 80px 32px` → `padding: 60px 32px`
- Add: `scrollbar-width: none; -ms-overflow-style: none;`
- Add: `.landing-v3 .scene::-webkit-scrollbar { display: none; }`

Update `.landing-v3 .scene-inner`:
- Add: `display: flex; flex-direction: column; align-items: center; padding-bottom: 40px;`

Commit: `"fix(landing/css): scene overflow-y:auto — fixes Remotion Player clipping"`

### E2 — Fix Remotion Player sizes
For each scene component that has a Remotion Player, reduce compositionHeight to fit within viewport. Max compositionHeight = 380px. Remove any feature grids below the Player if they push content below viewport.

Affected scenes: MeetAriaScene, SmartPOSScene, BrainScene, ReorderScene, AskScene, ProblemSceneNew.
DO NOT touch: ProblemScene, ScheduleScene, AustraliaScene, TestimonialScene, PricingTiersScene, OutroScene, TenMinutesScene, AustraliaWideScene, PricingAgentScene.

Commit: `"fix(landing/scenes): resize Remotion Players to fit viewport, remove overflowing grids"`

### E3 — Fix h2 font size
Find `.landing-v3 .scene h2` in aria-landing.css, set:
```css
.landing-v3 .scene h2 {
  font-size: clamp(2rem, 4.5vw, 3.5rem);
  line-height: 1.08;
}
```

Commit: `"fix(landing/css): reduce h2 size in scenes — Cormorant was too large"`

### E4 — Check missing Remotion compositions
Verify all composition files exist in `src/components/marketing/landing/remotion/`:
- DailyBriefingComp.tsx, POSCheckoutComp.tsx, WinbackComp.tsx, BrainOrbComp.tsx, AskAriaComp.tsx, RevenueChartComp.tsx

For any missing file, create a minimal working composition using AbsoluteFill from remotion with animated content matching the scene's purpose.

DO NOT touch: LandingShell.tsx, StickyOverlay.tsx, ProgressBar.tsx, scene-data.ts

Commit: `"fix(landing/remotion): ensure all 6 compositions exist and export correctly"`

---

## FINAL RULES (apply throughout)
- `npx tsc --noEmit` + `npm run build` before EVERY commit
- `git push origin main` after EVERY commit
- Vercel functions limit stays at exactly 22
- Cron schedules: daily only (never sub-daily)
- UPGRADE_ONLY / RULE 0: no feature, field, or capability removed
- If a section fails to build, fix it before moving to the next section
- Do not combine sections into one commit — each task gets its own commit

## PRIORITY if limit runs low
Run in this order: A2 → A3 → B1 → B2 → C1 → C2 → C3 → C4 → D1 → E1 → E2
Stop after each section push and report status.
