# AUDIT-PROGRESS.md

Schema audit run: 2026-06-06
Auditor: Code Analyzer Agent (Claude Sonnet 4.6)
DB Project: nxfzippunqvqsvkmwtjv (Aria-os)

---

## Summary

| Metric | Value |
|--------|-------|
| Total TS/TSX files in src/ | 1,279 |
| Files with Supabase queries (.from()) | 1,090 |
| API route files | 1,015 |
| Lib files | 264 |
| DB tables in live schema | 428 |
| Tables referenced in source code | 391 |
| Tables NOT in schema (wrong table refs) | 0 (all storage.from() — valid) |
| Files with confirmed bugs | 8 |
| Clean files checked | 1,099 |

---

## Phase 1: Schema Query — COMPLETE

- Queried `information_schema.columns` from live DB
- Retrieved 5,665 column rows across 428 tables
- Schema cached for analysis

## Phase 2: Wrong Table Name Scan — COMPLETE

Method: Regex scan for `.from('tablename')` against live table list.
Result: 0 wrong DB table references found in source code.
All `media` and `reports` hits confirmed to be `storage.from()` calls (valid).

Previously fixed tables (Sprint 257): pos_reviews, loyalty_transactions, invoice_items, pos_integrations, pos_supplier_integrations, pos_inventory (stock-takes), supplier_invoice_items (guarded).

## Phase 3: Critical Column Name Checks — COMPLETE

### src/app/api/ — 1,015 files checked

Priority directories checked:
- `src/app/api/pos/` — 200+ routes. Major finding: `pos_stock_adjustments.adjustment_quantity` bug in `inventory/route.ts`
- `src/app/api/aria/` — 150+ routes. Major findings: timesheets `.gte('date',...)` in agent, .single() risks
- `src/app/api/agents/` — 20 routes. Checked.
- `src/app/api/cron/` — 61 routes. All use SERVICE_ROLE_KEY. All daily schedules. Clean.
- `src/app/api/community/` — Checked. community_live_streams using correct columns.
- `src/app/api/reviews/` — Checked. google_reviews using has_reply correctly.
- `src/app/api/social/` — Checked. storage.from() calls, not DB.
- `src/app/api/admin/` — Checked. Single .single() risk flagged.
- `src/app/api/business-expenses/` — Checked. Using `label` correctly.

### src/lib/ — 264 files checked

- `src/lib/aria/` — 82 files. aria-tools.ts entity map verified clean.
- `src/lib/agents/` — 20 files. inventory-financing-agent.ts has confirmed bug.
- `src/lib/staff/` — Checked. timesheets.ts uses hours_worked correctly.
- `src/lib/aria/ask/business-context.ts` — Verified: pos_sale_items.quantity (valid). Clean.

## Phase 4: Column Context Verification — COMPLETE

Confirmed false positives eliminated:
- `stock_quantity`: EXISTS on `pos_products`, `pos_product_variants`, `pos_outlet_stock`. All 156 file refs confirmed to query these tables, not `pos_outlet_inventory`.
- `retail_price`: EXISTS on `wholesale_order_items`. 7 file refs all point to this table. Clean.
- `review_text`: EXISTS on `business_reviews`. All agent refs use `business_reviews`. Clean.
- `total_minutes`: JavaScript computed value, not DB column.
- `date` (in JS timesheet processing): JS variable, not DB filter — except for 1 confirmed bug.
- `response` on `reviews`: EXISTS as a valid column. CLAUDE.md rule refers specifically to `google_reviews.response` which doesn't exist, but no code queries `google_reviews.response`.

## Phase 5: Cross-Cutting Checks — COMPLETE

- `.single()` usage: 664 total found. 8 elevated-risk instances documented.
- Unawaited DB writes: 2 instances (daily-briefing, receipt-scan).
- Swallowed error catches: 0 found.
- Cross-business data leaks: No public routes found querying business data without auth.
- vercel.json: 9 function configs (OK, limit 22). 52 crons, all daily (OK).
- Cron client type: All service-role (OK).

---

## Directories — Status

| Directory | Files | Status |
|-----------|-------|--------|
| src/app/api/pos/ | ~200 | CHECKED — 2 issues found |
| src/app/api/aria/ | ~150 | CHECKED — 5 issues found |
| src/app/api/agents/ | ~20 | CHECKED — clean |
| src/app/api/cron/ | 61 | CHECKED — clean |
| src/app/api/admin/ | ~15 | CHECKED — 1 issue found |
| src/app/api/community/ | ~20 | CHECKED — clean |
| src/app/api/reviews/ | ~5 | CHECKED — clean |
| src/app/api/social/ | ~10 | CHECKED — clean (storage only) |
| src/app/api/business-expenses/ | 1 | CHECKED — clean |
| src/lib/aria/ | 82 | CHECKED — clean |
| src/lib/agents/ | 20 | CHECKED — 1 issue found |
| src/lib/staff/ | ~5 | CHECKED — clean |
| src/app/dashboard/ | ~50 | SPOT-CHECKED — informational finding only |
