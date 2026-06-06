# AUDIT-LOG.md

Schema audit of `src/` against live Supabase DB (project `nxfzippunqvqsvkmwtjv`).
Audit date: 2026-06-06. Total source files scanned: 1,279 (TS/TSX). DB tables: 428. Referenced tables: 391.

---

## LEGEND

- `(already-fixed-257)` = confirmed fixed in Sprint 257 commits 7bc0e52e / 19e02792 / 1b6eaa3b
- `(needs-sprint-258)` = new confirmed breakage found in this audit
- CRITICAL = query will return empty or error silently / crashes at runtime
- HIGH = wrong column name causes query to silently return nothing or write to wrong field
- MEDIUM = risks 0-row crash or logic error in some code paths
- LOW = style/best-practice issue

---

## CRITICAL — Wrong table name (table does not exist in DB)

All previously identified wrong-table bugs have been fixed in Sprint 257. Zero new wrong-table references found in this audit.

The following were confirmed as already fixed `(already-fixed-257)`:
- `pos_reviews` → `reviews` (4 files)
- `loyalty_transactions` → `pos_loyalty_transactions`
- `invoice_items` → `invoice_line_items`
- `pos_supplier_integrations` → `pos_oauth_integrations`
- `pos_integrations` → `pos_oauth_integrations`
- `pos_inventory` → `pos_outlet_inventory` (stock-takes)
- `supplier_invoice_items` — guarded in `src/lib/agents/supplier-negotiation-agent.ts:54` with `console.warn` and graceful skip `(already-fixed-257)`

---

## HIGH — Wrong column name on a real table (needs-sprint-258)

### [SEVERITY: HIGH] src/lib/agents/inventory-financing-agent.ts:393 (needs-sprint-258)
Issue: `.gte('date', ...)` on `pos_timesheets` — column `date` does not exist on this table.
Schema: `pos_timesheets` has `clock_in` (timestamp), `clock_out` (timestamp). No `date` column.
Fix: Change `.gte('date', cutoff.toISOString().slice(0, 10))` to `.gte('clock_in', cutoff.toISOString())`

### [SEVERITY: HIGH] src/app/api/pos/inventory/route.ts:75 (needs-sprint-258)
Issue: `adjustment_quantity: adjustment` in `pos_stock_adjustments` insert — column is `adjustment_qty` not `adjustment_quantity`.
Schema: `pos_stock_adjustments` columns: `adjusted_by, adjustment_qty, business_id, created_at, id, outlet_id, product_id, reason`.
Fix: Change `adjustment_quantity: adjustment` to `adjustment_qty: adjustment`.
Note: The insert is wrapped in try/catch so this fails silently — audit log entries are never written.

### [SEVERITY: HIGH] src/app/api/agents/reputation/route.ts:25 (needs-sprint-258)
Issue: `.select('id,platform,reviewer_name,rating,review_text,...')` on `business_reviews` table — `review_text` is the correct column name on `business_reviews`. This is NOT a bug.
**CORRECTION: `business_reviews.review_text` EXISTS in the live schema. This is clean.**

### [SEVERITY: HIGH] src/lib/agents/reputation-defence-agent.ts:84,87,135,149 (needs-sprint-258)
Issue: `.select('id,rating,review_text')` and `.not('review_text', 'is', null)` on `business_reviews` — `review_text` EXISTS on `business_reviews`. Clean.
**CORRECTION: These are all querying `business_reviews` which has `review_text`. Not a bug.**

---

## HIGH — Wrong column: `pos_outlet_inventory.quantity` (needs-sprint-258)

The column on `pos_outlet_inventory` is `items_on_hand`. The column `quantity` does not exist on this table.

### [SEVERITY: HIGH] src/lib/aria/ask/business-context.ts:101 (needs-sprint-258)
Issue: `.select('product_name, line_total, quantity, pos_sales!inner(...)')` — this is querying `pos_sale_items`, not `pos_outlet_inventory`. `pos_sale_items.quantity` EXISTS. **Clean.**

The following were the only confirmed genuine `pos_outlet_inventory.quantity` misuses in DB query context:

(All other `stock_quantity` references in the codebase are on `pos_products`, `pos_product_variants`, or `pos_outlet_stock` where `stock_quantity` IS a valid column.)

**No remaining unguarded `pos_outlet_inventory.quantity` bugs found.**

---

## HIGH — `pos_timesheets.total_minutes` (computed, not stored)

