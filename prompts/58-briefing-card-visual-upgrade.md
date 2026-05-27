# Prompt 58 — Dashboard Briefing Card: Add Metric Cards + Charts + Visual Data

## Problem
The AriaBriefingCard on the main dashboard shows excellent AI text analysis but NO visual data.
Owner sees a wall of text. Needs: metric cards, 7-day revenue chart, action items with buttons.
The briefing API returns text only — no structured data attached.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/components/dashboard/AriaBriefingCard.tsx` — full read (17KB)
2. `cat src/app/api/aria/daily-briefing/route.ts` — full read — what does it return?
3. `cat src/app/api/pos/daily-summary/route.ts` — check if exists, what it returns
4. `cat src/app/dashboard/page.tsx` — find where AriaBriefingCard is rendered, what props it gets
5. Check DB: `pos_sales` table — has `total_amount`, `created_at`, `business_id` columns
6. Check DB: `pos_products` table — has `name`, `stock_quantity`, `reorder_point` columns

## What to add — above the existing briefing text, not replacing it

### 1. Real metrics strip (4 cards in a row)
Fetch from `/api/pos/daily-summary?business_id={id}` (build if not exists):
Returns: `{ today_revenue, week_revenue, low_stock_count, top_product }`

Query logic:
- `today_revenue`: SUM of `pos_sales.total_amount` where `created_at >= today 00:00 AEST` and `status != 'voided'`
- `week_revenue`: SUM same but last 7 days
- `low_stock_count`: COUNT of `pos_products` where `stock_quantity <= reorder_point` and `business_id = id`
- `top_product`: most sold product by quantity in last 7 days from `pos_sales` JOIN line items

Show as 4 cards above the briefing text:
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Today       │ │ This Week   │ │ Low Stock   │ │ Top Product │
│ $188        │ │ $1,120      │ │ 3 items     │ │ 19 Crimes   │
│ ↓ vs yest  │ │ ↑ 12%       │ │ ⚠ reorder  │ │ 14 sold     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```
Style: `rgba(255,255,255,0.04)` bg, `1px solid rgba(255,255,255,0.08)` border, `border-radius:12px`, `padding:16px`
Numbers: `font-size:24px, font-weight:700, color:#fff`
Labels: `font-size:11px, color:rgba(255,255,255,0.5), text-transform:uppercase`
Trend: green ↑ if up, red ↓ if down vs prior period

### 2. 7-day revenue sparkline chart
Below the metric cards, a small area chart showing last 7 days revenue.
Use recharts AreaChart (already installed).
Width: 100%, height: 80px — compact, not a full chart.
Green fill: `rgba(127,184,151,0.15)`, stroke: `#7FB897`.
X axis: day names (Mon, Tue, Wed...). No Y axis labels — just the shape.
Data: last 7 days revenue per day from `pos_sales`.
Add to the daily-summary API response: `{ daily_revenue: [{date, revenue}] }` — last 7 days.

### 3. Action items from briefing text
Parse the briefing text for actionable sentences.
Look for sentences containing: "Fix", "Start", "Consider", "Add", "Review", "Reduce", "Increase", "Enable".
Extract up to 3 action items and render as dismissable cards below the text:
```
┌─────────────────────────────────────────────────── [Ask Aria →] [×]┐
│ 💡 Fix the POS customer capture today                               │
└─────────────────────────────────────────────────────────────────────┘
```
"Ask Aria →" button: navigates to `/dashboard/ask-aria?q={encoded action text}`
"×" button: hides the card (localStorage dismiss, resets daily)
Style: `rgba(127,184,151,0.06)` bg, green left border `3px solid #7FB897`

### 4. Build /api/pos/daily-summary route
`src/app/api/pos/daily-summary/route.ts` — GET with `?business_id=`

```ts
export const dynamic = 'force-dynamic'
// Auth check
// Query pos_sales for today + week + last 7 days daily breakdown
// Query pos_products for low stock count  
// Return: { today_revenue, yesterday_revenue, week_revenue, prev_week_revenue, low_stock_count, top_product, daily_revenue: [{date, revenue}] }
// Cache: set Cache-Control: max-age=300 (5 min cache)
```

All amounts in dollars (numeric, not cents) — consistent with rest of codebase.

## Integration into AriaBriefingCard
Add to `AriaBriefingCard.tsx`:
- New state: `const [summary, setSummary] = useState<DailySummary | null>(null)`
- Fetch on mount: `fetch(\`/api/pos/daily-summary?business_id=${businessId}\`)`
- Render order: metrics strip → sparkline → briefing text → action items
- Loading state: grey skeleton boxes for metrics, animate pulse

## Design rules
- Keep ALL existing briefing card functionality — council mode, mood, accents, debate sections — untouched
- Only ADD above and below the existing text
- No new npm packages — recharts already installed
- Mobile responsive: 2×2 grid for metrics on small screens

## Execution order
1. Read ALL pre-edit files
2. Build `src/app/api/pos/daily-summary/route.ts`
3. Add metrics + chart + actions to `AriaBriefingCard.tsx` — additive only
4. `npx tsc --noEmit` — zero errors
5. `npm run build` — must pass
6. `git add -A && git commit -m "feat: briefing card — metric cards, 7-day sparkline, action items extracted from AI text" && git push`
