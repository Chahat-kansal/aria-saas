# Prompt 210 — AI Supplier Order Management System

Build a full AI-powered supplier order management system inside Aria POS/Warehouse.
Based on approved mockup: aria-landing-mockup-v2.html (supplier order section).

## What already exists (do NOT rebuild — extend only)
- `pos_suppliers` table — basic supplier records (name, email, phone, lead_time_days)
- `warehouse_purchase_orders` table — PO records with po_number, status, supplier, items jsonb
- `purchase_order_drafts` table — AI-generated draft orders
- `/api/warehouse/suppliers` route — GET/POST suppliers (extends pos_suppliers + warehouse_supplier_performance)
- `/api/warehouse/purchase-orders` route — GET/POST/PATCH purchase orders
- `ReorderAgent` at `src/lib/agents/reorder-agent.ts` — calculates reorder quantities from 30d sales velocity
- `/dashboard/warehouse/suppliers/page.tsx` — basic supplier list with performance metrics
- `/dashboard/warehouse/purchase-orders/` — existing PO page (extend, do not replace)

## Pre-flight
```
git pull origin main
npx tsc --noEmit && npm run build
```
Read CLAUDE.md (RULE 0 — upgrade only, never downgrade). Push + verify after every commit.
npm run build must pass before every commit.

---

## PART 1 — DATABASE MIGRATIONS

### Migration 1: Extend pos_suppliers with delivery schedule + custom columns
```sql
-- Add delivery schedule fields to pos_suppliers
ALTER TABLE pos_suppliers
  ADD COLUMN IF NOT EXISTS delivery_days integer[] DEFAULT ARRAY[]::integer[],
  ADD COLUMN IF NOT EXISTS order_cutoff_days integer[] DEFAULT ARRAY[]::integer[],
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS short_code text,
  ADD COLUMN IF NOT EXISTS order_email text,
  ADD COLUMN IF NOT EXISTS custom_columns jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notes text;

-- delivery_days: array of weekday ints 0=Mon..6=Sun
-- order_cutoff_days: days owner must place order to get next delivery
-- custom_columns: [{key, label, type}] per-supplier column config
-- short_code: e.g. "ALM", "ILG", "HFW"
```

### Migration 2: Extend warehouse_purchase_orders with AI fields
```sql
ALTER TABLE warehouse_purchase_orders
  ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_reasoning jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_accepted_pct numeric,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_email text,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz;
```

### Migration 3: Product price history table
```sql
CREATE TABLE IF NOT EXISTS supplier_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  supplier_code text,
  cost_price numeric NOT NULL,
  recorded_at timestamptz DEFAULT now(),
  source text DEFAULT 'manual' CHECK (source IN ('manual','po_confirmed','ai_detected'))
);
ALTER TABLE supplier_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_prices" ON supplier_product_prices FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_spp_supplier_product ON supplier_product_prices(supplier_id, product_id, recorded_at DESC);
```

### Migration 4: AI order suggestions table
```sql
CREATE TABLE IF NOT EXISTS supplier_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE CASCADE,
  po_id uuid REFERENCES warehouse_purchase_orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  product_name text,
  suggested_qty numeric,
  current_qty numeric,
  reason text,
  trend text CHECK (trend IN ('up','down','same')),
  velocity_per_week numeric,
  stock_days_remaining numeric,
  price_change_pct numeric,
  accepted boolean,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_suggestions" ON supplier_ai_suggestions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

Run all 4 via Supabase MCP. Verify with EXPLAIN.
Commit: "feat(db): supplier delivery schedule, price history, AI suggestions migrations"

---

## PART 2 — API ROUTES

### 2A: Extend /api/warehouse/suppliers to handle delivery schedule
Update `src/app/api/warehouse/suppliers/route.ts`:

Add to GET response — include delivery_days, order_cutoff_days, short_code, order_email,
custom_columns, region alongside existing performance data.

Add to POST/PATCH — accept and save delivery_days, order_cutoff_days, short_code,
order_email, custom_columns, region.

Schema: delivery_days is integer[] (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun).

### 2B: New route /api/warehouse/suppliers/[id]/prices
```
GET  /api/warehouse/suppliers/[id]/prices?business_id=X
     Returns price history for all products from this supplier
     Groups by product, returns 6-month history array [{date, price}]
     Calculates price_change_pct vs 6 months ago

POST /api/warehouse/suppliers/[id]/prices
     Records a new price point for a product
     Body: { business_id, product_id, product_name, supplier_code, cost_price }
     Automatically called when a PO is confirmed/received
```

### 2C: New route /api/warehouse/ai-order-suggestions
```
POST /api/warehouse/ai-order-suggestions
Body: { business_id, supplier_id }

