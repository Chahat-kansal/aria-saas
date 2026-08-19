# RUN LOG — MEGA-SPRINT 8 · COST-TRUTH + CI-FIXTURE

**Autonomous run under RULE 20.** Six phases. Started 2026-08-19.

*(Summary written at the top on completion.)*

---

## PREFLIGHT — THE SWEEP

The brief called the per-column reader/writer count "the number that matters most in the sprint".
Counted precisely: **reads** = the column named inside a `.select(...)` list; **writes** = the column
as a key in an `insert`/`update`/`upsert` payload. Across `src/` and `scripts/`, excluding the
generated `database.types.ts`.

| column | reads | writes | verdict |
|---|---|---|---|
| **`pos_products.cost_price`** | **65** | 8 | **CANONICAL** — already what almost everything uses |
| `pos_products.cost` | **2** | 4 | the fabricated zero. Both readers fixed in phase 1 |
| `pos_outlet_inventory.item_cost` | 4 | 4 | per-outlet; `resolveCostFor` tiers 1–2 |
| `pos_outlet_inventory.last_item_cost` | 4 | 5 | per-outlet |
| `pos_outlet_inventory.last_case_cost` | 1 | 0 | one reader (`orders/market-prices.ts`) |
| `pos_outlet_inventory.case_cost` | 0 | 1 | **write-only** |
| `pos_products.cost_price_cents` | 0 | 0 | **dead** |
| `pos_products.costing_method` | **0** | **0** | **dead in app code** — set on 106 DB rows, read by nothing |

**A first pass over-counted badly** (`\.cost\b` returned 82 hits) because it matched TS property
access on already-fetched rows, resolved-cost objects, staff-cost totals and warehouse item shapes.
Three near-misses worth naming, all ruled out by checking what table they touch:
`components/products/edit/tabs/SellCostTab.tsx` and `api/pos/products/[id]/route.ts:142` operate on
**price-set rows** (`price_set_id`, `outlet_id`, `quantity`), a different table with a same-named
column; `api/pos/price-points/route.ts` is `pos_price_points`. None is `pos_products.cost`.

**`costing_method` having zero readers decides phase 2**: provenance cannot be expressed through a
column nothing consults, so per the decision table phase 2 uses `resolveCostFor`'s existing tier
vocabulary rather than inventing a second one.

---

## PHASE 1 — ONE COST COLUMN

**Commit:** `c497df6f`

### Changes
- `src/lib/aria/hypothesis/generate.ts` — reads `cost_price`; low-margin filter rewritten.
- `src/lib/aria/hypothesis/counterfactual.ts` — reads `cost_price`; sends `null` for unknown.
- `src/lib/inventory/cost-canonical.test.ts` — new, 8 assertions, carrying the sweep table.

### The real damage was not a wrong number on a screen

**`generate.ts`'s low-margin detector has never fired.** It filtered
`p.cost && p.price && (price-cost)/price < 0.2`. `pos_products.cost` is a **non-null zero on all 74
of Sip's active products**, so `p.cost` was always falsy, the filter excluded every product, and the
detector reported "no low-margin products" for a business with 72 real costs in `cost_price`.
Failure pattern #1 — exists, looks correct, does nothing.

**`counterfactual.ts` fed an LLM "every product costs $0.00" as fact**, then asked it to reason
about impact in AUD. Any margin reasoning downstream was built on a fabricated input.

### ⚠️ HONEST LIMIT — the fix does not produce new findings on this data

Verified live after the change:

```
active products                          74
  with cost = 0 (the fabricated zero)    74      ← every one
  with a real cost_price                 72
  with a real cost                        0
  below 20% margin, now detectable        0      ← still none
```

The detector is now **capable** of firing and reads real figures, but **no Sip product is under 20%
margin**, so it still reports nothing — correctly this time rather than by accident. Nobody should
read this phase as "we surfaced low-margin products"; it removed a silent false negative.

### Unknown is unknown
A product with no known cost is now **skipped** by the margin filter rather than treated as
zero-cost — which would have flagged every uncosted product as a perfect-margin item, the same
fabricated-zero error in the opposite direction. Same rule INV-BASELINE-1 phase 3 established.

