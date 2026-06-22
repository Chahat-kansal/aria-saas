# INV-AUDIT-1 — Inventory Ground-Truth Audit (read-only)

**Date:** 2026-06-22 · **Scope:** Sip (`ff5055a0-c351-4ada-817a-1804961035f3`) · **Type:** READ-ONLY findings + constraint catalogue. No schema changes, no writes, no runtime files touched.

> Purpose: lock the corrected build order and provide a paste-ready constraint catalogue for every later inventory sprint (INV-DECREMENT-FIX, INV-COST-1, INV-PAR-1, INV-VELOCITY-1, INV-STAFF-APP). Every figure below is a recorded live query result, not an assumption. **Two of the brief's premises were corrected by the data** — see #1 (cause is not `track_stock`) and #3 (`cost_price` IS populated).

---

## TL;DR — the 5 findings that change the build order

1. **The decrement gap is a DATA-origin problem first, a code problem second.** Sip's 419 completed sales (last 30d) are **seeded/generated demo data** (all `source = NULL`, max date `2026-06-14` — 8 days stale vs today), inserted directly into `pos_sales`/`pos_sale_items`, so they never ran any API decrement → no `stock_movements`. Separately, the live code logs `stock_movements` from **only one of several** sale paths. Net: `stock_movements` covers ~8% of sold lines and is **not** a source of truth.
2. **`stock_movements` must NOT be used for units-sold.** Use `pos_sale_items` (complete, FK-backed). Confirmed query in §2.
3. **Cost data largely EXISTS** — `cost_price` is populated on **72/74** products (and on `pos_sale_items`). The all-zero column is `cost` (and `cost_price_cents`). INV-COST-1 is a **standardise + backfill-2** job, not a from-scratch job. (Brief premise "cost is 0 across all" was true only for the dead `cost` column.)
4. **Stock lives in THREE unsynchronised places** — `pos_products.stock_quantity` (the only one the sale RPC decrements), `pos_products.current_stock` (parallel, never touched on sale), and `pos_outlet_inventory.items_on_hand` (74 Sip rows, what the inventory/Aria views actually read). They will diverge — a second reason variance reports are untrustworthy.
5. **PAR/velocity are genuinely empty** — `reorder_point/target_stock/reorder_qty = 0` across all 74 products; `product_performance_scores` = 0 rows. These are clean greenfield targets (INV-PAR-1, INV-VELOCITY-1).

**Revised build order recommendation:** `INV-DECREMENT-FIX` must move **early** (right after this audit) — until every sale path writes a consistent movement/decrement and the three stock figures are reconciled, no variance/shrinkage report can be trusted. Suggested order: **INV-DECREMENT-FIX → INV-COST-1 (standardise on `cost_price`) → INV-VELOCITY-1 → INV-PAR-1 → INV-STAFF-APP.**

---

## 1. DECREMENT PATH — root cause (DO NOT FIX HERE; for INV-DECREMENT-FIX)

**Where stock is decremented on a sale:** [`src/app/api/pos/sale/route.ts`](../src/app/api/pos/sale/route.ts) — the `stockOps` loop, **lines 291–312**.

```
291  // Decrement stock atomically + log stock movements
292  const stockOps: PromiseLike<any>[] = [];
293  for (const i of items) {
294    const p = productMap[i.product_id];
295    if (!p?.track_stock) continue;                                  // gate
296    stockOps.push((async () => {
298      const { data: newStock } = await supabase.rpc('decrement_stock_quantity', { p_product_id: i.product_id, p_amount: i.quantity });
301      await supabase.from('stock_movements').insert({ business_id, item_id: i.product_id, movement_type: 'sale', quantity_added: -i.quantity, new_stock: newStock ?? 0, notes: `Sale ${saleNumber}`, scanned_at: ... });
309    })());
```

