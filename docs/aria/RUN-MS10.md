# RUN-MS10 — COST RAIL + ORDER DRAFTING (autonomous, 2026-08)

## Summary (read this first)

**All six phases done. Nothing parked. Six commits, pushed.**

| Phase | What | Commit |
|---|---|---|
| 1 | Rail: `direct-cost-read` guard rule + named 53-file allowlist | `e0f6bc7a` |
| 2 | LLM routes (price-check, product-insights, price-intelligence) → resolver, tier in prompt | `532103b9` |
| 3 | Hypothesis files (counterfactual, generate) → resolver | `a15015ad` |
| 6 | `draftTotals()` — unknown-cost lines counted, never summed as zero | see below |
| 5 | Owner `action:'draft'` on the reorder route — drafts only, send path test-forbidden | see below |
| 4 | Dead "Order N" button wired (one supplier-grouped draft action), no dead controls remain | see below |

**Allowlist: started 53 → ended 48.** Every remaining direct `cost_price` reader is named in
`COST_READ_ALLOWLIST` in `scripts/canon-rail-guard.ts`; new direct reads fail CI. Next candidate
flagged: `pos-chat`.

**Three things Chahat most needs to know:**
1. **48 files still read the fabricated column directly** — the rail stops NEW ones and the list
   only shrinks, but until the batches continue, surfaces off the rail (including `pos-chat`) can
   still quote the price×0.4 figure while migrated surfaces tell the truth. The two-answers
   problem is contained, not finished.
2. **Draft POs from the dashboard are live but nothing can send** — the "Draft purchase orders"
   button creates status-`'draft'` POs grouped by supplier; approval/spending stays behind the
   money-gated buying flow. A test turns red if anyone wires a send path into the owner route.
   Items with no supplier are reported in the response, not drafted — assigning suppliers is the
   owner action that unlocks them.
3. **PO totals now say what they cover** — a draft with unpriced lines stores a priced-lines-only
   total and discloses the unpriced count in its notes; an all-unpriced draft has no total at
   all. Anywhere else that displays `pos_purchase_orders.total` as if complete predates this rule.


---

## Phase log

### Phase 1 — THE RAIL (commit `e0f6bc7a`)
`scripts/canon-rail-guard.ts` gained rule `direct-cost-read`: any ADDED line selecting
`cost_price` in a file NOT on the named `COST_READ_ALLOWLIST` fails the guard. The allowlist is
explicit and named (not a blanket grandfather) so shrinkage is measurable — **it started at 53
files**, every current direct reader listed by path. `resolve-cost.ts` and `stock-value.ts` are
EXEMPT (they ARE the rail). Verified both directions with a probe file: un-allowlisted new read →
red; allowlisted/exempt → pass.

**Finding recorded in the commit:** the first mutation-proof attempt silently failed to apply
(inline-python escape mangling — the probe "fired" on both runs, proving nothing). Redone with an
exact-match file script that asserts the needle before writing. A check that fails to fail is the
finding.

### Phase 2 — LLM ROUTES FIRST (commit `532103b9`)
Migrated the three routes that put cost/margin INTO a model prompt:
- `api/aria/price-check` — `resolveCostFor`, tier label interpolated into the prompt
  (`from your purchase order` / `estimated` / `unknown — no cost recorded`), margin null-guarded,
  model told to hedge estimated/unknown margins. Response gains `cost_source`/`cost_grounding`.
- `api/aria/product-insights` — same; the fabrication guard's allowed-numbers list no longer
  smuggles `Number(cost_price) || 0` (a whitelisted zero) — cost and margin push conditionally.
- `api/aria/price-intelligence` — `resolveCostBatch` once per cart (3 queries, not N+1);
  below-cost and sub-10%-margin alerts now compare against resolved cost. Against the raw
  fabricated column those alerts could mathematically never fire (margin was always 60%).

Allowlist 53 → 50. Tests: `llm-cost-migration.test.ts` (10 assertions incl. the Cortado
end-to-end datum: PO $2.70 beats fabricated $1.80).

