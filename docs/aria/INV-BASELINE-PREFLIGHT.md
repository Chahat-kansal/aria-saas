# INV-BASELINE — code-side preflight

**MEGA-SPRINT 6 · PART 0. Diagnose only. No schema, no migration, no fix, nothing dropped.**

Written 2026-08-17 against `036954df`. Every DB figure below was re-run through Supabase MCP rather
than carried over from the DB preflight, per CLAUDE.md failure pattern #3 ("verify against live code
and the live database, never against a document"). Where the code and that preflight disagree it is
called out; the code wins.

**Headline: the sprint is inverted twice over.** Most of INV-BASELINE exists. But the problem is not
two stocktake systems — it is **three write paths against the *same* live table, two of which
implement opposite philosophies about whether a count may move stock.** The dead twin is the least
interesting thing here.

---

## Q1 · Which stocktake system does the app write to?

**`pos_stock_takes` / `pos_stock_take_items` is the only one with any callers at all.**

**`pos_stocktakes` and `pos_stocktake_items` have ZERO references in the entire codebase** — no
reads, no writes, no types, no scripts, no tests. Swept `src/`, `scripts/`, `e2e/`, `tests/`
(excluding the generated `database.types.ts`). Not "lightly used" — **completely unreferenced**, and
0 rows in both. They are inert.

Callers of the live pair, by surface:

| # | path | entry point | writes header | writes items | moves stock? |
|---|---|---|---|---|---|
| **A** | `src/app/api/pos/stock-takes/route.ts` | `dashboard/stocktake/page.tsx:79`, `pos/inventory/stocktake/new/page.tsx:107` | `:20` | `:28` | **YES — silently** |
| **B** | `src/lib/inventory/stocktake.ts` (INV-4 session engine) | `api/inventory/app/[slug]/stocktake/route.ts:65,70,75` ← staff app `inventory/[slug]/page.tsx:780` | `:48` | `:90-94` | no — review queue |
| **C** | `src/lib/inventory/count.ts` (`submitCount`) | `api/inventory/app/[slug]/count/route.ts:26` ← staff app `inventory/[slug]/page.tsx:351` | `:62` | **never** | no — review queue |

Read-only consumers: `api/aria/briefing/route.ts:186`, `api/aria/stocktake-intelligence/route.ts:21,25,33`,
`api/inventory/app/[slug]/tasks/route.ts:62`, `api/inventory/app/[slug]/review/route.ts:134`,
`lib/inventory/owner-agent.ts:344`, `lib/inventory/reports.ts:277`.

### The real finding — A contradicts B and C by design

`stocktake.ts:5-8` and `count.ts:5-8` both state the locked principle in terms:

> "a count NEVER mutates items_on_hand … silent auto-correction is forbidden"

`count.ts:90-93` goes further, referencing `adjustOutletStock` **without calling it** purely to make
the dependency explicit and prove it is deliberately not invoked.

Path **A** does exactly the forbidden thing:

```ts
// src/app/api/pos/stock-takes/route.ts:33-45
for (const item of variances) {
  await supabase.from('pos_products').update({ stock_quantity: item.counted_qty })...
  await supabase.from('pos_outlet_inventory').upsert({ items_on_hand: item.counted_qty,
                                                       last_counted_at: ... })
}
```

It overwrites book stock from the count, with **no owner review, no `pos_stock_adjustments` row, and
no `stock_movements` row**. So the owner-facing dashboard and POS surfaces silently auto-correct,
while the staff app routes every variance to a human. Same table, opposite contracts.

**Which surface reaches which:** owner → A (auto-correct). Staff app → B and C (review).

---

## Q2 · Why 4 headers and 0 items?

**Neither of the offered explanations. The item-write path is not broken, and it is not that nobody
finished a count.** The four rows come from two different paths, and one of them *never writes items
by design*.

The four rows (live):

| id | status | count_type | started → completed | items_counted | variance | notes |
|---|---|---|---|---|---|---|
| `9179b40d` | committed | full | 23 Jun 04:02:46.909 (same ms) | 1 | −1800c | "Count via staff app — variance routed to owner review…" |
| `d035869c` | committed | full | 23 Jun 04:02:47.326 (same ms) | 1 | +1080c | same |
| `94c1de11` | committed | full | 23 Jun 04:02:47.649 (same ms) | 1 | −840c | same |
| `669caac8` | **cancelled** | full | 26 Jun → 27 Jun | 0 | 0 | null |

**The three committed rows are path C (`submitCount`), which deliberately writes a header and no
items.** It uses `pos_stock_takes` as a *one-row audit event per single-product spot count*
(`items_counted: 1` hardcoded at `count.ts:64`); the variance goes to `inventory_review_queue`, not
to a stock-take line. `started_at === completed_at` to the millisecond because `count.ts:63` sets
both to `new Date().toISOString()` in the same object.

