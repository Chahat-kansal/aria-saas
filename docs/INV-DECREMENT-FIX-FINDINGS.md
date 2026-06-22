# INV-DECREMENT-FIX — Phase 1 findings (investigate + centralise logging)

**Date:** 2026-06-22 · **Scope:** Sip (`ff5055a0-c351-4ada-817a-1804961035f3`). Phase 1 = investigation (read-only) + a **logging-only, behaviour-preserving** shared-helper refactor. **Reconciliation (choosing the canonical stock field) is HALTED for founder sign-off → Phase 2.**

> Two brief premises were corrected by the trace: (a) the non-`pos/sale` paths do **not** "decrement without logging" — most **don't decrement at all**, and online-orders/laybys don't even create product lines; (b) `current_stock` is not a generic parallel field — it is written by **exactly one** path (the Square webhook).

---

## STEP A.1 — Sale-completion path × {decrements?, field written, movement logged?}

| path | creates `pos_sale_items` lines? | decrements stock? | stock field(s) written | movement logged (before) | movement logged (after Phase 1) |
|---|---|---|---|---|---|
| `pos/sale/route.ts` (singular) | ✅ completed | ✅ | `pos_products.stock_quantity` (RPC) | ✅ (inline) | ✅ via shared helper (+sale_id, idempotent) |
| `pos/sales/route.ts` (plural) | ✅ completed | ✅ | `pos_products.stock_quantity` **+** `pos_outlet_inventory.items_on_hand` | ❌ | ✅ **added** via helper |
| `pos/sync-offline/route.ts` | ✅ completed | ❌ **none** | — | ❌ | ✅ **added** (no decrement; idempotent for replay) |
| `pos/online-orders/[id]/route.ts` (create_sale) | ❌ header-only sale | ❌ | — | ❌ | n/a — **no product lines** to log |
| `pos/laybys/route.ts` (complete) | ❌ header-only sale | ❌ | — | ❌ | n/a — **no product lines** |
| `pos/splits/ocr/from-scan/route.ts` | ⚠️ DRAFT, items have **no `product_id`** | ❌ | — | ❌ | n/a — draft + no product id |
| `pos/sales/draft/route.ts` | ⚠️ DRAFT (not completed) | ❌ | — | ❌ | n/a — not a sale yet |
| `pos/sales/[id]/void` · `…/refund` | reversal | ✅ **increments** `stock_quantity` back | `pos_products.stock_quantity` | ❌ | out of scope (reversal, Phase 2) |

**Net:** only **three** paths create completed, product-lined sales (`pos/sale`, `pos/sales`, `sync-offline`). All three now log to `stock_movements` via the shared helper. The header-only (online-orders, laybys) and draft (splits, draft) paths record **no product lines at all** — they are invisible to *both* the units-sold source of truth (`pos_sale_items`) and the movement ledger; flagged for Phase 2.

**Why coverage was ~8% (reconfirmed):** `pos/sales` (which maintains `items_on_hand`) and `sync-offline` decremented/sold without ever writing `stock_movements`, and the bulk of Sip rows are seeded straight into `pos_sales`/`pos_sale_items` (bypassing every route). Phase 1 closes the *live-traffic* logging gap; historical seeded rows remain unlogged (a backfill is a Phase 2 option).

---

## STEP A.2 — True relationship between the three stock figures (write-path grep)