### [SEVERITY: HIGH] src/app/api/pos/timesheets/route.ts:43-47 — INFORMATIONAL
`total_minutes` is computed in JavaScript from `clock_in`/`clock_out` and returned to the client. It is NOT stored in the DB. Code is correct — no fix needed. The column does not exist in DB but it's never written there.

### [SEVERITY: HIGH] src/app/dashboard/staff/page.tsx:21,73,132-133,430 — INFORMATIONAL
References `total_minutes` as a client-side computed property from the API response. Not a DB column issue.

### [SEVERITY: HIGH] src/app/pos/timesheets/page.tsx:11,81-82,92,194 — INFORMATIONAL
Same pattern — computed client-side field, not a DB column reference.

---

## HIGH — `reviews.review_text` (wrong column on `reviews` table) (needs-sprint-258)

The `reviews` table uses `content` and `text` columns. `review_text` does not exist on `reviews`.
The `business_reviews` table uses `review_text` (correct).

### [SEVERITY: HIGH] src/app/dashboard/agents/page.tsx:319,2064 (needs-sprint-258)
Issue: UI state type declares `review_text: string` but data comes from API that fetches `business_reviews`. If this is ever wired to the `reviews` table instead, `review_text` would be undefined. Currently a type mismatch risk only since the backing API (agents/reputation) uses `business_reviews.review_text` which is valid.
Fix: Document that `review_text` is only valid on `business_reviews`, use `content ?? text` if ever querying `reviews`.

---

## HIGH — `pos_stock_adjustments.adjustment_quantity` vs `adjustment_qty` (needs-sprint-258)

Already detailed above. Single confirmed instance:

| File | Line | Issue |
|------|------|-------|
| `src/app/api/pos/inventory/route.ts` | 75 | `adjustment_quantity` should be `adjustment_qty` |

---

## MEDIUM — `.single()` on queries that may return 0 rows

664 total `.single()` usages found. The majority are acceptable patterns (insert+select, or business lookup with guaranteed ownership check). The following are elevated risk:

### [SEVERITY: MEDIUM] src/app/api/aria/generate-quote/route.ts:43
Issue: `.from('businesses').select('*').eq('id', bid).eq('user_id', user.id).single()` — if `bid` doesn't match `user_id` this crashes with PGRST116.
Fix: Change to `.maybeSingle()` and guard `if (!biz)`.

### [SEVERITY: MEDIUM] src/app/api/aria/briefing/route.ts:117
Issue: Fetching a briefing by date `.single()` — if no briefing exists for today yet, crashes.
Fix: Use `.maybeSingle()`.

### [SEVERITY: MEDIUM] src/app/api/aria/pos-end-of-day/route.ts:44,53
Issue: Two `.single()` calls on business/outlet lookup where data may not exist.
Fix: Use `.maybeSingle()`.

### [SEVERITY: MEDIUM] src/app/api/admin/businesses/route.ts:66
Issue: `update().select().single()` — if the `id` doesn't match any row, crashes.
Fix: Use `.maybeSingle()`.

### [SEVERITY: MEDIUM] src/app/api/aria/autopilot/route.ts:51,146
Issue: `businesses` lookup `.single()` and `aria_autopilot_actions` update `.single()`.
Fix: Both should be `.maybeSingle()`.

Total `.single()` risk count across all API routes: 385 filtered-query patterns. Not all are bugs (many are safe insert+select patterns), but any that rely on a `.eq()` filter without guaranteed data existence should be `.maybeSingle()`.

---

## MEDIUM — Unawaited DB Writes

### [SEVERITY: MEDIUM] src/app/api/aria/daily-briefing/route.ts:646
Issue: `void supabase.from('businesses').update(...)` — fire-and-forget update to `requires_briefing_refresh`. If it fails, the flag stays true, causing unnecessary re-generation. Non-critical but should be awaited or error-logged.

### [SEVERITY: MEDIUM] src/app/api/aria/receipt-scan/confirm/route.ts:77
Issue: `supabase.from('activity_log').insert(...)` without `await` or `void` explicit cast. Audit log entry may silently fail.
Fix: Add `await` or explicitly mark `void`.

---

## MEDIUM — Cron Routes Not Using supabaseAdmin (Investigation Result: FALSE POSITIVE)

