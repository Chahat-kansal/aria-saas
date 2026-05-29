# Prompt 97 — Market price comparison (all industries, $0 data cost)

## What this builds
Aria searches the public web for market prices of the owner's products, compares
them to what the owner is charging, and generates actionable intelligence:
"You're $3 above Dan Murphy's on Coopers Pale — you've lost this SKU 47 times
this month" or "Your latte is $1 below the local average — you have pricing power."

$0 data cost. Zero paid APIs. Uses two free mechanisms:
1. Server-side HTML fetch + Haiku extraction (completely free)
2. Google Custom Search API free tier (100 queries/day, no credit card)

## Pre-edit checklist
1. Read src/app/dashboard/competitor-watch/page.tsx - existing competitor UI
2. Read schema of pos_market_price_cache (columns: id, product_id, business_id,
   barcode, source_name, source_url, shelf_price, fetched_at, expires_at)
3. Read schema of competitor_price_cache (columns: id, business_id, product_name,
   competitor_name, competitor_address, competitor_distance_m,
   competitor_price_cents, source, confidence, found_url, searched_at, expires_at)
4. Read pos_products schema - particularly name, price, category, barcode,
   is_active fields
5. Check if GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_CX exist in
   Vercel env vars. If not, the feature must work WITHOUT them using HTML fetch only.

## DB additions (run via Supabase MCP)

```sql
-- Add retailer tracking to pos_market_price_cache
ALTER TABLE pos_market_price_cache
  ADD COLUMN IF NOT EXISTS retailer_type text DEFAULT 'competitor',
  ADD COLUMN IF NOT EXISTS price_gap_cents int,
  ADD COLUMN IF NOT EXISTS price_gap_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS is_underpriced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_overpriced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS search_query text;

-- Market price scan jobs (track what we searched and when)
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

## TASK 1 — Market price fetcher lib

New file: `src/lib/aria/market-prices.ts`

### Function: searchMarketPrice(productName, productCategory, industry, businessSuburb)

Returns an array of `MarketPriceResult`:
```typescript
interface MarketPriceResult {
  source_name: string      // "Dan Murphy's", "BWS", "Coles", etc.
  source_url: string
  shelf_price: number      // in dollars
  confidence: 'high' | 'medium' | 'low'
  search_query: string
}
```

### Strategy A — HTML fetch + Haiku extraction (primary, always runs)

Build target URLs based on industry:

```typescript
const RETAILER_SEARCH_URLS: Record<string, string[]> = {
  liquor: [
    `https://www.danmurphys.com.au/search?searchTerm={query}`,
    `https://bws.com.au/search/{query}`,
    `https://www.liquorland.com.au/liquor/search?searchTerm={query}`,
  ],
  cafe: [
    `https://www.coles.com.au/search?q={query}`,
    `https://www.woolworths.com.au/shop/search/products?searchTerm={query}`,
    `https://www.costco.com.au/search?q={query}`,
  ],
  retail: [
    `https://www.coles.com.au/search?q={query}`,
    `https://www.woolworths.com.au/shop/search/products?searchTerm={query}`,
    `https://www.amazon.com.au/s?k={query}`,
  ],
  bakery: [
    `https://www.coles.com.au/search?q={query}`,
    `https://www.woolworths.com.au/shop/search/products?searchTerm={query}`,
  ],
  restaurant: [
    `https://www.ubereats.com/au/feed?q={query}`,
    `https://www.menulog.com.au/search?term={query}`,
  ],
}
```

For each URL:
1. `fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AriaBot/1.0)' }, signal: AbortSignal.timeout(8000) })`
2. If response is HTML (Content-Type text/html), read up to first 50KB only (price data is near the top of search results)
3. Pass the HTML + this prompt to Haiku:
   ```
   Extract the price of "{productName}" from this search result HTML.
   Return JSON: { "found": true/false, "price": number_or_null, "product_name": string_or_null }
   If multiple results, return the lowest price for the most closely matching product.
   If no clear match, return { "found": false }.
   Only return JSON, nothing else.
   ```
4. Parse the JSON. If found = true and price is a reasonable number (> 0 and < 10000),
   add to results with confidence based on how well the product name matched.

SSRF guard: before fetching any URL, verify the hostname is in an allowlist of
known Australian retailers. Never follow redirects to private IPs.

