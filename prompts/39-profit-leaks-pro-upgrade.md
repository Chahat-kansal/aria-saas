# Prompt 39 — Profit Leaks Page Pro Upgrade

## Context
`src/app/dashboard/profit-leaks/page.tsx` is 10KB. Just a "Run analysis" button and list.
Must auto-run and show historical tracking.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/profit-leaks/page.tsx`
2. Read: `src/app/api/aria/profit-analysis/route.ts`
3. Check DB: is there a `profit_leaks` or `aria_profit_leaks` table? Check information_schema.

## Features to add

### 1. Auto-run on page load
Remove the manual "Run analysis" button as primary action.
On page load, fetch latest analysis from DB (if run in last 24hrs, show cached).
If older than 24hrs, auto-trigger analysis silently.
Show "Last updated: 2 hours ago" timestamp.
Keep manual "Refresh" button as secondary action.

### 2. Leak categories with colour coding
Group leaks into categories with icons and colours:
- 🔴 Pricing gaps — products priced below market
- 🟠 Waste & shrinkage — stock variance, dead stock
- 🟡 Labour inefficiency — overstaffed slow periods
- 🔵 Lost sales — out of stock on high-demand items
- 🟣 Customer churn cost — revenue lost from churned customers

Each category shows: count of leaks, total $ impact, colour-coded badge.

### 3. Historical leak tracking
Store each analysis run in `profit_leak_history` table:
```sql
CREATE TABLE IF NOT EXISTS profit_leak_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  run_at timestamptz DEFAULT now(),
  total_leak_cents bigint,
  leaks jsonb,
  fixed_count integer DEFAULT 0
);
```
Show a line chart of total leak amount over last 30 days (recharts LineChart).
"Your leaks are trending down 12% this month" — green if improving.

### 4. Fix rate tracking
Each leak item gets a "Mark as fixed" button.
When marked fixed: update `profit_leak_history` fixed_count + 1.
Show at top: "You've fixed 3 of 7 leaks — saving an estimated $890/month"
Calculate savings: sum of fixed leak amounts.

### 5. One-click Ask Aria
Each leak card has "Fix this with Aria →" button.
On click: navigate to `/dashboard/ask-aria?q=How+do+I+fix+[leak title]`
Pre-loads Ask Aria with the specific leak context.

## Execution
1. Run DB migration via Supabase MCP
2. Read all pre-edit files
3. Build all features — no stubs
4. `npx tsc --noEmit` — fix ALL errors
5. `npm run build` — must pass
6. `git add -A && git commit -m "feat: profit-leaks — auto-run, categories, historical tracking, fix rate, Ask Aria" && git push`
