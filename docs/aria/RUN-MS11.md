# RUN-MS11 — CLOSE THE COST STORY + BASE-UNIT MODEL (autonomous, 2026-08)

## Summary (read this first)

**All six phases done. Nothing parked. Six commits, pushed.**

| Phase | What | Commit |
|---|---|---|
| 1 | pos-chat + 3 inventory agents → resolver | `86c19124` |
| 2 | Older totals (reports, closure, dead-stock, page-insight, bundle-builder) state what they cover | `176418dc` |
| 3 | Owner disclosure: "N of your M costed products look derived from price" — live count, route to fix | see log |
| 4 | Base-unit model (`uom.ts`) from existing columns; duplicates tombstoned; replenishment on the canonical factor | see log |
| 5 | `pack_size_change` action — preview grid, nothing pre-ticked, writes ONLY the two pack columns | see log |
| 6 | Refuse-don't-guess: missing/ambiguous factor → named refusal, never a default of 1 | see log |

**Allowlist: started 48 → ended 42.** (48→44 in phase 1: pos-chat, guidance, owner-agent,
replenishment-agent; 44→42 in phase 2: reports/[type], bundle-builder.) `closure` and
`page-insight` remain allowlisted deliberately — their `cost_price` reads are sale-line/movement
**snapshots**, the correct historical source, not catalogue reads. Same for `reports.ts`
(pos_sale_items snapshot). Listed, not migrated.

**Three things Chahat most needs to know:**
1. **The valuation panel now tells you the cost story straight**: today it will say **72 of your
   72 costed products** have a cost that is exactly 40% of its sell price — derived, not
   recorded — plus 2 products with no cost at all. (The brief's "72 of 76" moved: the live count
   is 72/72 now, which is why the surface computes at render time instead of shipping a number.)
   Every margin on those products is 60% by construction. The fix path is the same per-product
   real-cost entry the panel already has; no auto-correction was built, per scope.
2. **The base-unit model is in before any pack data exists.** Stock/costs/recipes are base units;
   `purchase_uom` + `purchase_uom_qty` are the only live conversion pair; `items_per_case`,
   `case_quantity`, `cases_*`, `sell_uom` are tombstoned (columns intact per RULE 0, canonical
   code no longer reads them). A pack-size change writes only the two pack columns — proven
   against the live DB: changed 1→24 on a stocked, costed Sip product, every stored figure
   unchanged, reverted. **Caveat: CSV import mapping still writes the tombstoned columns** —
   a future import sprint should remap `case_quantity`/`items_per_case` entry onto the canonical
   pair, otherwise imported pack sizes will sit in columns nothing reads.
3. **Conversion refuses rather than guesses, today, on every product**: all 106 rows have a pack
   quantity but no pack unit, so `packConversion` refuses with the product's name and the exact
   gap. Nothing defaults to 1; replenishment simply doesn't case-round until a real pack is
   recorded (identical numbers to before, since every stored factor was the default 1).

---

## Phase log