### Strategy B — Google Custom Search (fallback, only if GOOGLE_CUSTOM_SEARCH_CX env exists)

```
GET https://www.googleapis.com/customsearch/v1
  ?key={GOOGLE_CUSTOM_SEARCH_API_KEY}
  &cx={GOOGLE_CUSTOM_SEARCH_CX}
  &q={productName}+price+australia
  &num=5
```

Parse results for price mentions using a regex: /\$[\d,]+\.?\d*/g
Take the first valid price found from a trusted retailer domain.

This is the fallback because:
- Strategy A costs $0 regardless of volume
- Strategy B is limited to 100 free queries/day
- Strategy A has better structured data from retailer search pages

### Rate limits and politeness
- 2 second delay between fetches to different domains
- 5 second delay between fetches to the same domain
- Maximum 5 retailers per product
- Maximum 20 products per scan job
- Cache results for 24 hours (check expires_at before re-fetching)

## TASK 2 — Market price scan API

New route: `POST /api/market-prices/scan`

Body: `{ business_id: string, product_ids?: string[] }`

Auth: authenticated owner of that business only.

### 1-scan-per-day limit (enforced server-side)
Before creating a new scan, check if a scan already completed successfully today:
```typescript
const { data: todaysScan } = await supabaseAdmin
  .from('market_price_scans')
  .select('id, started_at, status')
  .eq('business_id', business_id)
  .eq('status', 'complete')
  .gte('started_at', new Date(new Date().setHours(0,0,0,0)).toISOString())
  .maybeSingle()

if (todaysScan) {
  return NextResponse.json({
    error: 'daily_limit_reached',
    message: 'Market price scan already ran today. Results are fresh — check again tomorrow.',
    next_available: new Date(new Date().setHours(24,0,0,0)).toISOString(),
    last_scan_id: todaysScan.id,
  }, { status: 429 })
}
```
The frontend should show: "Scan already ran today — results are fresh. Next scan available tomorrow."
Include a "View today's results" button that scrolls to the product table.

Failed scans do NOT count against the daily limit — the owner can retry if something went wrong.
The cron auto-scan counts as the daily scan (so manual scans are blocked after the cron runs too).