### Not done, deliberately
No column dropped (RULE 0), no backfill, no data writes. The four `cost` **writes** are untouched —
the column stays populated for anything legacy, it is simply no longer read.

`resolveCostFor` was **not** used for these two call sites: both are batch reads (40 products, and
all active products), and the resolver is per-product with up to five tier queries — routing them
through it would be an N×5 query fan-out on a cron path. Documented at the call site.

### Mutation
| mutation | result |
|---|---|
| point `generate.ts` back at `pos_products.cost` | 2 red |
| restore the falsy-cost filter (the dead detector) | 1 red |
| send `0` to the LLM instead of `null` | 1 red |

Restored → 8/8 green.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 303/303 (26 files).

### Parked
None.


---

## PHASE 2 — PROVENANCE TIERS

**Commit:** *(recorded in phase 3's commit.)*

### The display half was already built. I did not rebuild it.

Per RULE 20 (*"the work is already done → report and skip; never invent scope"*): `stock-value.ts`
already carries `cost_source` and `cost_grounding` per product, **excludes** unknown-cost products
from the at-cost total and counts them separately; `InventoryValuePanel.tsx` already renders
`TruthBadge`, a per-source chip, a source legend and a missing-cost callout. Nothing needed
inventing, and nothing was.

### What was actually broken: the tier backed by a real transaction was dead

`resolveCostFor`'s `purchase_order` tier queried **`pos_purchase_order_lines` — 0 rows**. The
system's only recorded purchase costs are **5 rows in `pos_purchase_order_items.unit_cost`**, a
different table. So the tier meant to represent an actual supplier transaction could never fire, and
a product with a real purchase price resolved to `unknown`.

Fixed on **both** paths — the single-product resolver *and* `resolveCostBatch`, which is what feeds
the valuation panel. Fixing only the former would have left the one surface that displays provenance
exactly as dead as before. `pos_purchase_order_lines` keeps precedence (richer vocabulary, newer
schema, unchanged behaviour if it ever gains rows); `items` is the fallback that has data today.
`items` has no `business_id`, so it is joined through `pos_purchase_orders` and filtered there —
querying it unscoped would leak another tenant's purchase prices into this business's costs.

### ⚠️ TWO HONEST LIMITS

**1. The fix changes nothing observable on today's data.** All 4 distinct products with a PO cost
*also* have a catalogue `cost_price`, and catalogue (tier 5) is consulted **before** the PO tier —
the PO fallback only runs when outlet and catalogue are both unknown. So the tier is now alive and
correctly scoped, but still does not fire for Sip. It removes a latent dead path, not a visible bug.

**2. 🚩 A real purchase price is losing to a manually-typed estimate — reported, NOT changed.**

| product | catalogue `cost_price` (estimated) | actual PO `unit_cost` | resolver reports |
|---|---|---|---|
| Turmeric Latte | $2.40 | **$3.20** | $2.40 |
| Cortado | $1.80 | **$2.70** | $1.80 |
| Apple Juice | $2.40 | **$2.50** | $2.40 |
| Still Water 600ml | $1.60 | **$2.00** | $1.60 |

Every real purchase price is **higher** than the catalogue figure the system uses — margins are
being reported better than they are, by 4–50%. Reordering the tiers so a recorded transaction
outranks a maintained estimate looks obviously right, **and I did not do it**: the decision table
says anything touching money is PARKED, and tier order governs every cost figure across 65 reader
sites. That is its own sprint with its own verification. **This is the single most consequential
thing in Block A.**

### The brief's "PO = verified" was not adopted — deliberately
The brief said a PO-derived cost should be **verified**. The resolver already classifies it
`derived`, with documented reasoning: a PO price is a real recorded price, but using it as *today's*
cost assumes nothing has changed since. That is a finer distinction than the brief's, and flattening
it would weaken an existing honest classification. Kept, and asserted in the test.

### Mutation
| mutation | result |
|---|---|
| collapse the tiers to one grounding | 2 red |
| revert the batch path to the empty table | 1 red |
| drop `business_id` scoping on the items join | 1 red |

Restored → 10/10 green.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 313/313 (27 files).

### Parked
Tier reordering (catalogue-before-PO) — money, per the decision table.
