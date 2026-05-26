# Prompt 44 — Main Dashboard: Real-Time Pro Upgrade

## Why this exists
The main dashboard has no real-time data — it loads once and goes stale. Shopify's live view, Square Dashboard, and every modern SaaS updates live. Aria must too.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/page.tsx` — full read (46KB)
2. `cat src/lib/supabase-client.ts` OR `src/lib/supabase.ts` — check client-side Supabase setup
3. `cat src/components/providers/BusinessProvider.tsx` — check business context
4. Check if `@supabase/supabase-js` realtime is already used anywhere: `grep -r "supabase.channel" src/`
5. Check: `src/app/api/pos/daily-summary/route.ts` — what does it return?
6. `cat src/app/api/pos/sessions/route.ts` — session data shape

## What to build

### 1. Supabase Realtime for live sales
Replace polling with Supabase Realtime subscription on `pos_sales` table.
When a new sale is inserted → dashboard updates instantly, no page refresh needed.
Implementation:
```ts
const channel = supabase
  .channel(`sales-${businessId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'pos_sales',
    filter: `business_id=eq.${businessId}`
  }, (payload) => {
    // Update today revenue, transaction count, top product
    setTodayRevenue(prev => prev + payload.new.total_amount)
    setTransactionCount(prev => prev + 1)
  })
  .subscribe()
// Cleanup: return () => supabase.removeChannel(channel)
```
Show live indicator: green pulsing dot + "Live" next to revenue figure.
Flash animation when new sale comes in: revenue number briefly highlights green.

### 2. Three-way revenue comparison widget
Replace single revenue stat card with:
```
Today so far:  $1,240  ↑ 23% vs yesterday
Yesterday:     $1,008
Last week same day: $1,180  ↑ 5%
```
Pull from `pos_sales` filtered by:
- Today: `created_at >= today 00:00 AEST`
- Yesterday: same window yesterday
- Last week same day: 7 days ago same window
Single API call: `GET /api/pos/revenue-comparison?business_id={id}` — build this route.

### 3. Hourly revenue heatmap
24-column horizontal heatmap below the metric cards.
Each column = 1 hour (12am to 11pm).
Color intensity = revenue in that hour (last 30 days average).
Lowest: `rgba(127,184,151,0.08)`, Highest: `rgba(127,184,151,1.0)`
Labels: 6am, 9am, 12pm, 3pm, 6pm, 9pm
Tooltip on hover: "3pm-4pm: avg $340/hr"
Query: `pos_sales` grouped by `EXTRACT(hour FROM created_at AT TIME ZONE 'Australia/Melbourne')`, last 30 days.
API: `GET /api/pos/hourly-heatmap?business_id={id}` — build this route.

### 4. Staff on shift live widget
Small card below heatmap.
Fetches `/api/pos/timesheets?status=active&business_id={id}` on load + every 5 minutes.
Shows staff circles with initials + names.
"3 staff on shift" or "No staff clocked in".
Also subscribe to Supabase Realtime on `pos_timesheets` for clock-in/out events.

### 5. AI action items strip
3 dismissable action cards below staff widget.
Pull from `aria_actions` table: `SELECT * FROM aria_actions WHERE business_id={id} AND status='pending' ORDER BY priority DESC LIMIT 3`
Each card:
- Icon (⚠️ 📦 👥 based on type)
- Title + description
- "Fix with Aria →" button → navigates to `/dashboard/ask-aria?q={encoded action title}`
- "Dismiss" (×) button → `PATCH /api/aria/actions/{id}` sets status=dismissed
Store dismissed in DB not localStorage (so it persists across sessions).
If no actions: show "✓ All clear — Aria has no urgent actions for you today"

### 6. Tomorrow's weather + revenue prediction
Small card bottom right.
Fetch from Open-Meteo (free, no API key):
`https://api.open-meteo.com/v1/forecast?latitude=-37.8136&longitude=144.9631&daily=weathercode,precipitation_probability_max,temperature_2m_max&timezone=Australia/Melbourne&forecast_days=2`
Show: weather icon + temp + "Expected revenue: $X-Y"
Revenue prediction: based on tomorrow's day of week average from `pos_sales` × weather adjustment:
- Rain (precipitation >50%): -15%
- Clear: baseline
- Very hot (>35°C): -10%
Store business lat/lng from `businesses` table (already geocoded at onboarding).

## Routes to build
- `src/app/api/pos/revenue-comparison/route.ts` — GET, returns today/yesterday/lastweek
- `src/app/api/pos/hourly-heatmap/route.ts` — GET, returns 24 hourly averages
- `src/app/api/aria/actions/[id]/route.ts` — PATCH to dismiss action

## Design
- Live green pulsing dot: `width:8px, height:8px, borderRadius:50%, background:#7FB897, animation: pulse 2s infinite`
- Flash animation on new sale: `@keyframes flash { 0%,100% { color:#fff } 50% { color:#7FB897 } }`
- All new components in same file unless >80 lines
- No new npm packages — use only recharts (already installed) and native fetch

## Execution order
1. Read ALL pre-edit files
2. Build `revenue-comparison` route
3. Build `hourly-heatmap` route  
4. Build `aria/actions/[id]` route
5. Add Realtime subscription to dashboard page
6. Add all 6 features to `src/app/dashboard/page.tsx`
7. `npx tsc --noEmit` — fix ALL TS errors, zero tolerance
8. `npm run build` — must pass clean
9. `git add -A && git commit -m "feat: dashboard — Supabase Realtime live sales, revenue comparison, hourly heatmap, staff live, AI actions, weather prediction" && git push`
