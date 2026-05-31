# Audit Session 5 — Final Areas (Frontend + Lib)

## Scope
The 4 areas NOT yet audited. API routes are all done (Sessions 1-4).
This is the LAST audit session — covers frontend pages, components, and lib helpers.

- src/app/dashboard/ — Batch A (dashboard pages)
- src/app/pos/ — Batch B (POS terminal pages)
- src/lib/aria/ — Batch C (Aria intelligence lib)
- src/components/dashboard/ + src/components/pos/ — Batch D (components)

## Pre-flight
```
git pull origin main
```
Read AUDIT_STATE.md first — full schema + all column traps from Sessions 1-4.

## Mission — SAME as before, but note the difference for frontend
Column/table correctness against the live DB schema.

IMPORTANT: Frontend files (pages/components) usually don't query the DB directly —
they fetch from /api/ routes. So for these files, the audit focus shifts:
1. **API response shape mismatches** — does the component expect fields the API doesn't return?
2. **Direct Supabase calls in client components** — some pages use createClientSupabase and query directly. These CAN have column bugs. Check every .from()/.select() carefully.
3. **Field access on fetched data** — component reads `data.total` but API returns `total_amount`? That's a silent bug (shows undefined/NaN in UI).
4. **For src/lib/aria/** — these DO query the DB directly. Full column/table check like API routes.

## Critical column traps (from Sessions 1-4 — these are CONFIRMED)
- staff_members: NO name → first_name, last_name
- pos_sales: NO total → total_amount; status filter != 'voided'
- pos_sale_items: NO total_price → line_total
- pos_timesheets (NOT pos_timesheet_sessions); NO total_minutes → hours_worked
- pos_inventory_transfers (NOT pos_stock_transfers)
- pos_outlet_inventory: items_on_hand (NOT qty_on_hand or stock_quantity)
- pos_product_modifier_groups + pos_modifier_groups (NOT pos_product_modifiers/pos_modifiers)
- pos_customers: NO customer_segment/churn_risk → those on customers table
- pos_products: NO retail_price/selling_price → price; NO kds_skip_routing
- google_reviews.has_reply (NOT reviews.response)
- business_expenses: label (not name); amount dollars not cents
- pos_products NEW (2026-05-30): shelf_capacity, qty_backroom, expiry_date — VALID
- community_live_streams: cf_stream_uid, cf_playback_hls, cf_whip_url
- THREE briefing tables: daily_briefings, aria_daily_briefings, pos_daily_briefings — different cols
- pos_outlets table for outlets (NOT 'outlets')
- pos_staff: active column is is_active

## Monetary rule
All dollars (numeric) except *_cents columns. staff_members.pay_rate_cents IS cents.

## Batches

### Batch A — src/app/dashboard/
Audit every page.tsx and sub-component under dashboard/.
For each: check what API it fetches from, verify field names match the API response.
Flag any direct Supabase queries with wrong columns.
Special attention: ask-aria, profit-leaks, competitors, churn, reviews, winback, quote-builder, compliance, cash-flow, customers, invoices, staff, warehouse, promotions, seo, bookings.

### Batch B — src/app/pos/
POS terminal pages. Check:
- Direct Supabase queries (POS often queries client-side)
- pos_products field access (price not retail_price)
- pos_sales field access (total_amount not total)
- Cart/checkout logic field names
- inventory-scan page (uses new shelf_capacity/qty_backroom/expiry_date — valid)
- mobile page (the 7-mode scanner)

### Batch C — src/lib/aria/
These query DB directly — full check like API routes.
Files: business-context, council, context-brain, memory writers, providers, ask helpers,
business-brain, briefing generators, monitoring, predictions.
Check every .from()/.select()/.eq()/.insert().
Pay attention to: which briefing table each function writes to, pos_sales.total_amount,
aria_ai_calls columns, aria_memories columns, aria_autopilot_actions columns.

### Batch D — src/components/dashboard/ + src/components/pos/
Components that receive props from pages OR fetch their own data.
- BlockRenderer (already fixed — just verify it compiles)
- Any component with its own fetch() or Supabase call
- Prop shape mismatches (component expects field X, parent passes Y)

## Fix rules
- Fix only wrong column/table/field references
- One commit per file fixed: fix(area/file): description
- npx tsc --noEmit before every commit
- **CRITICAL: after committing, ALWAYS run `git push origin main`**
- **Then verify: `git log origin/main..HEAD` must show NOTHING (confirms push worked)**
- This is the lesson from the 31-unpushed-commits incident — never skip the push verify

## Output per batch
```
BATCH [X] COMPLETE
Audited: [files]
Bugs fixed: N
  - file: issue → fix (commit)
Pushed: YES (git log origin/main..HEAD empty? confirmed)
Next: [batch]
```
Update AUDIT_STATE.md after each batch AND push it.

## On completion
This is the FINAL audit session. When all 4 batches done:
- Update AUDIT_STATE.md: mark FULL CODEBASE AUDIT COMPLETE
- Summary: total bugs found across all 5 sessions
- Push everything
- Verify git log origin/main..HEAD is empty

## Start
Begin Batch A: src/app/dashboard/
After EVERY commit: git push origin main, then verify the push landed.