The fourth is path B: a session opened 26 Jun and cancelled 27 Jun with nothing counted — a genuine
abandoned count, correctly recorded.

So `pos_stock_take_items` being empty is **expected** given what has actually been run. Path B's line
writer (`stocktake.ts:90-94`) is fully built, upserts with `recount_count` increment, and even
error-checks: `if (lineErr) return null // never report a count as recorded when the line didn't
persist`. It has simply never been driven to completion in production.

### The rows predate the code that appears to have written them

The live rows show `count_type = 'full'` and the note **"Count via staff app"**. Current `count.ts`
writes `count_type: 'perpetual'` and **"Perpetual count via staff app"**. Not a contradiction —
archaeology:

- `count.ts` created **23 Jun** (`1d14e8b1`, INV-STAFF-APP-2) — the same day as the rows.
- `count_type: 'perpetual'` and the "Perpetual" wording arrived **26 Jun** (`eba0335f`, INV-4).

The rows were written by the 23 Jun version, which set no `count_type` (so the column default,
`'full'`, applied). **They cannot be used to infer current behaviour**, and the `count_type='full'`
values are misleading residue rather than evidence of a full stocktake.

### 🚩 A real gap found while answering this — variance recorded, review never raised

The three committed headers each assert `items_with_variance = 1` and carry a note saying the
variance was *"routed to owner review"*. **`inventory_review_queue` contains 0 rows with
`flag_type = 'count_variance'`** — all 65 rows are `velocity_drop`, and the earliest is 30 Jun, a
week *after* these counts.

In `submitCount` the header insert (`:61-67`) happens **before** the review insert (`:72-88`), and
the header write is not conditional on the review succeeding. So a failed or skipped review leaves
exactly this shape: a header claiming variance was routed, and nothing routed. I cannot prove from
here which of failure / bypass / deletion occurred, and I am not guessing. What is established:

- the count-variance → review path has **never produced a row in production**, and
- the ordering makes a silent divergence between the two possible, which is the same family as the
  `customers/merge` defect (write A, fail B, report success).

**Not fixed — NOT-SCOPE.** Flagged for the sprint that follows.

---

## Q3 · Who writes `pos_stock_adjustments`, and does it also write `stock_movements`?

**Seven writers. NONE of them writes a `stock_movements` row. Verified by grepping each file for
`stock_movements`: 0 occurrences in all seven.**

| writer | reason value |
|---|---|
| `lib/inventory/adjust.ts:78,104` | owner adjust (idempotency-claim pattern) |
| `api/pos/stock/adjust/route.ts:59` | manual adjust (error-checked — the only one that is) |
| `api/inventory/app/[slug]/review/route.ts:160` | `review_accepted` / reason_code |
| `api/inventory/app/[slug]/receive/route.ts:91` | `receive` |
| `api/inventory/app/[slug]/transfer/route.ts:81,97` | `transfer_out` / `transfer_in` |
| `api/pos/inventory/route.ts:66` | manual |
| `lib/aria/ask/action-executor.ts:327` | `ask_aria_adjust` |

The 9 live rows, all on outlet `f52d463c`, all June:

| reason | rows | qty | who | when |
|---|---|---|---|---|
| `ask_aria_adjust` | 6 | −43, −49, −49, −50, −49, −48 | "Ask Aria" | 25 Jun 06:21:05→06:21:08 (3s — agent loop) |
| `waste` | 1 | −3 | Maya Roberts | 27 Jun |
| `receive` | 2 | +48, +60 | Maya Roberts | 28 Jun |

**This confirms the property INV-BASELINE exists to establish is absent.** Nine stock changes
happened; the ledger can explain none of them. Note the direction of the gap: the adjustments table
is the *attributed* rail (who, why, which outlet) and `stock_movements` is the *quantitative* one
(`quantity_added`, `new_stock`) — neither is a superset of the other today.

---

## Q4 · What wrote the 2 `adjustment` movements on 4 Aug?

**A one-off backfill script that does not exist in this repository.** Both rows:

```
written_by : backfill
notes      : system:unpaid_online_backfill_2026-08-04 reversal of <sale_item_id>
created_at : 2026-08-04 12:16:23.873666+00   (identical for both)
type       : adjustment, quantity_added +1, restoring stock from unpaid online orders
```

`git log -S "unpaid_online_backfill" --all` returns **nothing** — the string has never been
committed. Searched `src/` and `scripts/`: absent. It was run ad hoc (a temp script since deleted,
or SQL executed directly) and cleaned up.