### Phase 1 — POS-CHAT AND THE REMAINDER (commit `86c19124`)
Batch: `pos-chat` (named next at MS10's end) + the three inventory agents. pos-chat's prompt never
used cost; the real hazard was its create_order action writing `(cost_price ?? 0) * 100` cents
into `purchase_order_drafts` — fabricated ×0.4 at best, fabricated $0.00 at worst. Now batch-
resolved; totals cover priced lines only; all-unpriced totals stored as null. guidance's
dead-stock $ figure, owner-agent's "est. $ at risk" and replenishment's proposed totals all moved
to the resolver with unknowns counted and named. Response shapes preserved for cached-PWA
consumers (RULE 20 consumer test): `total_cost_cents` stays a number; additive
`unpriced_line_count` beside it. **Allowlist 48 → 44.**
Mutation: probe file with a new direct read → guard exit 1 (`direct-cost-read`). First attempt
piped the exit code away and proved nothing — rerun reading the exit directly; recorded.

### Phase 2 — THE OLDER TOTALS (commit `176418dc`)
Sweep of every surface summing cost-derived figures. Fixed: `reports/[type]` (stock value + COGS/
profit — resolver + `cost_unknown` per row + `uncosted_item_count`), `closure` (snapshot kept,
`uncosted_line_count` added), `dead-stock` (already resolver-backed via INTEL-COMPUTE-2 — pattern
#3 again; disclosure added), `page-insight` (snapshot kept; LLM told the $ figure's exclusions),
`bundle-builder` (REFUSES to price a bundle with an unknown-cost member — `?? 0` had understated
cost and overstated margin under a 25% margin floor; skipped bundles counted in the response).
All additive fields; no shape changes. **Allowlist 44 → 42.**
Mutation (the brief's): flatten unknown to 0 in two places → 2 tests red. Confirmed, restored.
**Listed, not fixed** (display/edit/import per decision table): product edit forms, CSV import,
price displays, `pos/products/[id]/page.tsx`'s history chart — the last carries a literal
`revenue * 0.6` fallback (GROUNDING-TEETH violation in a chart); left because a blind chart
change can't be render-verified here. Flagged for a UI sprint.

### Phase 3 — WHAT THE OWNER SEES ABOUT THEIR OWN COSTS
`summariseCostQuality()` in `resolve-cost.ts` (the rail file — exempt from its own guard):
live per-request counts of derived (×0.4-signature) and no-cost products. Additive
`cost_quality` on `GET /api/pos/inventory/cost`; amber banner on the valuation panel:
count + what it means ("margins are 60% by construction, not a measurement") + the fix route +
a show-only-derived filter. No auto-correction, no bulk edit, no guessed replacement.
VERIFY: live query 2026-08-21 returns derived=72, costed=72, no_cost=2 — matches what the
banner will render, and the count is computed at request time.
Mutation: hardcoding "72" into the banner → the no-literal-72 test went red. Restored.

### Phase 4 — ONE UNIT VOCABULARY
`src/lib/inventory/uom.ts`: base unit = `pos_products.unit` (populated); conversion pair =
`purchase_uom` + `purchase_uom_qty` (the brief's "factor with no unit attached" gets its unit
column). Tombstones by comment, RULE 0, no drops: `items_per_case`, `case_quantity`,
`cases_in_stock`, `sell_uom`, outlet `cases_*`, `warehouse_uom`. Replenishment-agent migrated off
both `items_per_case` reads (outlet + product) onto `packConversion` — behaviour identical today
(every stored factor was the default 1; refusal = no case rounding, not a guessed case).
VERIFY: round-trip test — 2 cartons × 24 → 48 base units in, 48 base units → 2 cartons out,
stored figure untouched. Numeric-string factors (Supabase numerics) accepted.
**Live-data contradiction recorded:** the brief said `items_per_case` populated on 0 rows; live
it is 106 rows — all the default 1, so the substance ("no real pack data") holds.

### Phase 5 — A PACK-SIZE CHANGE CANNOT REWRITE HISTORY
`applyPackSizeChange()` returns ONLY `{purchase_uom, purchase_uom_qty}` — the type is the
guarantee; a caller cannot propagate the change into stock or cost because the patch doesn't
contain them. Route action `pack_size_change` on `PATCH /api/pos/products/[id]`: returns the
per-outlet grid (stock / item cost / last cost — the Shopfront "Case Quantity Adjustments" grid)
as a PREVIEW; **nothing pre-ticked — without `apply: true` nothing is written** (the default
inverted from Shopfront's every-box-ticked, per the propose-approve rule). Apply writes the two
pack columns and reports `changed_fields`.
VERIFY (live, MCP): on a stocked, costed Sip product — pack 1→24; `stock_quantity`,
`cost_price`, `items_on_hand`, `item_cost` all byte-identical after; reverted; residue check 0.
Mutation: made the patch include `stock_quantity: qty * 12` (the Shopfront failure itself) →
the exact-keys test went red. Restored. NOT-SCOPE honoured: no bulk entry UI.

### Phase 6 — REFUSE, DON'T GUESS
`packConversion` refusals name the product and the exact gap. Tested against today's live shape
(`unit='each'`, `purchase_uom=null`, `purchase_uom_qty='1'` — all 106 rows): refusal with reason,
not a number. Never defaults to 1; never infers "24pk" from a name; zero/negative/non-numeric
refuse; refusals pass through `toBaseUnits`/`fromBaseUnits` unchanged; `applyPackSizeChange`
refuses empty units and non-positive quantities. The route's preview surfaces
`current_conversion` — today, a refusal with its reason, which is the honest state.

---

## Deviations & findings
- **Build self-poisoning (recorded):** wrote `uom.test.ts` into `src/` while the phase-3 build
  was running, then moved it out mid-build — the build had already enumerated it and failed with
  "root file not found" (BUILD_EXIT=1 while the wrapper notification claimed exit 0 — the
  wrapper's FOURTH misreport, this one in the opposite direction). Remedy: no `src/` writes while
  a build runs, ever — including new files. Rebuilt once over the combined tree.
- **`purchase_order_drafts.total_cost_cents` widened to null-able at the DB write** (pos-chat +
  replenishment, all-unpriced case): the JSONB/insert accepts it (column nullable, verified);
  the API response types keep numbers for cached consumers.
- Import writers still target tombstoned columns (see summary point 2). Listed, import domain
  untouched per the decision table.
