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

**Commit:** *(recorded in phase 2's commit — never amend a pushed commit.)*

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