`decrement_stock_quantity(p_product_id uuid, p_amount numeric)` (SECURITY DEFINER) updates **`pos_products.stock_quantity`** only: `set stock_quantity = greatest(0, floor(coalesce(stock_quantity,0) - p_amount))`. It does **not** touch `current_stock` or `pos_outlet_inventory.items_on_hand`.

**Why coverage is ~8% (829 sold lines / 63 `sale` movements in 30d) — root cause, with evidence:**

- **It is NOT the `track_stock` gate.** All 74 Sip products have `track_stock = true` (0 false/null), so line 295 never skips for Sip. The brief's hypothesis is disproved.
- **Primary cause — seeded data bypasses the API entirely.** All 419 completed Sip sales (30d) have `source = NULL` and stop at `2026-06-14` (today is `2026-06-22`). This is generated demo data written straight to `pos_sales`/`pos_sale_items`; it never executed `pos/sale/route.ts`, so no `stock_movements` and no decrement ran for them. The 63 `sale` movements (92 total movements Sip, all types) are the residue of the handful of real API sales.
- **Secondary cause — only ONE sale path logs movements.** There are multiple sale-completion code paths; only `pos/sale/route.ts` inserts `stock_movements`. In particular [`src/app/api/pos/sales/route.ts`](../src/app/api/pos/sales/route.ts) **line 300** calls `decrement_stock_quantity` (gated by `prod?.stock_quantity != null`, a *different* condition) **but writes no `stock_movements` row**. Other sale-creating paths (`sync-offline`, `online-orders/[id]`, `laybys`, `sales/draft`, returns/refunds) do not log movements either. So even with 100% live traffic, `stock_movements` would remain an incomplete ledger.

