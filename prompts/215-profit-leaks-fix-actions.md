# Prompt 215 — Profit Leaks: Fix-It Actions + Week-on-Week Trends + Staff Profitability

Read CLAUDE.md first. Read src/app/dashboard/profit-leaks/page.tsx IN FULL.
Read src/app/api/aria/profit-analysis/ routes before touching anything.

## WHAT EXISTS
- Leak list by category (pricing_gap, waste, labour, lost_sales, churn)
- markFixed() function that calls PATCH /api/aria/profit-analysis
- History line chart
- AI summary text
- Total loss and fixed savings counters

## TASK 1 — "Fix this" one-click actions per leak type
Commit: "feat(profit-leaks): one-click fix actions per leak category"

Each leak card currently has a "Mark as fixed" button. Add a second "Fix this →" button that takes real action:

Leak category → action:
- `pricing_gap`: "Adjust price" → opens an inline price editor modal. Shows current_price from leak.data, suggested_price from leak.recommendation. PATCH /api/pos/products/{product_id} on confirm.
- `dead_stock`: "Markdown 20%" → POST /api/pos/promotions { discount_pct: 20, product_id, reason: "dead_stock_clearance" }. On success, also markFixed(id).
- `waste` / `expiry`: "Set expiry alert" → redirect to /dashboard/warehouse?tab=expiry
- `labour`: "View shift breakdown" → redirect to /dashboard/staff?tab=performance with the date range from leak.data
- `lost_sales` / `stockout`: "Create reorder" → POST /api/pos/purchase-orders with product from leak.data

Each action:
- Loading state on the button while in flight
- Success toast + auto-calls markFixed(id)
- Error shown inline
- Logs to aria_autopilot_actions

## TASK 2 — Week-on-week trend per category
Commit: "feat(profit-leaks): week-on-week trend indicators per leak category"

The history[] array already has weekly data. Compute per-category trends:

For each LEAK_CATEGORIES entry:
- Sum monthly_loss of current active leaks in that category
- Compare to the same sum from the previous history[] entry
- Show a trend badge on the category header row:
  - "↑ 23% vs last week" in red if getting worse
  - "↓ 15% vs last week" in green if improving
  - "→ stable" in amber if < 5% change

Add a trend summary card at the top: "Your biggest leak is getting [worse/better]. Waste is up $340 this week."
Model: haiku generates this one sentence from the trend data.

## TASK 3 — Staff-level profitability breakdown
Commit: "feat(profit-leaks): staff-level profitability — labour cost vs revenue per shift"

New section below the leak list: "Staff profitability by shift"

Data: join pos_timesheets (clock_in, clock_out, pay_rate_cents, staff_member_id) with pos_sales (created_at, total_amount) by time window.

For each shift in the last 14 days:
- Labour cost = (hours_worked) * (pay_rate_cents / 100)
- Revenue during that shift window = SUM(pos_sales.total_amount WHERE created_at BETWEEN clock_in AND clock_out)
- Labour efficiency = revenue / labour_cost (ratio)

Show as a table: Date | Staff member | Hours | Labour cost | Revenue generated | Efficiency ratio | Status
- Ratio > 3.0 = green "Profitable"
- Ratio 1.5–3.0 = amber "Break-even"
- Ratio < 1.5 = red "Loss-making"

Highlight the top 3 most loss-making shifts with "Consider reducing hours or adding a promo to this window."

Create API route: GET /api/aria/staff-profitability?business_id=X&days=14
Queries timesheets + sales, returns the shift rows with computed ratios.
Model: haiku for the narrative summary (1-2 sentences).

## TASK 4 — Feed worst leak into daily briefing
Commit: "feat(profit-leaks): worst active leak feeds into daily briefing context"

In buildAskAriaContext: add the top leak (highest monthly_loss, not yet fixed) as a briefing signal.
Format: "Top profit leak: {leak.title} — costing ${monthly_loss}/month. {fix_suggestion}"

## RULES
- Read every file fully before editing. One commit per task.
- npx tsc --noEmit + npm run build before every commit.
- UPGRADE-ONLY. All amounts in dollars (numeric), not cents.
- Use claude-haiku-4-5-20251001 for AI calls.
