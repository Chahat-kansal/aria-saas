# Prompt 217 — Cash Flow: "So What" AI Commentary + Supplier Payment Timing + Seasonal Forecast

Read CLAUDE.md first. Read src/app/dashboard/cash-flow/page.tsx IN FULL — it's 417 lines.
Read src/app/dashboard/cash-flow/BankTab.tsx.

## WHAT EXISTS
- Forecast tab: 30/60/90 day horizon, scenario planning (base/optimistic/pessimistic)
- Manual expense entry (rent, wages, utilities, COGS)
- Revenue by day-of-week average calculation
- Bank tab with Basiq connection
- DayForecast[] with cumulative field (this is the runway calculation!)

## TASK 1 — "So what" AI commentary panel
Commit: "feat(cash-flow): Aria cash flow commentary — runway alert, burn rate, plain English insight"

The cumulative field in DayForecast already shows the running cash position. Use it.

After days[] is loaded, compute:
- daily_burn = average net over last 7 past days (negative = burning cash)
- runway_days = if daily_burn < 0: Math.abs(current_balance) / Math.abs(daily_burn) else null
- cash_positive_days = days.filter(d => d.cumulative > 0).length
- lowest_point = min(cumulative) across all forecast days

Display a "Aria's read" card at the top of the forecast tab (above the chart):
- If runway_days < 30: red alert "⚠ At current burn rate, you'll need to top up in {runway_days} days"
- If runway_days 30-90: amber "Your cash position tightens in {runway_days} days — plan ahead"
- If positive all 30 days: green "Cash position is healthy across the next 30 days"
- Always show: "Daily burn rate: ${daily_burn}/day average" and lowest point

POST /api/aria/cash-commentary { business_id, burn_rate, runway_days, lowest_point }
Returns a 2-sentence plain English Aria insight. Model: haiku.
Show in the card with an Aria avatar indicator.

## TASK 2 — Supplier payment timing optimiser
Commit: "feat(cash-flow): supplier payment timing — suggests optimal payment days to protect cash"

New section below the forecast chart: "Supplier payment timing"

Data sources:
- warehouse_purchase_orders WHERE status IN ('sent','partial') — shows outstanding supplier invoices
- pos_suppliers.payment_terms_default (if exists) or assume 30 days
- The forecast chart's cumulative to find cash-positive windows

Logic: for each outstanding PO, find the latest date within the payment terms window where cumulative is still positive → suggest paying on that date rather than immediately.

Display as a table: Supplier | Amount due | Due date | Optimal pay date | Cash impact
"Pay ILG on June 16 (not June 8) — saves $2,400 in cash float for 8 extra days"

If no outstanding POs: show "No pending supplier invoices — connect your suppliers in the reorder module"

## TASK 3 — Seasonal cash flow overlay
Commit: "feat(cash-flow): seasonal overlay — compare current forecast to same period last year"

Query pos_sales for the same date range as the forecast but one year ago.
Compute: same_period_last_year_avg by day-of-week.
Overlay on the chart as a dashed secondary line "Last year".

Below the chart, show a seasonal insight:
- "This time last year, revenue was {X}% [higher/lower]"
- If December: "December typically spikes your revenue +40% but expenses +60% — plan cash accordingly"
- If Jan-Feb: "Post-Christmas dip: January usually runs 25% below your annual average"

This is a simple SQL query — no AI needed for the overlay, just compute from historical data.
Haiku generates 1 sentence of seasonal commentary.

## TASK 4 — Cash flow in daily briefing
Commit: "feat(cash-flow): cash position and runway added to daily briefing context"

In buildAskAriaContext: add
- current estimated cash position (from bank balance if Basiq connected, else estimated from POS revenue)
- runway_days if < 60
- Any overdue supplier payments

Format: "Estimated cash position: ${X}. {runway alert if applicable}. {overdue supplier alert if applicable}"

## RULES
- Read both cash-flow page files fully before editing. One commit per task.
- npx tsc --noEmit + npm run build before every commit.
- UPGRADE-ONLY. Keep forecast chart, scenario planning, bank tab, manual expenses.
- Amounts in dollars. haiku for AI. No new cron entries.