1. Create a `market_price_scans` row with status='running'. Return `{ scan_id }` immediately (don't keep the HTTP connection open for 3 minutes).
2. Run the scan in the background (use `setImmediate` or just fire-and-forget after returning the response):
   - Load up to 20 active products for this business, ordered by revenue DESC (highest value products first — those are the ones where pricing matters most)
   - If product_ids provided, scan only those
   - For each product, call `searchMarketPrice()`
   - Write results to `pos_market_price_cache`
   - Compute `price_gap_cents` = owner_price - market_price (positive = overpriced)
   - Compute `is_overpriced` = price_gap > 5% above market average
   - Compute `is_underpriced` = price_gap < -5% below market average
   - Update `market_price_scans` with counts and status='complete'
3. Log the scan cost to `aria_ai_calls` (Haiku calls per product)

New route: `GET /api/market-prices/scan/[scan_id]`
Returns the scan status and summary. Frontend polls this.

New route: `GET /api/market-prices/results`
Query params: `business_id`, `overpriced_only=true`, `limit=20`
Returns products with their cached market prices for the dashboard.

## TASK 3 — Market price intelligence dashboard tab

On `/dashboard/competitor-watch/page.tsx`, add a new tab:
**"Market Prices"** (alongside existing Overview / Prices / Alerts / Manage Watches)

### Tab layout

Top section: scan trigger
```
[Run market price scan]   Last scanned: 2 hours ago
Note: Scans your top 20 products against major retailers. Takes 2-4 minutes.
```

AriaSays banner with a summary once a scan has run:
- "3 of your products are priced above market. Fixing them could recover $180/week."
- "Your latte is $1.20 below the local café average — you have room to raise it."

Three stat cards:
- Overpriced products (count + total revenue at risk)
- Underpriced products (count + pricing power)
- In range (count)

Product table:
- Columns: Product, Your price, Market low, Market avg, Gap, Status, Action
- Status: 🔴 Overpriced / 🟢 Underpriced / ⚪ In range
- Action: "Match price" button → updates pos_products.price to the market low
  (with a confirmation dialog: "Set {product} to ${market_low}?")
- "View source" link → opens the found_url in a new tab so the owner can verify

Retailer breakdown:
- For each product that has market data, show which retailers were found and at what price
- E.g. "Coopers Pale 6pk: Dan Murphy's $22 / BWS $23.50 / Liquorland $24"

### Mobile responsive
Stack to a single column. Stat cards go 1-column. Product table becomes a card list.

## TASK 4 — Wire into daily briefing

In the daily briefing generator, after the existing sections, add a market prices block:

```
MARKET PRICE INTELLIGENCE (if market_price_scans has a completed scan < 7 days old):
- X products priced above market average
- Biggest gap: {product} at ${owner_price} vs market ${market_avg} (${gap} above)
- Potential weekly revenue recovery if corrected: ${estimate}
```

Aria's framing in the briefing:
- If overpriced: "Quick win: 3 products are above market — fixing {product} alone
  could recover $40/week based on your recent sales volume."
- If underpriced: "Pricing power: your {product} is $1.20 below the local average
  — room to raise without losing customers."
- If in range: "Your pricing is competitive. Last checked {date}."

## TASK 5 — Cron: daily market price refresh

New cron route: `/api/cron/market-price-refresh`
Schedule in vercel.json: `0 1 * * *` (1am AEST = 3pm UTC)

For each business that:
- Has had a manual scan in the last 30 days (they use the feature)
- Has NOT had a scan in the last 20 hours (don't re-scan unnecessarily)

Auto-run a scan of their top 10 products (not 20 — cron budget is tighter).

## Env vars required
- `GOOGLE_CUSTOM_SEARCH_API_KEY` (optional — free tier, 100/day)
- `GOOGLE_CUSTOM_SEARCH_CX` (optional — custom search engine ID)

If neither is set, Strategy A (HTML fetch) runs only. Feature still works.

Instructions to set up the free Google Custom Search (add to README or a
/dashboard/settings page):
1. Go to https://programmablesearchengine.google.com/
2. Create a new search engine, set "Search the entire web"
3. Copy the CX (Search Engine ID)
4. Go to https://console.cloud.google.com, create a Custom Search JSON API key
5. Add both to Vercel env vars: GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_CX

## Industry-specific intelligence (the AI differentiation)

In the Aria briefing and dashboard insights, tailor the framing by industry:

- **Liquor**: "Dan Murphy's guarantee means if you're above their price, you're
  actively losing customers who know to check. Your Coopers 6pk at $24 is $2
  above their $22 — that's a signal, not a coincidence."
- **Café**: "Local café average for a large oat milk latte is $7.50. You're at
  $6.50. That's not competitiveness, that's $1 you're leaving on every sale."
- **Retail**: "Coles has your equivalent at $4.20. You're at $5.50. Either
  differentiate with service/story, or match them on this SKU."
- **Bakery**: "Your sourdough is $2 below the average artisan bakery price in
  your suburb. Strong demand signal — try $9.50 and see if conversion holds."
- **Restaurant**: "Uber Eats average for a burger in your area is $22. You're
  at $18. Your delivery margin is taking the hit for no good reason."

## Rules
- npx tsc --noEmit + npm run build pass before each commit
- SSRF guards on every external fetch (allowlist of retailer domains only)
- Cache results for 24h — never re-fetch within the cache window
- Rate limits between retailer fetches (politeness)
- All prices in cents in the DB, dollars in the UI
- Scan runs fire-and-forget — never block the HTTP response
- Cron is once-daily maximum (Vercel Pro rule)
- After all commits: git push origin main

## Commits
- "feat(db): market_price_scans table + pos_market_price_cache enhancements"
- "feat(market-prices): market price fetcher lib — HTML fetch + Haiku extraction"
- "feat(market-prices): scan API routes (trigger + poll + results)"
- "feat(competitor-watch): Market Prices tab with product comparison table"
- "feat(market-prices): daily briefing integration + industry-specific insights"
- "feat(market-prices): daily cron auto-refresh for active businesses"
- Then: git push origin main

## If limit runs low
Priority:
1. DB migrations (run via Supabase MCP)
2. The fetcher lib (Task 1) — the core intelligence
3. Scan API routes (Task 2) — makes it callable
4. Dashboard tab (Task 3) — makes it visible
5. Briefing integration (Task 4) — makes it proactive
6. Cron (Task 5) — makes it automatic
Finish current commit, push, STOP, report.
