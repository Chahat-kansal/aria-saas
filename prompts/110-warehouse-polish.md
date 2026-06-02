# Prompt 110 — Warehouse Module: Polish to Category-Leading Standard


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

~18 sub-routes exist. Close the gap vs Cin7, DEAR Inventory, Unleashed.
Read ALL warehouse/inventory/stock API files before writing anything. Read CLAUDE.md first.

## Pre-flight (MANDATORY — read CLAUDE.md first)
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
Read CLAUDE.md. Read every file you will edit before touching it.
One commit per task. After every commit: git push origin main, then confirm git log origin/main..HEAD is empty.
State "Build verified green, all commits pushed." before finishing.

## UPGRADE-ONLY RULE
Never remove, stub, or downgrade any existing feature. Fix forward only.

## ARIA INTELLIGENCE RULE (applies to every task)
Every new feature must:
1. Write relevant data to aria_ai_calls (log AI usage)
2. Feed insights back into the daily briefing context (update buildAskAriaContext or daily-briefing route to include new data)
3. Log significant actions to aria_autopilot_actions
4. Use claude-haiku-4-5-20251001 unless the task requires complex reasoning (then claude-sonnet-4-5-20250929)


## TASK 1 — Shelf capacity + replenishment queue
Columns shelf_capacity, qty_backroom, expiry_date are VALID (added 2026-05-30).

Ensure product edit form (src/app/dashboard/pos/ or wherever product PATCH is called) includes:
- shelf_capacity field (integer, optional)
- qty_backroom field (integer, default 0)
- expiry_date field (date picker, optional)

Create src/app/dashboard/warehouse/replenishment/page.tsx:
- Products needing floor restock: WHERE stock_quantity < (shelf_capacity * 0.25) AND qty_backroom > 0
- Columns: product | floor qty | shelf capacity | backroom qty | % full | action
- "Pull to floor" button: moves qty from backroom to floor (increments stock_quantity, decrements qty_backroom)
- Sort by urgency (most depleted first)
- "Mark all pulled" bulk action

Add to daily briefing: count of products needing replenishment from backroom.
Commit: "feat(warehouse): shelf capacity UI + replenishment queue with pull-to-floor action"

## TASK 2 — Purchase order completeness
Read ALL src/app/api/pos/purchase-orders/ routes.
Ensure complete flow exists:
1. Create PO: supplier, expected_delivery_date, line items (product_id, qty, unit_cost)
2. Send PO: generate PDF summary → email to supplier via SendGrid (use supplier.order_email from supplier_order management work)
3. Receive PO: mark items received, update stock_quantity + qty_backroom
4. Partial receive: receive some items, PO status → 'partial'
5. PO history: list with status badges (draft/sent/partial/received/cancelled)

Add to briefing: POs expected for delivery today.
Commit: "feat(purchase-orders): complete PO flow — create, send, receive, partial, history"

## TASK 3 — Stock takes (count + reconciliation)
Read src/app/api/pos/stock-takes/ or similar.
Ensure stock take flow:
1. Create stock take: snapshot current stock_quantity for all products
2. Enter counts: enter actual physical count per product
3. Review discrepancies: show variance (counted - system), highlight large discrepancies
4. Commit stock take: update stock_quantity to counted values, log variance
5. Stock take history with variance reports

Shrinkage tracking: log total variance value per stock take → trend over time.
Add: shrinkage % to warehouse dashboard overview.
Commit: "feat(warehouse): stock take flow — create, count, reconcile, commit, shrinkage"

## TASK 4 — Dead stock + expiry management
Read/create src/app/api/pos/dead-stock/route.ts:
GET { business_id }: products with stock_quantity > 0 AND zero sales in last 60 days
Include: days_since_last_sale, holding_cost (qty * cost_price), AI recommendation

AI recommendation (haiku): "Mark down 20%", "Bundle with X", "Return to supplier", "Write off"
Return top 20 sorted by holding_cost descending.

Read/create src/app/api/pos/expiry-alerts/route.ts:
GET { business_id }: products WHERE expiry_date IS NOT NULL AND expiry_date < now() + 14 days
Sort by urgency (days remaining). Include: product, qty, expiry_date, days_remaining
Actions: markdown (reduce price), write-off (deduct stock, log waste), extend (update expiry date)

Add to daily briefing: count of items expiring within 7 days + dead stock holding cost.
Commit: "feat(warehouse): dead stock intelligence + expiry management with actions"

## TASK 5 — Inter-outlet stock transfers
Read src/app/api/pos/outlet-transfers/ or pos/inventory-transfers/.
Ensure complete transfer flow:
1. Create transfer: from_outlet_id, to_outlet_id, line items (product_id, qty)
2. Send: status → 'in_transit'
3. Receive: confirm at destination outlet, update stock at both outlets
4. Transfer history with status

Guard: check source outlet has sufficient stock before allowing transfer.
Commit: "feat(warehouse): inter-outlet stock transfers — create, send, receive"

## TASK 6 — Full warehouse dashboard
src/app/dashboard/warehouse/page.tsx — 6 tabs:

Overview tab:
- Stock value (SUM stock_quantity * cost_price)
- Low stock count (below reorder_point or below 10% of shelf_capacity)
- Backroom stock value
- Shrinkage this month
- POs arriving today

Replenishment tab: (from Task 1)

Purchase Orders tab: PO list + create button + receive flow

Stock Takes tab: history + create new stock take

Dead Stock tab: AI-recommended actions per product (holding cost, days stale)

Expiry tab: urgency list with days remaining, markdown/writeoff actions

Feed into Aria briefing: all warehouse intelligence (low stock, POs due, expiry alerts, dead stock value).
Commit: "feat(warehouse/dashboard): full 6-tab warehouse dashboard — all features functional"

## Rules
- Amounts in dollars not cents
- shelf_capacity, qty_backroom, expiry_date are VALID columns
- npx tsc --noEmit + npm run build before each commit
- Migrations via Supabase MCP
