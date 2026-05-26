# Prompt 48 — Competitors: SpyFu + Similarweb-Level Pro Upgrade

## Category leader bar
SpyFu: competitor keyword tracking, ad spend monitoring, rank tracking over time.
Similarweb: traffic analysis, competitor benchmark.
For local small business (our market): Google Maps competitor monitoring, price tracking, promo detection, review velocity tracking, social mention monitoring.
Aria must beat ALL of these for local Australian small business context.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/competitors/page.tsx` — full read (18KB)
2. `cat src/app/api/aria/competitors/route.ts` — full read (6KB)
3. `cat src/app/api/aria/competitor-watches/route.ts` — full read (5KB)
4. `cat src/lib/aria/intelligence/competitor.ts` — full read
5. Check DB via Supabase MCP: `aria_competitor_watches`, `competitor_businesses`, `aria_competitor_alerts` — ALL columns
6. Check `GOOGLE_PLACES_API_KEY` is in env (already confirmed set May 13)

## AI differentiation (what beats SpyFu for local business)
- **Aria competitive summary**: every morning, Aria writes a 3-sentence competitive brief — what changed yesterday across all watched competitors
- **Price gap alerts**: when competitor changes price on a product you also sell → instant notification
- **Opportunity detection**: Aria identifies competitor weaknesses from their reviews → "Dan Murphy's customers complain about long queues — you can win them with quick service messaging"
- **Promotional intelligence**: detect when competitor is running a sale and alert owner

## Features to build — no stubs, no TODOs

### 1. Automated daily competitor monitoring (cron)
Build `src/app/api/cron/competitor-monitor/route.ts`.
Runs daily at 8am AEST (`0 22 * * *` UTC).
For each active business with competitor watches:
  For each competitor in `aria_competitor_watches`:
    a. Google Places API: fetch their current rating + review count
    b. If rating changed from last check → create `aria_competitor_alerts` record
    c. If review count jumped >5 → create alert (review velocity spike)
    d. Web search: `"{competitor_name}" {city} price special offer` — detect promotions
    e. Store snapshot in `competitor_snapshots` table
Add to vercel.json: `{"path":"/api/cron/competitor-monitor","schedule":"0 22 * * *"}`

### 2. Competitor snapshot history + trend charts
Store daily snapshots per competitor:
```sql
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  competitor_watch_id uuid REFERENCES aria_competitor_watches(id),
  competitor_name text,
  rating numeric,
  review_count integer,
  price_index numeric, -- relative price level 1-5
  snapshot_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
```
On competitors page: for each competitor, show rating trend chart (recharts LineChart).
Last 30 days of rating. Your rating as green line, competitor as grey dashed.
"Dan Murphy's rating dropped 0.2 stars this month — opportunity"

### 3. Price comparison (upgraded)
Currently: manual product search.
Upgrade: pre-load price comparisons for your top 10 selling products automatically.
On page load: for each top product from `pos_sales`, search competitor prices via existing search logic.
Cache results for 24 hours in `competitor_price_cache` table.
Show grid: products as rows, competitors as columns, your price highlighted.
Color code: green if you're cheaper, red if you're more expensive.
Alert banner if >3 products where you're >10% more expensive than nearest competitor.

### 4. Opportunity detection AI
New "Opportunities" section on page.
Aria analyses competitor reviews from Google Places API (reviews text field).
For each competitor: fetch 5 most recent 1-2 star reviews → extract complaint themes.
Claude Haiku: "Given these competitor complaints, what messages should [business] use to win these customers?"
Returns: 3 specific competitive advantages to promote.
Show as action cards: "Dan Murphy's customers complain about staff knowledge — train your team and promote 'expert staff' in your marketing"
Log to `aria_ai_calls`.

### 5. Daily competitive brief (Aria AI)
Top of competitors page: "Yesterday's competitive landscape"
Aria-written paragraph (2-3 sentences) summarising:
- Any rating changes across watched competitors
- Any new review spikes (positive or negative)
- Any detected promotions
- Your relative position
Call `/api/aria/competitive-brief?business_id={id}` — build this route.
Uses Claude Haiku + data from yesterday's snapshots.
Cache for 24 hours.
Log to `aria_ai_calls`.

### 6. Alert centre
New "Alerts" tab on competitors page.
Shows chronological list of competitor alerts:
- ⭐ "Dan Murphy's rating dropped to 4.1 (was 4.3) — 3 days ago"
- 📢 "BWS appears to be running a sale — detected in web search — 1 day ago"
- 📈 "Liquorland received 12 new reviews this week (unusual spike) — 5 days ago"
Pull from `aria_competitor_alerts` table.
Mark as read functionality.
"What should I do?" button on each alert → opens Ask Aria pre-loaded with alert context.

### 7. Competitor profile pages
Click on competitor name → expand to full profile card:
- Name, address, distance from your business
- Current rating + review count
- Rating trend (30 day chart)
- Recent reviews (last 3)
- Price level (from Google Places)
- Estimated busy hours (from Google Places popular_times if available)
- Your competitive advantages vs this specific competitor (AI generated)

## DB migrations (run via Supabase MCP FIRST)
```sql
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  competitor_watch_id uuid REFERENCES aria_competitor_watches(id),
  competitor_name text,
  rating numeric,
  review_count integer,
  price_index numeric,
  snapshot_date date DEFAULT CURRENT_DATE,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS competitor_price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  product_name text,
  competitor_name text,
  price numeric,
  cached_at timestamptz DEFAULT now()
);
ALTER TABLE aria_competitor_alerts ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE aria_competitor_alerts ADD COLUMN IF NOT EXISTS alert_type text;
ALTER TABLE aria_competitor_alerts ADD COLUMN IF NOT EXISTS competitor_name text;
```

## Routes to build
- `src/app/api/cron/competitor-monitor/route.ts` — daily monitoring cron
- `src/app/api/aria/competitive-brief/route.ts` — AI daily brief
- `src/app/api/aria/competitor-opportunities/route.ts` — opportunity detection AI
- `src/app/api/aria/competitor-alerts/route.ts` — GET/PATCH alerts

## Page structure (tabs)
**Overview** | **Prices** | **Alerts** | **Manage watches** (existing add/remove)

## Design
- Rating trend charts: recharts LineChart, your line green #7FB897, competitor grey dashed
- Price grid: green cells where you're cheaper, red where more expensive, white = same
- Opportunity cards: dark glass, green left border, Aria avatar icon
- Alert items: timeline with coloured dots by type (red=crisis, amber=change, blue=info)

## Quality bar
Must give a small bottle shop owner more actionable local competitive intelligence than they could get from any other tool. The AI brief + opportunity detection is the key differentiator.

## Execution order
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build competitor-monitor cron
4. Build competitive-brief AI route (log to aria_ai_calls)
5. Build competitor-opportunities AI route (log to aria_ai_calls)
6. Build competitor-alerts CRUD
7. Upgrade `src/app/dashboard/competitors/page.tsx` — additive, keep existing watches UI
8. Add cron to vercel.json
9. `npx tsc --noEmit` — zero TS errors
10. `npm run build` — must pass
11. `git add -A && git commit -m "feat: competitors — SpyFu-level daily monitoring cron, snapshot history, price grid, opportunity detection AI, competitive brief, alert centre" && git push`