The following cron routes were initially flagged but investigation confirmed they create their own service-role clients via `createClient(URL, SUPABASE_SERVICE_ROLE_KEY)`:
- `src/app/api/cron/aria-brain/route.ts` — uses SERVICE_ROLE_KEY. Clean.
- `src/app/api/cron/leave-accrual/route.ts` — uses SERVICE_ROLE_KEY. Clean.
- `src/app/api/cron/reviews-weekly-digest/route.ts` — uses SERVICE_ROLE_KEY. Clean.
- `src/app/api/cron/sync-reviews/route.ts` — uses SERVICE_ROLE_KEY. Clean.

---

## LOW — Schema Note: staff_members.name

CLAUDE.md states "staff_members: first_name + last_name (NO name)" — however, `staff_members.name` EXISTS in the live schema (nullable text). The rule should be interpreted as: `name` is nullable/denormalized; `first_name` (NOT NULL) and `last_name` (NOT NULL) are the source of truth. Existing code that reads `staff_members.name` is not broken but may get empty strings.

---

## LOW — `pos_timesheets.date` filter (one confirmed instance)

### [SEVERITY: HIGH] src/lib/agents/inventory-financing-agent.ts:393 (needs-sprint-258)
Already documented above. This is the only confirmed DB filter on `pos_timesheets.date`.

---

## LOW — vercel.json Compliance

- Function configs: 9 (limit: 22). OK.
- Cron schedules: 52 crons, all daily (`0 H * * *` or `0 H * * D`). `parcel-insights` was previously `0 */6 * * *` (sub-daily) but is now `0 6 * * *`. Fixed.

---

## INFORMATIONAL — `stock_quantity` not a bug on most tables

The column `stock_quantity` exists on:
- `pos_products` (real stock column)
- `pos_product_variants` (variant stock)
- `pos_outlet_stock` (per-outlet stock snapshot)

It does NOT exist on `pos_outlet_inventory` (which uses `items_on_hand`).

Analysis of 156 files referencing `stock_quantity`: all confirmed to be querying `pos_products` or `pos_product_variants`, not `pos_outlet_inventory`. No genuine misuse found beyond the single guarded `pos_outlet_inventory` path which uses `items_on_hand` correctly.

---

## INFORMATIONAL — `reviews.response` vs `has_reply`

CLAUDE.md states `google_reviews.has_reply (NOT reviews.response)`.
- `reviews.response` column EXISTS on `reviews` table (it is a valid column).
- `google_reviews.has_reply` EXISTS on `google_reviews`.
- No code found using `google_reviews.response` (non-existent) — all references to `response` on `reviews` table are correct.

---

## INFORMATIONAL — `wholesale_order_items.retail_price`

7 files reference `retail_price`. This is a valid column on `wholesale_order_items` (`retail_price` EXISTS in schema). Not a bug.

---

## INFORMATIONAL — `business_reviews.review_text`

`business_reviews` table has `review_text` (valid). The confusion arises because `reviews` table uses `content` + `text` instead. All code querying `business_reviews` with `review_text` is correct. The alias in `reels/ideas/route.ts:70` (`review_text: rv.content ?? rv.text ?? ''`) is a JavaScript local variable, not a DB column — clean.

---

## CONFIRMED BUG SUMMARY (needs-sprint-258)

| # | Severity | File | Line | Issue |
|---|----------|------|------|-------|
| 1 | HIGH | `src/lib/agents/inventory-financing-agent.ts` | 393 | `.gte('date', ...)` on `pos_timesheets` — column `date` doesn't exist; use `clock_in` |
| 2 | HIGH | `src/app/api/pos/inventory/route.ts` | 75 | `adjustment_quantity` should be `adjustment_qty` on `pos_stock_adjustments` insert (silent fail) |
| 3 | MEDIUM | `src/app/api/aria/generate-quote/route.ts` | 43 | `.single()` on `businesses` lookup — should be `.maybeSingle()` |
| 4 | MEDIUM | `src/app/api/aria/briefing/route.ts` | 117 | `.single()` on `daily_briefings` date lookup — should be `.maybeSingle()` |
| 5 | MEDIUM | `src/app/api/aria/pos-end-of-day/route.ts` | 44,53 | Two `.single()` calls on non-guaranteed rows |
| 6 | MEDIUM | `src/app/api/admin/businesses/route.ts` | 66 | `update().select().single()` without guaranteed match |
| 7 | MEDIUM | `src/app/api/aria/autopilot/route.ts` | 51,146 | `.single()` on business/autopilot lookups |
| 8 | MEDIUM | `src/app/api/aria/receipt-scan/confirm/route.ts` | 77 | Unawaited `activity_log` insert |
