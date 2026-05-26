# Prompt 40 — Churn & Slow Days Page Pro Upgrade

## Context
`src/app/dashboard/churn/page.tsx` is 14KB. Day of week chart + generate promotion button.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/churn/page.tsx`
2. Read: `src/app/api/aria/slow-day-analysis/route.ts`
3. Read: `src/app/api/aria/generate-promotion/route.ts`
4. Check DB: `pos_customers` columns, `pos_sales` columns

## Features to add

### 1. Churn prediction scores
Customer list showing churn risk with 0-100 score.
Score calculation (client-side or in API):
- Days since last purchase (higher = worse)
- Purchase frequency drop vs their own average
- Spend trend (declining = worse)
Score: 0-30 = Safe (green), 31-60 = At Risk (amber), 61-100 = Churning (red)
Show top 10 highest-risk customers with score bar.

### 2. Cohort retention chart
New section: "Customer Retention by Month"
Bar chart: each bar = a cohort month (Jan, Feb, Mar...)
3 segments per bar: still active at 30d / 60d / 90d
Use recharts StackedBarChart.
Data: group `pos_customers` by `DATE_TRUNC('month', created_at)`, cross-reference `pos_sales` recency.
Call new API endpoint: `/api/aria/cohort-retention?business_id={id}`
Build this endpoint in `src/app/api/aria/cohort-retention/route.ts`

### 3. Slow day playbook (replace simple promotion)
When slow day is detected, instead of just "Generate promotion":
Show a full playbook card:
- **Staff action**: "Reduce to 1 staff member on [slow day]" — estimated saving $X
- **Prep action**: "Order 30% less perishables for [slow day]"
- **Promo action**: AI-generated offer with copy-paste SMS/social text
- **Historical**: "Last [slow day] promotion generated $340 extra revenue" (if tracked)

### 4. Weather correlation
Fetch weather data for last 30 days from Open-Meteo API (free, no key needed):
`https://api.open-meteo.com/v1/forecast?latitude=-37.8136&longitude=144.9631&daily=precipitation_sum&past_days=30&timezone=Australia/Melbourne`
Cross-reference rainy days with revenue from `pos_sales`.
Show: "Rainy days average $X less revenue than sunny days"
Show scatter plot: precipitation vs daily revenue (recharts ScatterChart).

### 5. Promotion history tracking
Store generated promotions in `aria_promotions` table (check if exists, create if not).
Show list of past promotions with: date, offer text, estimated vs actual revenue lift.
"Did it work?" toggle — owner marks if promotion was successful.

## Execution
1. Read all pre-edit files
2. Build cohort-retention API endpoint first
3. Build all page features — no stubs
4. `npx tsc --noEmit` — fix ALL errors
5. `npm run build` — must pass
6. `git add -A && git commit -m "feat: churn — prediction scores, cohort retention, slow day playbook, weather correlation" && git push`