This is the smart reorder brain. It:
1. Reads pos_products for this supplier (track_stock = true)
2. Calculates 30-day + 90-day sales velocity per product
3. Reads supplier.lead_time_days and delivery_days to find next delivery date
4. Calculates stock_days_remaining = stock_quantity / avg_daily_velocity
5. Calculates suggested_qty based on:
   - Target cover: 14 days past next delivery (so never runs out)
   - Safety stock: velocity * lead_time_days * 1.5
   - Trend multiplier: if up > 10% vs 30d ago → multiply by 1.2; if down → multiply by 0.85
6. Compares current order qty vs suggested
7. Checks price history for price_change_pct (flag if >3%)
8. Returns per-product: { name, code, suggested_qty, current_qty, reason, trend,
                          velocity, stock_days_remaining, price_change_pct, urgency_score }
9. Calls Claude claude-haiku-4-5-20251001 with the analysis data to generate:
   - Plain-English reason for each suggestion (e.g. "Up 40% last 4 weeks — summer trend")
   - A global order summary (e.g. "3 urgent items, 2 price alerts, $420 freed if skip Penfolds")
10. Saves suggestions to supplier_ai_suggestions table
11. Logs to aria_ai_calls

Auth: user must own the business_id. Return 401 if not.
```

### 2D: New route /api/warehouse/suppliers/[id]/send-order
```
POST /api/warehouse/suppliers/[id]/send-order
Body: { business_id, po_id, items, total_inc, notes }

1. Verifies business ownership
2. Generates the order email body matching ALM invoice format:
   - Subject: "Purchase Order [PO-NUMBER] — [Business Name]"
   - Body: plain text with order summary table (product, code, qty, unit cost, total)
   - PDF-ready format: supplier code | product | case qty | unit cost | ordered | total ex | total inc
3. Sends via SendGrid to supplier.order_email
4. Updates warehouse_purchase_orders.status = 'sent', sent_at = now(), sent_to_email
5. Records price points in supplier_product_prices for each line item
6. Logs to aria_ai_calls
Returns: { sent: true, po_number, email_sent_to }
```

### 2E: New route /api/warehouse/purchase-orders/[id]/receive
```
PATCH /api/warehouse/purchase-orders/[id]/receive
Body: { business_id, received_lines: [{product_id, received_qty}] }

1. Verifies business ownership
2. For each line: updates pos_products.stock_quantity += received_qty
3. Creates pos_outlet_inventory records if applicable
4. Flags discrepancies (ordered vs received)
5. Updates PO status = 'received', delivery_confirmed_at = now()
6. Records price points (if cost differs from last recorded → auto-detect price change)
7. Calls Claude to generate a brief receive summary with any discrepancy actions
8. Logs to aria_ai_calls, aria_autopilot_actions
```

### 2F: New route /api/warehouse/delivery-schedule
```
GET /api/warehouse/delivery-schedule?business_id=X&week_start=YYYY-MM-DD

Returns the full week's delivery + cutoff schedule for all suppliers.
Response:
{
  week: [
    {
      date: '2026-06-01',
      day: 'Mon',
      deliveries: [{ supplier_id, short_code, name }],
      cutoffs: [{ supplier_id, short_code, name, delivers_on }],
      is_today: true
    },
    ...7 days
  ],
  urgent: [{ supplier_id, name, product_name, stock_days, must_order_by }]
}

Logic:
- For each supplier: if today is a cutoff day AND any product has stock_days <= lead_time+1
  → add to urgent list