**Therefore the `adjustment` movement-type write path is NOT a live feature.** No application code
writes `movement_type = 'adjustment'`. The value's existence in the data is an artifact of one
manual remediation, and must not be read as evidence that an adjustment→ledger rail exists.

For completeness, the only live `stock_movements` writers are the sale path
(`api/pos/sales/[id]`, `sales/return`, `sales-history/[id]`, `sync-offline`, `laybys`,
`online-orders/[id]`, `lib/pos/return-engine.ts` → the 102 `sale` rows), receipt-scan
(`movement_type: 'receipt_scan'`), and the **warehouse** routes (`cycle_count`, `grn_receipt`,
`transfer`, `manual_adjustment`, `lot_adjustment`, `recall`) — and **warehouse is parked, so those
are not in scope** (CLAUDE.md §1).

---

## Q5 · Does anything read `last_counted_at`?

**Written by exactly one place. Read by nothing.**

- **Writer:** `api/pos/stock-takes/route.ts:43` — path A only, inside the auto-correcting upsert.
  Paths B and C never write it.
- **Readers of the column: none.** The obvious candidate is not one:

`generateCycleCountList` (`stocktake.ts:186-192`) — the ABC cycle-count due list, surfaced in the
staff app at `inventory/[slug]/page.tsx:2400` as *"Nd since count" / "never counted"* — derives
last-counted from **`pos_stock_take_items.counted_at`**, joined via `pos_stock_takes!inner(outlet_id)`.
It never touches `pos_outlet_inventory.last_counted_at`. The `CycleItem.last_counted_at` field
(`stocktake.ts:161`) is a *derived* value with a coincidentally identical name.

Two consequences:

1. **`pos_outlet_inventory.last_counted_at` is a write-only column.** Path A maintains it; nothing
   consumes it.
2. Because `pos_stock_take_items` has 0 rows, the cycle-count due list currently reports **"never
   counted" for every product**, and `due_score` falls to its `999` never-counted branch
   (`stocktake.ts:198`) for all of them. The feature renders, but its ordering signal is
   uninformative until path B completes a count.

**`inventory_trusted_at` does not exist** in `src/`, `scripts/`, or `supabase/migrations/` — the DB
preflight is correct.

---

## Contradictions with the DB preflight

Only one, and it is an omission rather than an error. Everything else re-verified true:
`pos_stocktakes`/`pos_stocktake_items` 0 rows · `pos_stock_adjustments` 9 rows · `stock_movements`
no CHECK on `movement_type`, default `'receipt_scan'`, `item_id` **text**, `business_id` **nullable**,
live values `sale` 102 / `adjustment` 2 · `pos_outlet_inventory` has `last_counted_at` and UNIQUE
`(business_id, product_id, outlet_id)` · `uq_stock_takes_one_open_per_outlet` present as described.

**Omission:** `pos_stock_takes` also carries two CHECK constraints the preflight did not list —
`count_type IN ('full','cycle','perpetual')` and `status IN ('in_progress','committed','cancelled')`.
Both matter to any migration that adds a count type or status.

---

## Defects found while answering, NOT fixed (all NOT-SCOPE)

All in `api/pos/stock-takes/route.ts` — path A:

1. **Silent auto-correction** of `items_on_hand` and `pos_products.stock_quantity`, violating the
   principle both other engines document as locked. No review, no adjustment row, no movement.
2. **`total_variance_cents` is not cents.** `:24` sums `Math.abs(counted_qty − system_qty)` — a
   quantity — into a column named `_cents`, with no cost lookup. Breaches CLAUDE.md RULE 6's
   amounts rule and silently corrupts any variance-value reporting built on it.
3. **Wrong upsert conflict target.** `:44` uses `onConflict: 'product_id,outlet_id'`; the live
   unique index is `(business_id, product_id, outlet_id)`.
4. **No error checked on any write** in the route (RULE 7) — `:20`, `:28`, `:34`, `:38`, and `:44`
   ends `.then(() => null)`, discarding the result outright.
5. **`.single()` at `:25`** on the header insert.

Also: `stock_movements.business_id` is nullable and `item_id` is `text` rather than a product FK, so
the ledger cannot currently be joined or tenant-scoped with integrity guarantees.

---

## RECOMMENDATIONS

### 1 · Canonical stocktake system

**`pos_stock_takes` + `pos_stock_take_items`.** The evidence and the code agree — no disagreement to
report. It is the only pair with callers, the only one with rows, has the richer shape (outlet,
variance_cents, recount_count, count_type), and carries the partial unique index and both CHECKs.

