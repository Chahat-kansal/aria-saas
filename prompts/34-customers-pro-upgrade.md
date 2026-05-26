# Prompt 34 — Customers Page Pro Upgrade

## Context
`src/app/dashboard/customers/page.tsx` is 20KB. Has CSV import and basic list.
Must beat Klaviyo and HubSpot for small business customer intelligence.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/customers/page.tsx`
2. Read: `src/lib/customer-segments.ts`
3. Check DB columns: `pos_customers` table — what fields exist
4. Read: `src/app/api/pos/customers/route.ts`

## Features to add

### 1. RFM Segment tabs (replace or augment existing list)
Add 6 segment filter tabs at top:
`All | Champions | Loyal | At Risk | Lost | New`
Each tab shows count badge.
Champions = high recency + frequency + monetary
At Risk = good history but not seen in 45+ days
Lost = not seen in 90+ days
Filter the customer list when tab clicked.
Use existing `customer_segment` column if populated, otherwise calculate client-side.

### 2. Customer lifetime value column
Add "LTV" column to customer table.
Calculate: total spend from `pos_sales` where `customer_id` matches.
Show formatted as `$1,240` with trend arrow vs last 90 days.

### 3. AI customer summary on row click
When customer row clicked, open a side panel (not new page).
Side panel shows:
- Name, email, phone, loyalty points
- Purchase history timeline (last 10 purchases)
- AI summary: call `/api/aria/customer-intel?customer_id={id}` 
- "Send winback message" button if lapsed
- Total spend, visit frequency, favourite product

### 4. Cohort retention chart
New section below customer list.
Bar chart showing: customers acquired each month, % still active after 30/60/90 days.
Use recharts BarChart.
Data: group `pos_customers` by `created_at` month, cross-reference with `pos_sales` recency.

### 5. One-click bulk actions
Checkbox column on customer list.
Select multiple → bulk action bar appears at bottom:
"Send SMS" | "Export CSV" | "Tag segment" | "Mark lapsed"

## Design rules
- Keep existing CSV import functionality — do not remove
- Same dark theme as rest of dashboard
- Side panel slides in from right with `position: fixed, right: 0`
- All charts use recharts (already installed)

## Execution
1. Read all pre-edit files
2. Add features — no stubs
3. `npx tsc --noEmit` — fix ALL errors  
4. `npm run build` — must pass
5. `git add src/app/dashboard/customers/page.tsx && git commit -m "feat: customers — RFM segments, LTV, AI side panel, cohort chart, bulk actions" && git push`
