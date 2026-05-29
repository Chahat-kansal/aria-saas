# Prompt 110 — Warehouse Module: 2-Sprint Polish

~18 sub-routes already exist. This prompt closes the gap to category-leading.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```
Read the full src/app/dashboard tree for warehouse + src/app/api/pos/ warehouse-related routes before writing anything.

First: run this search to understand what exists:
- Find all files with "warehouse" in path or content
- Find /dashboard/inventory/, /dashboard/warehouse/, /dashboard/stock/ pages
- Find pos API routes: transfers, stock-takes, purchase-orders, stock, inventory

## TASK 1 — Shelf capacity + replenishment (your Coles insight)
We already added to DB: pos_products.shelf_capacity, qty_backroom, expiry_date
Ensure these are surfaced in:
- Product edit form: shelf_capacity field, qty_backroom field
- Stock overview table: floor qty | backroom qty | capacity | fill % bar
- Low floor stock alert: if stock_quantity < (shelf_capacity * 0.2) AND qty_backroom > 0 → "Pull from backroom" alert
- Replenishment queue: /dashboard/warehouse/replenish — list of products needing floor restock from backroom
Commit: "feat(warehouse): shelf capacity + backroom stock UI + replenishment queue"

## TASK 2 — Purchase orders completeness
Read all src/app/api/pos/purchase-orders/ routes. Ensure:
- Create PO: supplier, expected_date, line items (product + qty + unit_cost)
- Send PO: email to supplier (SendGrid) with PDF summary
- Receive PO: mark items received, automatically update stock_quantity + qty_backroom
- Partial receive: receive some items, leave PO as 'partial'
- PO history: list with status badges (draft/sent/partial/received)
Commit: "feat(purchase-orders): complete PO flow — create, send, receive, partial"

## TASK 3 — Stock transfers between outlets
If multi-outlet (businesses with pos_outlets count > 1):
- Transfer: move stock from outlet A to outlet B
- Creates a transfer record: from_outlet_id, to_outlet_id, product_id, qty, status, transferred_at
- Deducts from source outlet, adds to destination
- Transfer history + status tracking
Commit: "feat(warehouse): inter-outlet stock transfers"

## TASK 4 — Dead stock + expiry management
Dead stock: products with stock_quantity > 0 and zero sales in last 60 days.
Create/update src/app/api/pos/dead-stock/route.ts:
- GET: list dead stock with days_since_last_sale, holding_cost estimate
- AI recommendation per product: "Mark down 20%", "Bundle with X", "Return to supplier"

Expiry management (uses expiry_date column added today):
- GET /api/pos/expiry-alerts: products where expiry_date < now() + 14 days
- Sorted by urgency
- Actions: mark down, write off (deduct from stock), log waste
Commit: "feat(warehouse): dead stock intelligence + expiry management"

## TASK 5 — Warehouse dashboard
Create or complete src/app/dashboard/warehouse/page.tsx:
Tabs: Overview | Replenishment | Purchase Orders | Transfers | Dead Stock | Expiry

Overview tab:
- Stock value (sum of stock_quantity * cost_price)
- Low stock count (below threshold)
- Backroom stock value
- Top 10 products by stock value

Replenishment tab: products needing floor restock (floor < 20% capacity, backroom > 0)

Purchase Orders tab: PO list, create button, receive flow

Transfers tab: transfer history + create transfer

Dead Stock tab: AI-recommended actions per product

Expiry tab: urgency list, markdown/writeoff actions
Commit: "feat(warehouse/dashboard): full 6-tab warehouse dashboard"

## Rules
- Amounts in dollars not cents
- npx tsc --noEmit + npm run build before each commit
- shelf_capacity, qty_backroom, expiry_date are VALID columns (added 2026-05-30)
