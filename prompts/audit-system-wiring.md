# System Wiring Audit — DB ↔ API ↔ Page Connectivity Check

## Goal
Produce ONE report file: `WIRING_AUDIT.md` in the repo root.
Do NOT fix anything. Do NOT change any code. ONLY inspect and report.
This is a read-only audit. The output is a markdown report, nothing else.

## Token discipline
This audit must be efficient. Do NOT read entire large files.
Use `grep` and targeted searches, not full file reads.
Do NOT load the 266KB terminal file fully — grep it.

## What to check — for each dashboard page

For every page in `src/app/dashboard/*/page.tsx`, verify the chain:

**PAGE → API → DB**

1. Does the page fetch from an API route? (grep for `fetch(` in the page)
2. Does that API route exist in `src/app/api/`?
3. Does the API route query a real Supabase table?
4. Does that table exist? (cross-check against this list of known tables)

## Known DB tables (from Supabase — do not re-query, use this list)
pos_sales, pos_sale_items, pos_products, pos_customers, pos_cash_sessions,
pos_outlets, pos_modifiers, pos_kds_orders, pos_purchase_orders, pos_returns,
pos_tables, pos_registers, pos_product_variants, pos_timesheets, pos_promotions,
pos_loyalty_transactions, pos_shift_reports, pos_stocktakes, pos_waste_log,
pos_gift_cards, pos_laybys, pos_parcel_tracking, pos_store_credits,
businesses, aria_ai_calls, aria_actions, aria_conversations, aria_competitor_watches,
aria_competitor_alerts, aria_business_memory, aria_autopilot_actions, aria_hypotheses,
daily_briefings, weekly_report_records, social_posts, social_connections,
seo_audits, seo_pages, seo_issues, seo_keywords, customers, invoices, recipes,
recipe_ingredients, bookings, quotes, support_tickets

## Report format — produce exactly this structure

```markdown
# Aria OS — System Wiring Audit
Generated: [date]

## Summary
- Total dashboard pages checked: N
- Fully wired (page → API → DB): N
- Broken wiring: N
- Pages with no API connection: N

## ✅ Fully Wired Pages
[list each page that has working page → API → DB chain]

## ⚠️ Partial Wiring
[pages where API exists but queries a missing table, or page fetches a missing API]
[for each: state exactly what's broken]

## ❌ Broken / Disconnected
[pages with no API connection, or API routes that reference non-existent tables]
[for each: state exactly what's missing]

## API Routes With No DB Table
[any /api route that queries a table not in the known list]

## Orphaned API Routes
[API routes that no page or cron calls]

## Cron Jobs Status
[for each cron in vercel.json: does the route file exist? does it query real tables?]

## Recommendations
[numbered list of the most critical wiring fixes needed before launch]
```

## Execution
1. List all pages: `ls src/app/dashboard/*/page.tsx`
2. For each page: grep for `fetch(` to find API calls
3. For each API found: verify the route file exists
4. For each API route: grep for `.from(` to find table names
5. Cross-check table names against the known list above
6. Check vercel.json crons against route files
7. Write the complete report to `WIRING_AUDIT.md` in repo root
8. Commit: `git add WIRING_AUDIT.md && git commit -m "audit: system wiring report — DB/API/page connectivity" && git push`

## Critical rules
- READ ONLY — change nothing except creating WIRING_AUDIT.md
- Use grep, not full file reads — be token-efficient
- Do not run npx tsc, do not build — this is inspection only
- The single deliverable is WIRING_AUDIT.md
