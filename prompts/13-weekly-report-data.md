# Aria OS — Prompt 13: Weekly BI Report — Sprint 1: Data Layer
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm Prompt 19 (Aria Council — src/lib/aria/council.ts) is deployed
green before running this. The weekly report uses the council in Sprint 2.

## STEP 1 — READ BEFORE WRITING
Read the existing cron routes (pick one, match its pattern exactly). Read
supabaseAdmin usage. Read pos_sales, pos_sale_items, pos_shift_reports usage
across the repo — note that pos_sale_items has NO business_id column, always
join through pos_sales. Read the existing email sending pipeline (find the
SendGrid helper used by winback/review-request — reuse it exactly).
Do NOT write code before reading.

## CONTEXT — DB TABLES ALREADY EXIST, do not create/alter tables
pos_sales: id, business_id, session_id, customer_id, subtotal, tax_amount,
discount_amount, total_amount, payment_method, status, created_at, served_by.
pos_sale_items: sale_id, product_id, product_name, quantity, unit_price,
line_total. (NO business_id column — join through pos_sales always.)
pos_shift_reports: id, business_id, cashier_name, shift_start, shift_end,
total_transactions, total_revenue, avg_basket, total_refunds,
total_refund_value, total_voids, opening_float, closing_float, expected_cash,
variance_cents, top_products (jsonb), payment_breakdown (jsonb), status.
pos_products: id, business_id, name, price, category_id, cost_price.
businesses: id, user_id, name, trading_name, industry, city, email,
timezone (default 'Australia/Melbourne').

## STEP 2 — CREATE src/lib/reports/weekly-data.ts
Export: async function gatherWeeklyData(businessId: string, weekStart: Date): Promise<WeeklyReportData>
weekStart = Monday 00:00:00 AEST. weekEnd = Sunday 23:59:59 AEST.
Convert to UTC for all DB queries.

Gather in parallel (Promise.all):
1. REVENUE BY DAY — 7 daily totals Mon-Sun: revenue, transaction count,
   average basket. Filter: status != 'voided'.
2. HOURLY BUCKETS — for each day of week (Mon=0…Sun=6), revenue and
   transaction count per hour (0-23). SQL: group by extract(dow),
   extract(hour) from created_at (UTC, convert to AEST for grouping).
3. TOP PRODUCTS — by revenue (top 10) and by units sold (top 10).
   Join pos_sales → pos_sale_items via sale_id. Include: product name,
   quantity sold, revenue, avg unit price.
4. PAYMENT METHODS — cash/card/other breakdown for the week.
5. REGISTER CLOSURES — all pos_shift_reports for the week: cashier_name,
   shift_start/end, opening_float, closing_float, expected_cash,
   variance_cents, total_voids, total_refunds. Sort by shift_start.
6. SUSPICIOUS TRANSACTIONS — deterministic rules, NOT AI:
   a. VOID_AFTER_HOURS: voided sale outside 07:00–23:00 local time
   b. LARGE_DISCOUNT: discount_amount / subtotal > 0.30
   c. HIGH_VALUE_CASH: payment_method='cash' AND total_amount > 200
   d. NO_CUSTOMER_HIGH_VALUE: customer_id IS NULL AND total_amount > 150
   e. UNUSUAL_HOUR: created_at local hour < 6 or > 23, not voided
   f. REFUND_NO_MATCH: status='refunded' with no matching session sale
   For each flagged sale: id, created_at, total_amount, payment_method,
   served_by, flag_reason, plain-English explanation.
7. PRIOR WEEK — same revenue/transaction total for comparison (% change).
8. COGS ESTIMATE — if pos_products.cost_price is set, compute estimated
   gross margin %. Null if cost_price unavailable for most products.

Return a typed WeeklyReportData object. All amounts as dollars. No cents.

## STEP 3 — CREATE src/lib/reports/weekly-cron.ts
Export: async function runWeeklyReport(businessId: string): Promise<void>
- Load businesses row (name, trading_name, email, timezone, industry).
- Compute weekStart = last Monday 00:00:00 in business timezone.
- Call gatherWeeklyData(businessId, weekStart).
- If total revenue === 0 and no transactions: skip (do not send empty report).
- Otherwise: log "would generate report for [business] — Sprint 2 will complete this"
  and return. (Sprint 2 replaces this placeholder.)

## STEP 4 — CREATE src/app/api/cron/weekly-report/route.ts
Match the existing cron route pattern exactly.
- export const dynamic = 'force-dynamic'; export const maxDuration = 300.
- GET handler. Auth: authorization header === `Bearer ${CRON_SECRET}` else 401.
- Use supabaseAdmin. Load all businesses where onboarding_complete = true
  and email is not null. For each: call runWeeklyReport(id) in try/catch.
  One failure must never stop the others.
- Log [weekly-report] <name>: done / skipped / error per business.
- Return JSON summary.

## STEP 5 — UPDATE vercel.json
Add EXACTLY ONE new cron entry, nothing else:
  { "path": "/api/cron/weekly-report", "schedule": "0 22 * * 0" }
Sunday 22:00 UTC = Monday 08:00 AEST. Do not add/remove any other entry.

## NOTE FOR SPRINT 2 (Prompt 14)
Sprint 2 is where the Aria Council produces the executive summary, promo
recommendations, and action recommendations. The data structure you build
here (WeeklyReportData) is what the council receives. Make sure it is
complete, typed, and all amounts are dollars. Sprint 2 depends on it.

## CONSTRAINTS
- pos_sale_items has NO business_id — always join through pos_sales
- status != 'voided' for all revenue queries
- All amounts as dollars: (Number(x)||0).toFixed(2)
- Do not create or alter DB tables

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(weekly-report): Sprint 1 — data aggregation layer (revenue/day, hourly peak buckets, top products, register closures, 6-rule suspicious detection, prior-week comparison), weekly cron scaffold (0 22 * * 0)