**Implication for INV-DECREMENT-FIX:** centralise decrement + movement logging into one shared helper invoked by **every** sale-completion path (singular `pos/sale`, plural `pos/sales`, offline sync, online-orders, laybys, draft-commit); enforce `movement_type` consistency; and decide the canonical stock column (see #4). `movement_type` currently has **no DB CHECK** (free text) — consider adding one.

---

## 2. SOURCE OF TRUTH — units sold (use this query everywhere)

`pos_sale_items` is complete and FK-backed. Join is **`pos_sale_items.product_id` (uuid) → `pos_products.id` (uuid)** — same type, clean. (`stock_movements.item_id` is `text` with **no FK** — do not use it.)

**Sale statuses present (Sip, 30d):** `completed` 419 · `voided` 2 · `draft` 1 · `refunded` 1. → "sold" = `pos_sales.status = 'completed'` (excludes voided/draft/refunded).

**Canonical units-sold per product per period (completed only, net of returns):**
```sql
select si.product_id,
       coalesce(p.name, si.product_name)                as product_name,   -- product_id FK is ON DELETE SET NULL → fall back to the denormalised name
       sum(si.quantity - coalesce(si.returned_quantity,0)) as units_sold
from pos_sale_items si
join pos_sales s        on s.id = si.sale_id
left join pos_products p on p.id = si.product_id
where si.business_id = :business_id
  and s.status = 'completed'
  and s.created_at >= :from and s.created_at < :to
group by si.product_id, coalesce(p.name, si.product_name)
order by units_sold desc;
```
Notes: `pos_sale_items` carries denormalised `product_name`, `product_sku`, `unit_price`, `line_total`, **`cost_price`** (per-line cost snapshot — useful for true margin), and `returned_quantity`. Because `product_id` is `ON DELETE SET NULL`, always `coalesce` to `product_name` so deleted products still count.

---

## 3. STOCK VALUE INPUTS — cost columns (corrects the brief)

`pos_products` cost/stock columns (Sip, n=74):

| column | type | populated (Sip) | verdict |
|---|---|---|---|
| `cost` | numeric | **0 / 74** (`>0`) | **dead** — all zero |
| `cost_price` | numeric | **72 / 74** (`>0`) | **LIVE / canonical cost** |
| `cost_price_cents` | integer | 0 / 74 | dead |
| `stock_quantity` | integer | 74 / 74 set | canonical (sale RPC decrements this) |
| `current_stock` | integer | 74 / 74 set | parallel/secondary (never touched on sale) |
| `price` | numeric | (selling price) | live |

**Correction:** stock-value-at-cost is **not** fully blocked — `cost_price` exists for 72/74 products and `pos_sale_items.cost_price` snapshots per-line cost. **INV-COST-1 should standardise on `cost_price`**, backfill the 2 missing products, and deprecate the dead `cost`/`cost_price_cents` columns — rather than assume costs must be entered from scratch. (`costing_method` CHECK = `average|fifo|lifo|standard`.)

---

## 4. FRAGMENTATION MAP (Sip row counts; canonical-vs-dead)

| concern | table | total rows | Sip rows | verdict |
|---|---|---:|---:|---|
| **movements** | `stock_movements` | 118 | 92 (63 `sale`) | live but **incomplete** (see #1); `item_id` text, no FK, **no actor** |
| **mobile stocktake** | `mobile_inventory_sessions` | 19 | 3 | **live** (mobile count app; `submitted_by`) |
| **stock adjustments** | `pos_stock_adjustments` | 0 | 0 | cold scaffold (`adjusted_by`) |
| **stocktakes (dupe)** | `pos_stock_takes` | 0 | 0 | **CANONICAL** — referenced in code (briefing, stocktake-intelligence, `pos/stock-takes`); `started_by`, `items_counted` |
| | `pos_stocktakes` | 0 | 0 | **DEAD** — only in generated types, no code |
| stocktake items | `pos_stock_take_items` | 0 | — | canonical (pairs with `pos_stock_takes`) |
| | `pos_stocktake_items` | 0 | — | dead |
| **waste (3 logs — NOT true dupes; different surfaces)** | `pos_waste_log` | 0 | 0 | POS counter waste — `pos/waste`, `expiry-alerts` (`recorded_by`) |
| | `recipe_waste_log` | 0 | 0 | recipe/prep waste — `recipes/waste*` |
| | `waste_log` | 0 | 0 | AI waste-agent — `agents/waste/*`, waste-elimination-agent |
| **reorder settings (dupe)** | `reorder_settings` | 0 | 0 | **CANONICAL** — referenced (`aria/reorder-settings`, `aria/weekly-order`); UNIQUE(business_id) singleton |
| | `pos_reorder_settings` | 0 | 0 | **DEAD** — only in types |
| reorder schedules | `pos_reorder_schedules` | 0 | 0 | cold |
| reorder forecasts | `reorder_forecasts` | 11 | **8** | **live** (Sip data present) |
| **purchase orders (3-way fragmented)** | `purchase_order_drafts` | 17 | **11** | **live for Sip** (draft PO path) |
| | `pos_purchase_orders` (header) | 9 | 0 | live for other businesses, 0 Sip |
| | `pos_purchase_order_lines` | 2 | 0 | **orders engine** (`lib/orders/*`, run-scheduled-reorders); has business_id |
| | `pos_purchase_order_items` | 4 | — | **AI-agent PO path** (`lib/pos/agent-executor`, `pos/agents`); no business_id |
| **outlet stock (dupe)** | `pos_outlet_inventory` | 91 | **74** | **CANONICAL** — 1 row/product; `items_on_hand`, `items_reorder_level`; read by inventory/Aria views |
| | `pos_outlet_stock` | 0 | 0 | **DEAD** — no code references |
| transfers | `pos_inventory_transfers` / `pos_inter_outlet_transfers` | 0 | 0 | cold |

**Canonical verdicts:** stocktakes → **`pos_stock_takes`** (+`_items`); reorder settings → **`reorder_settings`**; outlet stock → **`pos_outlet_inventory.items_on_hand`**. The three waste logs are **scoped to different features**, not redundant — a later sprint should document the scoping rather than merge blindly. PO data is split across `purchase_order_drafts` (Sip-live) + `pos_purchase_order_lines` (orders engine) + `pos_purchase_order_items` (agent) — needs a unification decision before any PO sprint.

**Three-stock-figure hazard:** `pos_products.stock_quantity` (sale-decremented), `pos_products.current_stock` (parallel), and `pos_outlet_inventory.items_on_hand` (what views read) are independent and unsynchronised. INV-DECREMENT-FIX must pick ONE canonical figure (recommend `pos_products.stock_quantity` as the system-of-record the RPC already maintains) and define how `pos_outlet_inventory` mirrors it.

---

## 5. PAR / REORDER READINESS

`pos_products` (Sip, n=74): `reorder_point > 0` → **0**; `target_stock > 0` → **0**; `reorder_qty > 0` → **0**; `low_stock_threshold > 0` → **74** (all set). `reorder_settings` (global) = 0 rows; `pos_reorder_schedules` = 0.

→ Per-product PAR is empty; only a flat `low_stock_threshold` exists (usable as a weak starter signal). **The reorder engine cannot fire on PAR until INV-PAR-1** populates `reorder_point`/`target_stock`/`reorder_qty` (and/or seeds `reorder_settings`). `reorder_forecasts` already has 8 Sip rows — confirm whether that feeds the engine or is advisory.

---

## 6. VELOCITY READINESS

`product_performance_scores` **exists**, **0 rows** (total and Sip) → clean target for **INV-VELOCITY-1**. Rich columns already defined: `units_sold_this_period`, `units_sold_baseline_same_period`, `velocity_vs_avg`, `margin_pct`, `margin_dollars_per_unit`, `margin_score`, `halo_score`, `halo_products[]`, `halo_avg_copur_margin`, `composite_score`, `performance_tier`, `recommended_grid_position`, `recommended_upsell_product_id`, `recommended_bundle_product_id`, `recommended_bundle_price`, `revenue_4h_before/after_change`, `recommendation_outcome`. **Upsert key:** `UNIQUE (business_id, product_id, scored_at)`. Units must be sourced from `pos_sale_items` (§2), not `stock_movements`.

---

## 7. ATTRIBUTION GAP (for INV-STAFF-APP)

`stock_movements` has **no actor/staff column** (highest-volume table, no attribution). Actor columns that DO exist elsewhere:

| table | actor column |
|---|---|
| `mobile_inventory_sessions` | `submitted_by` |
| `pos_stock_adjustments` | `adjusted_by` |
| `pos_stock_takes` | `started_by` |
| `pos_waste_log` | `recorded_by` |
| `pos_outlet_inventory` | `last_counted_at` (timestamp only, no who) |

→ Attribution is inconsistent (`submitted_by`/`adjusted_by`/`started_by`/`recorded_by`) and absent on the movement ledger. INV-STAFF-APP should standardise a single actor convention and add attribution to `stock_movements`.

---

## 8. CONSTRAINT CATALOGUE (paste-ready for future specs)

### `pos_products`
- **PK** `(id)`
- **FK** `business_id` → `businesses(id)` ON DELETE CASCADE · `category_id` → `pos_categories(id)` SET NULL · `supplier_id` → `pos_suppliers(id)` SET NULL · `tax_code_id` → `pos_tax_codes(id)` SET NULL · `agent_bundle_product_id`/`agent_upsell_product_id` → `pos_products(id)` SET NULL
- **CHECK** `costing_method ∈ {average,fifo,lifo,standard}` · `shelf_life_days IS NULL OR >= 0` · `course_type ∈ {appetiser,entree,main,side,dessert,beverage,special}` (nullable) · `performance_tier ∈ {star,plowhouse,puzzle,dog,normal}`
- **No UNIQUE on SKU** (no business_id+sku uniqueness — dedupe not DB-enforced).
- Stock cols: `stock_quantity`(int, sale-decremented, canonical) · `current_stock`(int, parallel) · cost: `cost_price`(numeric, live) / `cost`(dead) / `cost_price_cents`(dead) · PAR: `reorder_point`,`target_stock`,`reorder_qty`,`max_stock`,`low_stock_threshold`(int) · `track_stock`(bool).

### `stock_movements`
- **PK** `(id)` · **FK** `business_id` → `businesses(id)` CASCADE.
- **No FK on `item_id`** (text, holds `pos_products.id` as text). **No CHECK on `movement_type`** (free text; code uses `'sale'`). **No UNIQUE. No actor column.**
- Cols: `id, business_id, item_id(text), movement_type(text), quantity_added(int, negative on sale), new_stock(int running balance), notes, scanned_at, created_at`.

### `pos_sale_items` (source of truth for units)
- **PK** `(id)`
- **FK** `sale_id` → `pos_sales(id)` CASCADE · `product_id` → `pos_products(id)` **ON DELETE SET NULL** (⚠ coalesce to `product_name`) · `business_id` → `businesses(id)` CASCADE · `batch_id` → `pos_product_batches(id)` SET NULL · `price_override_by` → `auth.users(id)` SET NULL · `tax_code_id` → `pos_tax_codes(id)` SET NULL
- Key cols: `product_id(uuid)`, `quantity(int)`, `returned_quantity(int)`, `unit_price`, `line_total`, `cost_price`(numeric per-line), `product_name`, `product_sku`, `business_id`, `sale_id`, `created_at`. No CHECK.

### `product_performance_scores` (INV-VELOCITY-1 target)
- **PK** `(id)` · **UNIQUE `(business_id, product_id, scored_at)`** ← upsert key
- **FK** `business_id` → `businesses(id)` CASCADE · `product_id` → `pos_products(id)` CASCADE · `recommended_upsell_product_id`/`recommended_bundle_product_id` → `pos_products(id)` SET NULL
- **CHECK** `performance_tier ∈ {star,plowhouse,puzzle,dog,normal}` · `recommendation_outcome ∈ {positive,negative,neutral,unmeasured}`

### `reorder_settings` (canonical reorder config)
- **PK** `(id)` · **UNIQUE `(business_id)`** ← one settings row per business (global, not per-product)
- **FK** `business_id` → `businesses(id)` CASCADE
- **CHECK** `velocity_period ∈ {day,week}`

### `pos_sales` (join/filter for §2)
- Status values observed: `completed`, `voided`, `draft`, `refunded`. Filter `status = 'completed'`. Cols of note: `source`(text, NULL on seeded data), `order_type`, `original_sale_id`(uuid, for refunds), `customer_id`, `total_amount`, `created_at`.

---

## Revised build-order recommendation

1. **INV-DECREMENT-FIX (early, blocking)** — one shared decrement+movement helper across all sale paths; pick the canonical stock figure (`pos_products.stock_quantity`) and define `pos_outlet_inventory` mirroring; add a `movement_type` CHECK; (optionally) backfill movements from `pos_sale_items` so historical variance is computable. *Until this lands, every variance/shrinkage report is untrustworthy.*
2. **INV-COST-1** — standardise on `cost_price` (live, 72/74), backfill the 2 gaps, deprecate dead `cost`/`cost_price_cents`; unlock stock-value-at-cost + true margin (using `pos_sale_items.cost_price`).
3. **INV-VELOCITY-1** — populate `product_performance_scores` from `pos_sale_items` (§2), upsert on `(business_id, product_id, scored_at)`.
4. **INV-PAR-1** — populate per-product `reorder_point`/`target_stock`/`reorder_qty` (+ `reorder_settings`); wire the reorder engine; confirm `reorder_forecasts` role.
5. **INV-STAFF-APP** — standardise actor attribution; add an actor column to `stock_movements`.

*Audit only — no code paths were modified.*
