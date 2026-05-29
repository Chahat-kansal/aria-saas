# Audit Session 2 — src/app/api/pos/

## Mission
Column/table correctness audit of all route files under `src/app/api/pos/`.
Find and fix silent failures caused by wrong table names, wrong column names,
and monetary unit mismatches. Do NOT refactor logic, change behaviour, or
add features. Fix only what is provably wrong against the DB schema.

## Context
Read `AUDIT_STATE.md` first — it contains:
- Full DB table + column reference (ground truth from live DB)
- Column traps and known gotchas
- Monetary rules (dollars vs cents)
- Session 1 completed fixes

## Scope — 120 directories under src/app/api/pos/
Work through them in alphabetical order. For each route file:
1. Read the file fully
2. Check every `.from('table')` — does that table exist in the schema?
3. Check every `.select('col')` — does every column exist on that table?
4. Check every `.eq('col', ...)`, `.insert({col})`, `.update({col})` — same check
5. Check monetary values — are dollar amounts stored as dollars (not cents)?
6. If clean: mark clean and move on
7. If broken: fix inline, note the commit

## Batch strategy
This is ~120 directories. Work in batches of 20 directories per sub-session.
At the end of each batch update AUDIT_STATE.md with:
- Which directories were audited this batch
- Any bugs found and fixed (file, issue, commit)
- Next batch starting point

Sub-session batches (alphabetical):
- Batch A: ad-campaigns → cart-line-actions
- Batch B: cash-movements → customers  
- Batch C: daily-summary → gift-cards
- Batch D: hardware-devices → modifiers
- Batch E: online-orders → products
- Batch F: promotions → sales
- Batch G: scan-and-go → xero-sync

## Critical column traps (memorise these)
- `staff_members` has NO `name` column — use `first_name`, `last_name`
- `pos_staff` has `name` (it's the register login table, not team management)
- `pos_sales.served_by` is TEXT (cashier name), not a UUID
- `pos_sales` status filter must be `!= 'voided'` not `= 'completed'`
- `pos_products.barcode` is often NULL — real barcodes are in `pos_product_barcodes`
- `pos_customers` has NO `customer_segment` or `churn_risk` — those are on `customers`
- `business_expenses.label` not `name`; `business_expenses.amount` is dollars not cents
- `competitor_price_cache.competitor_price_cents` IS cents (exception to dollar rule)
- THREE briefing tables: `daily_briefings`, `aria_daily_briefings`, `pos_daily_briefings` — each has different columns, don't mix them
- `pos_timesheets` has BOTH `staff_id` and `staff_member_id` — verify which the code uses matches how it was inserted
- `pos_products` NEW columns added 2026-05-30: `shelf_capacity` (integer), `qty_backroom` (integer), `expiry_date` (date) — these ARE valid, do not flag them

## New routes added 2026-05-30 (audit these too)
- `src/app/api/pos/products/quick-create/route.ts` — new file, created today

## Monetary rule
All DB amounts are plain dollars (numeric) EXCEPT columns explicitly named `*_cents`.
If code multiplies by 100 before inserting, or divides by 100 after reading, that's a bug.

## Fix rules
- Fix only the wrong column/table reference — nothing else
- One commit per file fixed, message format: `fix(pos/route-name): description`
- After fixing, re-read the file to confirm the fix is correct before committing
- Do NOT touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- Do NOT change vercel.json function count (must stay at 22)

## Output format per batch
After each batch of 20, output:
```
BATCH [X] COMPLETE
Audited: [list of directories]
Bugs fixed: [N]
  - file: issue → fix (commit)
Clean: [list]
Next batch: [starting directory]
```
Then update AUDIT_STATE.md before stopping.

## Start
Begin with Batch A: `ad-campaigns` through `cart-line-actions`.
Read each route.ts file, check against AUDIT_STATE.md schema, fix if broken.
