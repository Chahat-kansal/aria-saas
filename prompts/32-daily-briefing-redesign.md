# Prompt 32 — Daily Briefing Full Redesign

## Context
`src/app/dashboard/daily-briefing/page.tsx` is currently 4KB — a basic text dump.
This is the first thing owners see every morning. It must be the most impressive page in the app.
The briefing data comes from `daily_briefings` table with columns: `id, business_id, date, content, recommendations, generated_at, dismissed_at, mode, data_snapshot, remind_at`.

## Pre-edit checklist (MANDATORY)
1. Read full current file: `src/app/dashboard/daily-briefing/page.tsx`
2. Read `src/components/providers/BusinessProvider.tsx` for business context hook
3. Read `src/app/api/aria/daily-briefing/route.ts` for API shape
4. Check DB: `data_snapshot` and `content` column types in `daily_briefings`

## What to build
Complete rewrite of `src/app/dashboard/daily-briefing/page.tsx`.

### Layout (top to bottom)
1. **Header bar** — "Good morning, [owner name]" with date. Aria OS green accent. "Refresh" button top right.
2. **AI Executive Summary card** — dark card, Aria avatar icon, 3 bullet points parsed from `content`. Forest green left border.
3. **4 metric cards row** — Yesterday revenue | Week revenue | Top product | Busiest hour. Pull from `data_snapshot` if available, otherwise from `/api/aria/daily-briefing`.
4. **Revenue vs target progress bar** — horizontal bar, green fill, shows % of weekly target hit. Target = average of last 4 weeks.
5. **Yesterday highlights section** — 3 cards: Top product sold, Peak hour, Best customer (if tracked).
6. **Today's predictions section** — Expected revenue (from sales pattern), Weather impact note, Staff recommendation.
7. **Action items** — parse `recommendations` array, show as dismissable cards with "Ask Aria" button that opens ask-aria pre-loaded with context.
8. **Briefing history sidebar** — last 7 briefings as clickable list on the right. Click to view past briefing.

### Design rules
- Dark background `#0d0d14` matching rest of dashboard
- Financial Trust palette: `#7FB897` green accents, `#2D5240` dark green
- Fraunces italic for briefing title/date
- Inter for body
- Cards with `rgba(255,255,255,0.04)` background, `1px solid rgba(255,255,255,0.08)` border, `border-radius: 16px`
- No plain text dumps — everything in structured cards
- Loading skeleton states for every data point
- Mobile responsive

### Data fetching
```ts
// Fetch latest briefing
GET /api/aria/daily-briefing?business_id={id}
// Returns: { briefing: { id, date, content, recommendations, data_snapshot, generated_at } }
```

Parse `content` as plain text, split by newline for bullets.
Parse `recommendations` as JSON array if available.
Pull `data_snapshot` for metric cards — it contains sales/revenue/product data.

## Quality bar
Must match or beat: Morning Brew newsletter UI, Notion AI summary, Linear project overview.
Every section must show real data or a meaningful empty state — never raw JSON.

## Execution
1. Read all files in pre-edit checklist
2. Write complete new page (no stubs, no TODOs)
3. `npx tsc --noEmit` — fix ALL errors
4. `npm run build` — must pass
5. `git add src/app/dashboard/daily-briefing/page.tsx && git commit -m "feat: daily briefing full redesign — executive summary, metrics, predictions, action items" && git push`