But canonical-*table* is not the same as canonical-*engine*. **The canonical engine should be B
(`lib/inventory/stocktake.ts`)**: it is the only path that writes complete sessions with lines,
honours the review principle, and is attributed. Path C is a legitimate narrower feature (single-item
spot count) that should keep writing its audit header. **Path A is the outlier and should be
converted to call B**, not extended.

### 2 · The dead twin — **tombstone, do not drop**

`pos_stocktakes` / `pos_stocktake_items`: 0 rows, 0 callers, so dropping is safe *today*. I still
recommend **tombstone over drop**:

- The gain from dropping is nil — no rows, no queries, no confusion in code because nothing imports
  them. The only cost they impose is on humans reading the schema.
- A `COMMENT ON TABLE` naming the canonical pair and the date is enough to stop the next person
  wiring into the wrong one, which is the actual risk.
- Dropping is irreversible and lands in the same sprint as real inventory work. Under RULE 0
  (extend, never remove) a drop needs its own decision, not a ride-along.

Recommend a separate, later cleanup sprint if you want them gone, with the comment applied now.

### 3 · Where the variance write belongs — **`pos_stock_adjustments`, singular**

**One destination, and it is `pos_stock_adjustments`**, for a reason specific to this codebase: it is
already the attributed rail every existing correction path writes to (all seven writers in Q3), and
the owner-accept flow in `review/route.ts:160` already writes it with `reason_code` + evidence. Adding
a second destination now would create precisely the "N copies drift" pattern (#4) that CLAUDE.md
records six times over.

**Not `stock_movements`, for now**, because it is not yet a ledger in any enforceable sense: no CHECK
on `movement_type`, `business_id` nullable, `item_id` text with no FK, and its only live producers are
the sale path and parked warehouse routes. Writing variances into it would add rows to a structure
that cannot yet guarantee tenancy or referential integrity.

**The honest sequencing:** if `stock_movements` is to become the single inventory ledger, that is its
own hardening sprint (CHECK, NOT NULL `business_id`, FK on `item_id`, backfill) — and *then* every
adjustment path writes to it, once, at the same time. Until then, one rail, attributed, complete.

### 4 · `inventory_trusted_at` — **not needed. Drop it from the sprint.**

`last_counted_at` already exists on `pos_outlet_inventory` at the right grain (per product × outlet).
It is unused only because path A is the sole writer and nothing reads it — that is a wiring problem,
not a missing column. Adding `inventory_trusted_at` beside an unread `last_counted_at` would ship a
second unread column.

**If a trust signal is wanted**, the cheaper and truer move is to make the existing one real: have
path B write `last_counted_at` on commit, and point `generateCycleCountList` at it instead of
re-deriving from `pos_stock_take_items.counted_at`. **Per-outlet trust** (rather than per product ×
outlet) would belong on `pos_outlets`, not `pos_outlet_inventory` — but nothing in the current code
asks for that grain, so I would not add it until a surface needs it.

### 5 · The real size of INV-BASELINE

**Most of the original sprint is already built.** What remains is not schema work — it is
reconciliation, and it is smaller but more delicate than the spec implies:

| # | work | size | note |
|---|---|---|---|
| 1 | Point path A at engine B (or make it write review rows + adjustments) | **medium** | behaviour change on two owner surfaces; needs a decision on whether owners keep auto-correct |
| 2 | Fix `total_variance_cents` unit bug + error checks + conflict target in path A | small | RULE 7 / RULE 6 |
| 3 | Make the count-variance → review write reliable (Q2 gap) | small | ordering, same shape as the merge fix |
| 4 | Wire `last_counted_at` (write in B, read in cycle list) | small | replaces `inventory_trusted_at` entirely |
| 5 | `COMMENT ON TABLE` tombstone for the dead twin | trivial | founder-approved DDL, RULE 10a |
| 6 | `stock_movements` hardening → single ledger | **its own sprint** | CHECK, business_id NOT NULL, item_id FK, backfill |

**Columns needed for the original INV-BASELINE spec: zero.** No `inventory_trusted_at`, no new
stocktake tables, no variance columns — all present. Item 5 is the only DDL, and it is a comment.

**One decision only you can make, and it gates item 1:** should owners keep silent auto-correction on
the dashboard stocktake, or does every variance go to review like the staff app? That is a product
call about who is trusted to move stock without a second pair of eyes, and CLAUDE.md §8 says not to
decide it here. Everything else follows from the answer.

---

## NOT-SCOPE confirmation

No migration written. No column added. No fix applied to path A, to the Q2 review gap, or to any
defect in the list above. Nothing dropped. The 9 adjustment rows and 4 stocktake headers were read
only — no `UPDATE`, `INSERT` or `DELETE` was executed against any table in this preflight.
