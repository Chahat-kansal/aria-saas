# RUN LOG — MEGA-SPRINT 8 · COST-TRUTH + CI-FIXTURE

**Autonomous run under RULE 20.** Completed 2026-08-19.

---

## SUMMARY

**Phases done: 6 of 6 · Parked: 1 item (tier reordering — money) · Commits: 6**

| phase | outcome | commit |
|---|---|---|
| 1 · one cost column | done — both `cost` readers rerouted | `c497df6f` |
| 2 · provenance tiers | done — the dead PO tier now reads the table with data | `6fae56cb` |
| 3 · threshold disclosure | done — per-business wording | `4f9a59d6` |
| 4 · confirm the divergence | done — plus a fourth gap | `04cbc894` |
| 5 · deterministic fixture | done — explicit, complete, seed-owned | `44a79f25` |
| 6 · score the predictions | done — 1 supported, 1 wrong, 2 unscored | *(this commit)* |

### The three things you most need to know

**1. 🚩 Your margins are overstated, and fixing it is parked on your call.** The only four products
with a real purchase price all cost MORE than the catalogue figure the system reports (Turmeric
Latte $3.20 actual vs $2.40 catalogue; Cortado $2.70 vs $1.80; Apple Juice $2.50 vs $2.40; Still
Water $2.00 vs $1.60). The resolver consults the catalogue estimate before the recorded
transaction, so the estimate wins every time. Reordering those tiers is a money change across 65
reader sites — parked per the decision table, and it is the most consequential item in Block A.

**2. Two features that looked alive have never worked, and both are now honest.** The low-margin
detector filtered on `pos_products.cost` — a non-null ZERO on every product — so it has never
flagged anything; it now reads real costs (and finds nothing at Sip, correctly: no product is
under 20% margin). The resolver's purchase-order tier queried a table with 0 rows; it now reads
`pos_purchase_order_items`, where the 5 real costs live, scoped through the parent order so no
tenant leak.

**3. CI now runs against a fixture that exists on purpose.** e2e pins `…0001`, smoke pins `…0101`,
the seed creates outlet + register + open session + onboarding, and the newest-owned-business
heuristic warns if it ever decides again. First run on the new fixture: still red at the spec step
with all infrastructure green — expected; which specs moved needs the run artifact, and that is
the next sprint's question, not this one's.

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

**Commit:** `6fae56cb`

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


---

## PHASE 3 — THE THRESHOLD DISCLOSURE

**Commit:** `4f9a59d6`

### Built, not skipped — an honest per-business statement was possible

The brief allowed leaving the wording alone if no honest per-business version existed. One does:
`resolveCostBatch` already returns a tier per product, so the mix is computable at the moment the
disclosure is shown.

**Before** (true, but a claim about the world):
> "…measured in units because recorded costs are catalogue estimates, not verified purchase costs."

**After** (true, and about the owner's own data):
> "…measured in units, not dollars, because of your 74 products 72 catalogue estimates, 2 with no
> cost recorded — a dollar threshold built on estimates would be a confident figure nobody has
> verified."

The difference is operational, not cosmetic. The old sentence cannot distinguish *"you have no
costs"* from *"your costs are the wrong kind"*, and those imply completely different next actions —
data entry versus receiving deliveries against purchase orders.

### Kept pure
`thresholdDisclosureFor(mix)` takes a mix rather than a businessId, so the wording is testable
without a database and a policy module cannot quietly start issuing queries. `stocktake.ts` computes
the mix **once per submit** — it is a property of the business, not of the count — using the same
resolver the valuation panel uses, so the two can never disagree.

**Falls back to the original wording** when the mix is unavailable or the business has no products.
A disclosure reading "of your 0 products" would be worse than the generality it replaced, and a
failed lookup must never fail a stocktake submit. Both asserted.

### The threshold itself is unchanged
Still 5 units or 10%. This phase changed the sentence describing the policy, not the policy. The
all-verified branch says a dollar threshold *becomes possible* and names INV-COST-1, while stating
explicitly that it is **still measured in units** — asserted, so a future edit cannot let the
sentence claim a switch that has not happened.

### Mutation
| mutation | result |
|---|---|
| ignore the mix, always return the static wording | 4 red |
| emit empty tiers as "0 verified" | 1 red |

Restored → 9/9 green. GROUNDING-TEETH re-asserted: no branch contains a dollar sign.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 322/322 (28 files).

### Parked
None.


---

## PHASE 4 — CONFIRM THE DIVERGENCE

**Commit:** `04cbc894` · appended to `docs/aria/CI-TRIAGE-2.md` as §11.

Every CI-TRIAGE-2 claim re-verified true against today's code and DB — resolver still
newest-owned, seed still `…0001`-only, `TEST_BUSINESS_ID` absent from both workflows, and the two
businesses exactly as described (including the orphaned session). **Plus a fourth gap §3 never
named: the seed creates NONE of the state the specs need** — zero references to outlets, registers,
sessions or `onboarding_complete`. Even pointing the resolver at the seeded business would not have
worked. Target end-state declared: separate fixtures per suite, seed owns everything, explicit
resolution.

## PHASE 5 — MAKE THE FIXTURE DETERMINISTIC

**Commit:** `44a79f25`

- `test-business.ts` — `TEST_BUSINESS_ID` wins outright; the newest-owned heuristic survives only
  as a warning-emitting last resort for local runs.
- `e2e.yml` pins `…0001`; `smoke.yml` pins `…0101`. **Separate fixtures per suite** — sharing one
  is what let a smoke sprint silently repoint the e2e suite.
- `seed.ts` now creates `onboarding_complete`, an outlet, a register, and an **open cash session**
  (re-opened each run — a prior suite run may have closed it), all as fixed-UUID idempotent
  upserts. The fixture no longer depends on residue.
- Fixture state applied live via MCP (test-fixture data on an `is_test` business, per the decision
  table) and verified: onboarding true / 1 outlet / 1 register / 1 open session on `…0001`.
- The orphaned `…0101` session was **not** touched — it is the smoke suite's input now, and closing
  it unattended would change smoke results in the same commit that changed e2e resolution.

**Verify, honestly:** the Playwright suite cannot run in this environment (credentials live only in
CI). The first observed run on `44a79f25`: `e2e-local` **still failure**, every infrastructure step
green, only the spec step red — exactly what the decision table said to expect. Which individual
specs moved requires the run artifact; chasing them is its own sprint.

## PHASE 6 — SCORE THE PREDICTIONS

**Commit:** *(this commit)* · appended to `docs/aria/CI-TRIAGE-2.md` as §12.

P1 **supported, not proven** (infra green + spec step red is consistent with working login; not
conclusive). P2 **wrong in the original, right in the §10b amendment** — the register never gated
anything; the orphaned session was the unblocker. P3 **unscored** (no spec-level artifact). P4
**unscored and now untestable as posed** — phase 5 deliberately removed the shared-resolver
mechanism the prediction depended on, which is a better outcome than either verdict.