```

Commit per route: "feat(api): [route name]"

---

## PART 3 — UPGRADE SUPPLIERS PAGE

Upgrade `src/app/dashboard/warehouse/suppliers/page.tsx`.
RULE 0: keep all existing functionality (performance scores, add supplier, insights).
Add these tabs and features on top:

### Tab structure (add to existing page)
Tabs: Overview (existing) | Orders | Delivery Schedule | Price Comparison | Settings

### Tab: Orders
- List all POs for each supplier grouped by status (draft / sent / received)
- Button: "New order" → opens order creation flow
- Button: "AI suggest order" → calls /api/warehouse/ai-order-suggestions → shows suggestion modal
- Each PO row: PO number, date, lines, total, status badge, "View" button

### Tab: Delivery Schedule
- 7-day calendar grid (Mon-Sun) showing which days each supplier delivers
- Blue highlight = delivery day, Amber = order cutoff day, today = bold border
- Urgent alerts panel: products running low relative to next delivery
- Logic: stock_days_remaining <= supplier.lead_time_days + 1 = urgent
- Show: product name, supplier, days of stock left, "Order by [day]" badge

### Tab: Price Comparison
- Per supplier: table of products with 6-month price history sparkline
- Columns: Product | Jan price | Current price | Change % | Trend sparkline
- Colour code: green = stable/down, amber = up 1-3%, red = up >3%
- Aria insight bar at top: "X items have increased more than 3% since January"
- Cross-supplier opportunity: if same product at lower price from another supplier, flag it

### Tab: Settings (per supplier)
- Edit: name, short_code, email, phone, lead_time_days, region, notes
- Delivery days toggle: 7 circular day buttons (Mon-Sun), click to toggle delivery days
- Order cutoff days toggle: same pattern, amber colour
- Custom columns: toggle which columns show on this supplier's order lines
  Available columns: supplier_code, product_code, sku, case_qty, pack_size, unit,
  base_cost, cost_price, price_per_unit, rrp, ordered_cases, qty_ordered, qty,
  total_ex, total_inc, subtotal, gst, gst_inc, total, received, qty_received
- Save button → PATCH /api/warehouse/suppliers/[id]
- Delete supplier button (with confirmation)

---

## PART 4 — ORDER CREATION + AI SUGGESTION FLOW

### New component: src/components/warehouse/SupplierOrderModal.tsx
Full-screen modal (or page) for creating/editing a supplier order.

#### Header section
- Supplier name, short code, status badge
- Metric cards: Order total | AI suggested total | Cases | Next delivery | Order by | Urgent items

#### Tab: AI Suggestions (default tab when opened via "AI suggest order")
- Aria bar at top with global summary (from /api/warehouse/ai-order-suggestions)
- Per product row:
  - Trend dot (green up / red down / grey same)
  - Product name + urgent badge (if stock_days <= lead+1) + price alert badge (if price up >3%)
  - Plain-English reason from Claude
  - "was X → suggested Y" with diff badge (+N green / -N red / no change grey)
  - Accept ✓ button | Reject ✗ button
- "Accept all" button → sets all ordered_qty = suggested_qty
- "Edit manually" → switches to Order Lines tab
- "Check prices first" → switches to Price Comparison tab

#### Tab: Order Lines
- Table: Product | Code | Cost (with price change %) | Velocity/wk | Stock days | AI qty | Your qty (editable input) | Total
- Stock days column: red if <= 3, amber if <= 7, green otherwise
- "Apply AI suggestions" button at top right
- Editable qty inputs: updating a qty recalculates the total in real-time
- "Add line" button: search + add a product from pos_products
- "Remove line" button per row

#### Tab: Price Comparison (in modal context)
- Same sparkline table as the main page tab but scoped to this supplier's products

#### Tab: Receive Stock
- Table: Product | Ordered qty | Received qty (editable input) | Discrepancy | Aria action
- Discrepancy: green OK / red Short N / amber Over N
- Aria action column: auto-suggested text ("Re-order shortfall" / "Update par level" / "Stock updated")
- "Confirm receipt + update stock" button → calls /api/warehouse/purchase-orders/[id]/receive
- Confirmation shows: stock updated, discrepancies logged, price changes detected

#### Tab: Ask Aria (chat)
- Chat interface with Aria, knows:
  - This supplier's delivery schedule
  - Current stock levels for all supplier products
  - 90-day velocity per product
  - Price history
  - Last 3 orders and their accuracy
- Pre-loaded quick questions:
  - "When does [supplier] deliver?"
  - "What's the next order deadline?"
  - "Any price increases lately?"
  - "Which products are overstocked?"
  - "Oat milk is critical — should I order now?"
- Each question calls claude-haiku-4-5-20251001 with full supplier + stock context
- Log to aria_ai_calls

#### Tab: History
- Past orders for this supplier: PO number, date, cases, total, status, AI accuracy %
- AI accuracy: (items where AI suggestion was accepted and stock did not run out) / total items
- Aria insight bar: "Suggestion accuracy X%, following AI saved $Y in overstock last 3 months"

#### Footer actions
- "Print PDF" → opens /print/purchase-order/[id] page
- "Send to [supplier]" → calls /api/warehouse/suppliers/[id]/send-order
  → shows confirmation: "Sent to orders@supplier.com.au · PDF attached · delivery in Xd"

---

## PART 5 — PRINT/PDF ROUTE

Create `src/app/print/purchase-order/[id]/page.tsx` (or extend existing /print/[type]/[id]):

PDF format matching ALM invoice style exactly (from approved mockup):

```
PURCHASE ORDER

Order No:     PO-20260601-003          Date: 01/06/2026
From:         [Business Name]           ABN: [business ABN]
To:           [Supplier Name]           Email: [supplier email]
Expected:     [delivery date]

| Product              | Supplier Code | Case Qty | Unit Cost | Ordered | Total (ex) | Total (inc) |
|----------------------|---------------|----------|-----------|---------|------------|-------------|
| DIVAS VKAT 700ML     | 00561205      | 12       | $108.61   | 1 case  | $98.74     | $108.61     |
...