| field | written by | read by | reality on Sip |
|---|---|---|---|
| `pos_products.stock_quantity` | `decrement_stock_quantity` RPC (pos/sale, pos/sales); `increment_numeric` on void/refund | **POS product grid / product list** (`pos/products` L48,66); low-stock alert in pos/sale | seeded ~**995–999**, lockstep with `current_stock` |
| `pos_products.current_stock` | **ONLY** the Square webhook (`integrations/square/webhook` L60 `.update({ current_stock })`) | Aria DTO/forecast fields (mostly *labelled* current_stock but *sourced from* stock_quantity) | seeded == `stock_quantity`; **frozen** (Sip isn't Square-connected) |
| `pos_outlet_inventory.items_on_hand` (per-outlet) | pos/sales (sale), outlet-transfers, transfers/transition, orders/receive (receiving), stock-takes, mobile-session/submit, inventory adjust | **inventory view** (`pos/inventory`), **Aria intelligence** (business-context, deliverables, email-report) | realistic ~**45–50** |

- **No trigger / generated column links them.** `current_stock` and `stock_quantity` are plain columns; they're only equal because both were seeded equal and **nothing updates `current_stock` for non-Square businesses**.
- `items_on_hand` is **independent** and is the only realistic figure. The singular `pos/sale` path does **not** touch it; the plural `pos/sales` path does.
- Live evidence (8 products): `stock_quantity == current_stock` on every row (995/998/997…), while `items_on_hand` = 45–50. One product (`Avocado Smoothie`) shows `stock_quantity = 9` — a stray real decrement — proving the fields drift the moment real activity hits one but not the other.

---

## STEP A.3 — Which field the UI/reports actually READ

**Split brain:**
- **Cashier-facing** POS product grid + product list → `pos_products.stock_quantity` (shows seed junk ~1000).
- **Manager-facing** inventory view + **Aria** intelligence/insights/emails → `pos_outlet_inventory.items_on_hand` (realistic ~45–50).
- Low-stock alerts (pos/sale) → `stock_quantity`.

→ The cashier and the manager/AI are looking at **different numbers for the same product**. This, not just the movement gap, is why variance/shrinkage is untrustworthy.

---

## STEP A.4 — Per-outlet structure (multi-location implication)

`pos_outlet_inventory` is keyed per **(product, outlet)** — it has `outlet_id`, plus `items_on_hand`, `items_reorder_level/amount/limit/max`, `cases_*`, `last_item_cost`/`item_cost`, `last_received_at`, `last_counted_at`. Sip = **1 outlet → 74 rows (1:1 with products)**. For a **multi-outlet** business it is **N rows per product** (one per outlet).

`pos_products.stock_quantity` is a **single scalar per product** → it **cannot represent per-outlet stock**. Therefore, for multi-location correctness, the per-location source of truth **must** be `pos_outlet_inventory.items_on_hand`; `stock_quantity` can at best be a roll-up/cache.

---

## STEP B — What shipped this phase (logging-only, behaviour-preserving)

- **Migration** `20260622205916_stock_movements_sale_ref.sql` (additive): `stock_movements.sale_id uuid` (nullable) + partial unique index `(sale_id, item_id) where sale_id is not null and movement_type='sale'`. Existing 118 rows unaffected (sale_id NULL).
- **Helper** [`src/lib/inventory/record-sale-movement.ts`](../src/lib/inventory/record-sale-movement.ts): `recordSaleMovements(supabase, {businessId, saleId, saleNumber, lines})`. Idempotent per sale (skip if the sale already has rows + the unique index as a race backstop). Fills the NOT-NULL `new_stock` from the caller's post-decrement value, else snapshots current `stock_quantity`. `SALE_MOVEMENT_TYPE` constant (no DB CHECK, to avoid rejecting unaudited warehouse insert paths). Never throws.
- **Wired:** `pos/sale` (refactored inline→helper, same rows + now sale_id/idempotent), `pos/sales` (added — previously decremented without logging), `sync-offline` (added — completed offline sales, replay-safe).
- **Explicitly NOT changed:** which field anyone decrements. `pos/sale` still hits `stock_quantity`; `pos/sales` still hits `stock_quantity` + `items_on_hand`. No reconciliation. No reads repointed.

---

## STEP C — Canonical-field RECOMMENDATION (then HALT — no code)

**Recommended canonical stock field: `pos_outlet_inventory.items_on_hand`.**

Evidence:
1. **Only realistic values** (45–50); `pos_products.stock_quantity`/`current_stock` are seed-polluted (~1000) and drift.
2. **Multi-location correct** — per-outlet by design; `stock_quantity` (single scalar) structurally cannot be the truth for >1 outlet (A.4).
3. **Already the operational read** for the inventory view + all Aria intelligence (A.3).
4. **Richest model** — carries per-outlet reorder levels, item/case costs, and received/counted timestamps (feeds INV-PAR-1 + INV-COST-1 too).
5. `current_stock` is **Square-only** (A.2) → leave it to the Square integration, exclude from the canonical path.

### Reconciliation plan (Phase 2 — DO NOT implement until approved)
1. **Decrement target → `items_on_hand`** (outlet-scoped) in every line path: `pos/sale` must resolve the outlet and decrement `items_on_hand` (it currently doesn't touch it); `sync-offline` must decrement; `pos/sales` already does. Reversals (void/refund) must `increment` `items_on_hand`.
2. **Repoint the POS grid read** (`pos/products`) from `stock_quantity` → outlet-scoped `items_on_hand`, so cashier and manager/AI finally agree.
3. **Decide `stock_quantity`'s fate** (founder choice): (a) keep as a **denormalised cache = Σ items_on_hand across outlets**, trigger-maintained, for backward-compat with its many readers; or (b) **deprecate it for stock** and migrate all readers to `items_on_hand`. Recommend (a) to avoid touching dozens of readers in one sprint.
4. **Seed junk** — re-baseline / null out `stock_quantity` & `current_stock` (~1000) so nothing trusts them; rebuild from `items_on_hand` or a fresh stocktake. Optionally backfill historical `stock_movements` from `pos_sale_items` for variance history.
5. **Multi-outlet plumbing** — the main refactor risk is paths that lack an outlet context (`pos/sale` resolves none today; `sync-offline` offline items carry none). Phase 2 must thread an outlet id through every write.
6. **Movement `new_stock`** — once all paths decrement `items_on_hand`, the helper should record the post-decrement `items_on_hand` (not `stock_quantity`) as the running balance.

**HALTED.** Awaiting founder approval of the canonical field (`items_on_hand`) before writing the Phase 2 reconciliation migration + decrement repointing.

---
*Phase 1 changed logging only. No stock field's decrement behaviour was altered.*
