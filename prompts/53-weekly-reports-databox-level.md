# Prompt 53 — Weekly Reports Pro Upgrade

## Category leader bar
Domo: beautiful executive dashboards, automated distribution, mobile-first.
Databox: KPI scorecards, goal tracking, benchmark vs prior period, automated PDF reports.
Aria Weekly Report already generates PDF via puppeteer (cron). Dashboard page (9KB) just shows a list.
The PAGE needs to be as impressive as the report itself.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/weekly-reports/page.tsx` — full read (9KB)
2. `cat src/app/api/aria/weekly-reports/route.ts` — check what it returns
3. `cat src/lib/reports/weekly-cron.ts` — understand what data the PDF contains
4. Check DB: `weekly_report_records` table columns via Supabase MCP
5. Check: does `weekly_report_records` have `pdf_url`, `email_sent_at`, `narrative` columns?

## Features to build

### 1. Visual report preview in browser
Instead of just "Download PDF" — render the report DATA beautifully in browser too.
Parse the report sections from `weekly_report_records.content` or `narrative`.
Show each section as a styled card:
- Executive summary (Aria narrative)
- Revenue chart (recharts AreaChart — 7 days)
- Top products (horizontal bar chart)
- Customer highlights (new, returning, churned)
- Suspicious transactions (if any)
- AI recommendations (action items)
Full Financial Trust dark theme. Fraunces italic for section headers.

### 2. Report history timeline
Left sidebar: timeline of all reports (newest at top).
Click report → loads that week's data in main panel.
Date range shown: "Week of May 19-25, 2026"
Badge: "📧 Sent" if email was delivered.

### 3. KPI scorecards with period comparison
4 large cards at top of each report:
- Revenue: $X | ↑23% vs prior week
- Transactions: N | ↑5% vs prior week
- Average ticket: $X | → flat
- New customers: N | ↑2 vs prior week
Use `weekly_report_records` data for current + previous week comparison.

### 4. Goal tracking
Owner sets a weekly revenue goal (stored in `businesses.weekly_revenue_target`).
Each report shows: Goal vs Actual progress bar.
"You hit 87% of your $5,000 weekly target"
Trend: last 4 weeks of goal attainment.

### 5. Generate on demand
"Generate report now" button (in addition to scheduled Monday 8am).
Shows loading state while generating.
On complete: shows new report in panel immediately.
Call existing weekly report generation logic.

### 6. Email history
Shows per report: "Sent to owner@email.com at 8:03am Monday"
"Resend" button if owner wants to forward.
Shows email delivery status (sent/failed).

## DB migrations
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS weekly_revenue_target numeric DEFAULT 0;
ALTER TABLE weekly_report_records ADD COLUMN IF NOT EXISTS revenue numeric;
ALTER TABLE weekly_report_records ADD COLUMN IF NOT EXISTS transaction_count integer;
ALTER TABLE weekly_report_records ADD COLUMN IF NOT EXISTS new_customers integer;
ALTER TABLE weekly_report_records ADD COLUMN IF NOT EXISTS avg_ticket numeric;
ALTER TABLE weekly_report_records ADD COLUMN IF NOT EXISTS goal_attainment_pct numeric;
```

## Design
- Newspaper-style layout inside dashboard
- Revenue chart: recharts AreaChart, green fill, Financial Trust palette
- KPI cards: large numbers, Fraunces italic, coloured trend arrows
- Left sidebar: compact timeline list
- Must feel like reading a beautiful business intelligence report, not a wall of text

## Execution
1. Run DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Full upgrade of `src/app/dashboard/weekly-reports/page.tsx`
4. `npx tsc --noEmit` — zero errors
5. `npm run build` — must pass
6. `git add -A && git commit -m "feat: weekly-reports — Databox-level visual preview, KPI scorecards, goal tracking, email history, on-demand generation" && git push`