### Phase 3 — THE REST, IN BATCHES (commit `a15015ad`)
Batch 2: both hypothesis files (`counterfactual.ts`, `generate.ts`) onto `resolveCostBatch`.
generate's low-margin detector — revived once in MS8 from the always-zero `cost` column — was
still dead arithmetic against a definitionally-60% margin; it now filters on resolved cost and
skips unknowns. counterfactual's prompt samples carry `cost_basis` per product.

Allowlist **50 → 48**. Stopped at the natural boundary per the decision table (~20-file cap never
approached; the remaining 48 are named in `COST_READ_ALLOWLIST`, `pos-chat` flagged as the next
candidate). MS8's assertions in `cost-canonical.test.ts` were rewritten, not deleted — they
asserted the exact shape this phase removes, with the why recorded in the test file.

### Phase 6 — HONEST TOTALS (built before 4/5; commit order explains)
`createDraftPO` summed `Number(unit_cost) || 0` — an unknown-cost line contributed **$0.00 to a
stored header total the owner is asked to approve**. New pure `draftTotals()` in
`src/lib/inventory/buying.ts`:
- total covers PRICED lines only; unpriced lines are counted, never zeroed in
- an all-unpriced draft has NO total (null) — $0.00 there is a claim, not a measurement
- `unit_cost === 0` is treated as unknown (the non-null zero is how the MS8 fabrication started)
- the PO's `notes` disclose "N of M lines have no recorded cost — total covers priced lines only"
- `createDraftPO` returns `unpriced_lines` so every caller can surface it beside the total

Mutation: re-introduce the `|| 0` sum → 3 tests red. Confirmed, restored.

### Phase 5 — DRAFT, DON'T SEND
**The engine already existed** — `reorderSuggestions` (supplier-grouped BuyGroups, quantities from
par/velocity, per-line cost + provenance tier) and `createDraftPO` (status `'draft'`), built for
the staff buying app. Fourth instance this sprint-series of the requested feature already being
present (failure pattern #3). What was missing was an owner-side entry: added `action: 'draft'` to
`POST /api/pos/inventory/reorder` — drafts one PO per supplier group via the SAME engine, returns
order numbers/totals/unpriced counts, and reports `items_needing_supplier` rather than silently
dropping them.

**Nothing sends, spends, or contacts anyone.** `approveAndSendPO` remains the only exit from
draft, behind the money-gated approval in the buying flow. The brief's named mutation — "allow a
send path → red" — was run: importing `approveAndSendPO` into the route turned
`draft-po.test.ts` red. Tests also forbid any `'sent'` status literal and any outbound comms
surface (SMS/email/webhook/`fetch('http…')`) in the route.

### Phase 4 — THE DEAD BUTTON
`InventoryReorderPanel.tsx`'s per-row **"Order N" button had no onClick since the day it was
built** — it looked functional and did nothing. **Chose: wire, not remove** — phase 5's engine
already existed and this panel is its natural owner-side entry. But not per-row: drafting is
supplier-grouped (one PO per supplier covering the whole runs-out list), so per-row one-line POs
are not the designed flow. The dead button became a passive "needs N" quantity chip, and ONE real
"Draft purchase orders" button (header, only when items are below reorder) calls the new draft
action. The result line names each draft (`PO-… — supplier, N lines, $total (+M unpriced lines
not in the total)`) and states "Nothing has been sent — approve in the buying flow."

A structural test now requires every `<button>` on the panel to carry an `onClick`.

---

## Deviations & findings
- **Commit order 6 → 5 → 4** (after the P1–P3 commits): the route depends on `draftTotals`' new
  return shape and the panel depends on the route, so each commit compiles standalone.
  `draft-po.test.ts` lands with the last piece it asserts.
- **One test-vs-comment collision:** the route's comment named `approveAndSendPO` verbatim, which
  the string-scan no-send test correctly flagged; comment reworded so the token only appears if
  actually imported/called.
- **Build OOM (exit 134, heap limit)** on the first phase-4/5/6 build — no zombie node processes
  this time (checked; max 44 MB), so genuine pressure. Remedy: clear `.next`, sole rebuild with
  `NODE_OPTIONS=--max-old-space-size=6144`. Read from `BUILD_EXIT` in the log, per standing rule.
- **Nothing parked for DDL** — reused `pos_purchase_orders`/`pos_purchase_order_items` exactly as
  they exist (status CHECK already includes `'draft'`, verified live via MCP).