TOTAL:  [X] cases    $[ex]    $[inc]

Notes: [any order notes]
Please confirm receipt of this order and advise expected delivery date.
```

Columns shown = supplier's custom_columns config (so each supplier gets their right format).

---

## PART 6 — GLOBAL DELIVERY ALERT (sidebar/dashboard)

In the main warehouse dashboard or sidebar, add a small delivery alert widget:

Calls /api/warehouse/delivery-schedule on load.
Shows:
- "Today: ALM delivers" (if today is a delivery day for any supplier)
- "Order by today: ILG (Thu delivery)" (if today is a cutoff day)
- "Urgent: Oat Milk — 2 days stock" (if any product is critically low)

This widget should be non-intrusive — small banner or sidebar section.
If no alerts: show nothing (don't clutter the UI).

---

## PART 7 — REORDER AGENT EXTENSION

Extend `src/lib/agents/reorder-agent.ts`:

Current agent calculates reorder qty. Add:
1. Delivery-schedule awareness: use supplier.delivery_days to calculate next_delivery_date
   instead of just using lead_time_days as a flat number
2. Price-change detection: after generating suggestions, check supplier_product_prices
   for any item where price changed >3% in last 30 days → flag in suggestions
3. Write suggestions to supplier_ai_suggestions table
4. Trend calculation: compare 30d velocity vs 90d velocity
   - If 30d > 90d * 1.1 → trend = 'up'
   - If 30d < 90d * 0.9 → trend = 'down'
   - Otherwise → 'same'

---

## AI INTELLIGENCE RULES (apply to every AI call in this module)
- Model: claude-haiku-4-5-20251001 for suggestions and chat
- Log every call to aria_ai_calls: { business_id, model, prompt_tokens, completion_tokens, cost_usd, feature: 'supplier_orders' }
- Log accepted suggestions to aria_autopilot_actions
- System prompt context to always include:
  - Supplier name, delivery days, lead time, region
  - Product stock levels and velocities
  - Price history summary
  - Last 3 orders and quantities
- Never hallucinate supplier prices — only use data from supplier_product_prices table
- Suggestions must be explainable in plain English — one sentence per product

---

## COLUMN/TABLE RULES (from audit — CRITICAL)
- pos_products: use `price` not `retail_price` or `selling_price`
- pos_products: use `track_stock` not `track_inventory`
- pos_products: use `stock_quantity` for current stock
- pos_sales: use `total_amount` not `total`
- pos_sale_items: use `line_total` not `total_price`
- pos_suppliers: check existing columns before adding (don't duplicate)
- Always use supabaseAdmin for server-side queries (not anon client)
- Always verify business ownership before any query

---

## COMMIT SEQUENCE
One commit per logical unit, push + verify after each:
1. "feat(db): supplier delivery schedule, price history, AI suggestions migrations"
2. "feat(api/suppliers): extend GET/POST with delivery_days, order_cutoff, custom_columns"
3. "feat(api): supplier price history route"
4. "feat(api): AI order suggestions route with velocity, trend, price change detection"
5. "feat(api): send-order route — email to supplier in ALM format via SendGrid"
6. "feat(api): purchase order receive route — update stock, detect price changes"
7. "feat(api): delivery schedule route — weekly calendar with urgent alerts"
8. "feat(warehouse/suppliers): delivery schedule tab + price comparison tab + settings tab"
9. "feat(warehouse/suppliers): orders tab + AI suggestion flow"
10. "feat(warehouse): SupplierOrderModal — all 6 tabs (suggest, lines, prices, receive, chat, history)"
11. "feat(warehouse/reorder-agent): delivery-aware scheduling, price change detection, trend calc"
12. "feat(warehouse/print): purchase order PDF in supplier-specific column format"
13. "feat(warehouse): global delivery alert widget"

## HARD RULES (from CLAUDE.md)
- RULE 0: Upgrade only — keep all existing supplier/PO/reorder functionality, extend it
- Never use anon Supabase client for server-side data queries — always supabaseAdmin
- npm run build before every single commit
- Push + verify (git log origin/main..HEAD empty) after every commit
- One feature at a time — get it compiling before moving to the next
- All monetary amounts in dollars (numeric), not cents, except columns named *_cents
- Use claude-haiku-4-5-20251001 for all AI calls in this module (cost-efficient)
- RLS is enabled on all new tables — policies created in migrations
- vercel.json: stay within 22 function configs, daily crons only

## Start
Read CLAUDE.md first. Then run the 4 migrations via Supabase MCP. Verify each table exists.
Then build Part 2 API routes one by one. Each must compile (tsc --noEmit) before proceeding.
Do not start the UI (Part 3+) until all API routes are working.
