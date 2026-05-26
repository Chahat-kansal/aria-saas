# Prompt 33 — Main Dashboard Pro Upgrades

## Context
`src/app/dashboard/page.tsx` is 46KB but missing key pro features.
The MorningCommandCentre component (`src/components/dashboard/MorningCommandCentre.tsx`) handles the main dashboard widgets.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/page.tsx`
2. Read full: `src/components/dashboard/MorningCommandCentre.tsx`
3. Read full: `src/components/dashboard/BlockRenderer.tsx`
4. Check what APIs are available: `src/app/api/pos/sessions/route.ts`, `src/app/api/pos/staff/route.ts`

## Features to add

### 1. Live revenue ticker
Add a component that polls `/api/pos/sale` every 60 seconds and shows:
- Today's revenue updating live with a subtle green flash animation on new sales
- Transaction count today
- Average ticket size today

### 2. Three-way revenue comparison
Replace single revenue card with:
- Today so far | Same time yesterday | Same day last week
- Up/down arrows with percentage difference
- Pulls from `pos_sales` grouped by day

### 3. Hourly revenue heatmap
A 24-column heatmap (midnight to midnight) showing revenue intensity per hour.
Green intensity scale: `rgba(127,184,151,0.1)` to `rgba(127,184,151,1.0)`.
Based on last 30 days average per hour.
API: query `pos_sales` grouped by `EXTRACT(hour FROM created_at)`.

### 4. Staff on shift right now
Small widget showing who is currently clocked in.
Call `/api/pos/timesheets?status=active&business_id={id}`.
Show staff avatars (initials) + name + hours on shift.
Empty state: "No staff clocked in".

### 5. AI action items strip
Below the metric cards, a horizontal strip of 3 dismissable action cards.
Each card: icon + title + sub + "Do it" button that opens Ask Aria pre-loaded.
Store dismissed IDs in localStorage so they don't reappear.
Pre-populate with: low stock action, revenue action, customer action.
Pull from `aria_actions` table where `status = pending` ordered by priority.

### 6. Weather widget
Small card showing tomorrow's Melbourne forecast + predicted revenue impact.
Use `https://api.open-meteo.com/v1/forecast?latitude=-37.8136&longitude=144.9631&daily=weathercode,precipitation_probability_max&timezone=Australia/Melbourne`
Map weather code to: ☀️ Sunny / 🌧️ Rainy / ⛅ Cloudy.
Show: "Tomorrow: Rainy — expect 15% lower foot traffic based on your history."

## Design rules
Same as existing dashboard. No breaking changes to existing layout.
Add new features BELOW existing content or as replacement of existing weak cards.
All new components in same file unless >100 lines, then create in `src/components/dashboard/`.

## Execution
1. Read all pre-edit files
2. Add features one at a time, verify each compiles
3. `npx tsc --noEmit` — fix ALL errors
4. `npm run build` — must pass
5. `git add -A && git commit -m "feat: dashboard — live ticker, hourly heatmap, staff widget, AI actions, weather" && git push`
