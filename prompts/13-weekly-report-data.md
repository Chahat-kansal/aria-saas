# Aria OS — Prompt 13: Weekly BI Report — Data Layer + Suspicious Transaction Detection
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read the existing cron routes (pick one to match its pattern exactly). Read
supabaseAdmin usage. Read pos_sales, pos_sale_items, pos_shift_reports table
usage across the repo. Read how the existing email sending pipeline works
(the winback / review-request features use SendGrid — find and reuse that
exact pattern). Do NOT write code before reading.

## CONTEXT — DB TABLES ALREADY EXIST, do not create/alter tables
pos_sales: id, business_id, session_id, customer_id, subtotal, tax_amount,
discount_amount, total_amount, payment_method, status, created_at, served_by.
pos_sale_items: sale_id, product_id, product_name, quantity, unit_price,
line_total (join via sale_id — do NOT filter by business_id on this table,
join through pos_sales instead).
pos_shift_reports: id, business_id, cashier_name, shift_start, shift_end,
total_transactions, total_revenue, avg_basket, total_refunds, total_refund_value,
total_voids, opening_float, closing_float, expected_cash, variance_cents,
top_products (jsonb), payment_breakdown (jsonb), status, created_at.
pos_products: id, business_id, name, price, category_id, cost_price.
businesses: id, user_id, name, trading_name, industry, city, email (owner
email to send the report to), timezone (default 'Australia/Melbourne').

## STEP 2 — CREATE src/lib/reports/weekly-data.ts
Export async function gatherWeeklyData(businessId: string, weekStart: Date):
Promise<WeeklyReportData>. weekStart is always the Monday 00:00:00 AEST.
weekEnd is Sunday 23:59:59 AEST. Convert to UTC for all DB queries.

Gather in parallel (Promise.all):
1. REVENUE BY DAY — 7 daily revenue totals Mon-Sun, transaction count per
   day, average basket per day. Use pos_sales status != 'voided'.
2. HOURLY BUCKETS — for each day of week (Mon=0…Sun=6), revenue and
   transaction count per hour (0-23). This powers the peak time heatmap.
   Group by: extract(dow), extract(hour) from created_at.
3. TOP PRODUCTS — by revenue (top 10) and by volume/units sold (top 10).
   Join pos_sales → pos_sale_items. Include product name, quantity sold,
   revenue, avg unit price.
4. PAYMENT METHODS — breakdown of cash/card/other for the week.
5. REGISTER CLOSURES — all pos_shift_reports rows for the week. Include
   cashier_name, shift_start/end, opening_float, closing_float,
   expected_cash, variance_cents, total_voids, total_refunds. Sort by
   shift_start.
6. SUSPICIOUS TRANSACTIONS — deterministic rules, NOT AI. Flag any sale that
   matches one or more of:
   a. VOID_AFTER_HOURS: voided sale (status='voided') created outside
      business hours (before 07:00 or after 23:00 local time).
   b. LARGE_DISCOUNT: discount_amount > 0 AND discount_amount / subtotal
      > 0.30 (discount exceeds 30% of subtotal).
   c. HIGH_VALUE_CASH: payment_method='cash' AND total_amount > 200.
   d. NO_CUSTOMER_HIGH_VALUE: customer_id IS NULL AND total_amount > 150.
   e. UNUSUAL_HOUR: created_at local hour < 6 or > 23 (sale outside normal
      trading hours, not voided — potentially forgot to close).
   f. REFUND_NO_MATCH: status='refunded' and no matching original sale_id
      in the session.
   For each flagged sale: include the sale id, created_at, total_amount,
   payment_method, served_by, the flag reason, and a short plain-English
   explanation of why it was flagged.
7. PRIOR WEEK COMPARISON — same revenue/transaction total for the prior
   week (Mon-Sun) for % change calculation.
8. PRODUCT COST ESTIMATE — if pos_products.cost_price is set, compute
   estimated COGS and gross margin % for the week. Null if cost_price
   unavailable for most products.

Return a typed WeeklyReportData object containing all 8 sections.
All amounts as dollars (numeric). No cents multiplication.

## STEP 3 — CREATE src/lib/reports/weekly-cron.ts
Export async function runWeeklyReport(businessId: string): Promise<void>.
- Load the businesses row (name, trading_name, email, timezone, industry).
- Compute weekStart = last Monday 00:00:00 in the business timezone.
- Call gatherWeeklyData(businessId, weekStart).
- If no sales data exists for the week (total revenue = 0, no transactions),
  skip — do not send an empty report.
- Otherwise: pass the data to the AI generation route (Sprint 2 will build
  it — for now, just log "would generate report for [business]" and return).
This function is called by the cron in STEP 4.

## STEP 4 — CREATE src/app/api/cron/weekly-report/route.ts
Match the existing cron route pattern exactly.
- export const dynamic = 'force-dynamic'; export const maxDuration = 300.
- GET handler. Auth: header authorization === Bearer ${CRON_SECRET} else 401.
- Use supabaseAdmin. Load all businesses where onboarding_complete = true
  and email is not null. For each, call runWeeklyReport(business.id) wrapped
  in try/catch — one failure must not stop the others.
- Log [weekly-report] <business name>: done / skipped / error for each.
- Return JSON summary.

## STEP 5 — UPDATE vercel.json
Add EXACTLY ONE new cron entry:
  { "path": "/api/cron/weekly-report", "schedule": "0 22 * * 0" }
This fires Sunday 22:00 UTC = Monday 08:00 AEST. Daily or less frequent
schedule only. Do not touch any other cron or function.

## CONSTRAINTS
- No backtick template literals inside className={...} or style={{}}
- All amounts as dollars: (Number(x)||0).toFixed(2)
- pos_sale_items has NO business_id column — always join through pos_sales
- status filter: status != 'voided' for revenue queries
- Do not create or alter any DB tables

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(weekly-report): Sprint 1 — weekly data aggregation layer, suspicious transaction detection (6 rule types), register closure summary, peak time heatmap data, weekly cron scaffold (0 22 * * 0 = Monday 8am AEST)
