# RUN LOG — MEGA-SPRINT 9 · TRUSTED NUMBERS + PAR LEVELS

**Autonomous run under RULE 20.** Six phases. Started 2026-08-19.

*(Summary written at the top on completion.)*

---

## PREFLIGHT

### Brief facts verified — with two corrections

- **The ×0.4 signature is confirmed and it is nearly universal, not four products.** `cost_price =
  price × 0.4` to the cent on **73 of 83** costed products. The four with PO costs are just the
  only ones where the lie is *provable*. Reported margin is definitionally 60.0% across the
  catalogue; the four provable actuals are 40.0 / 46.7 / 50.0 / 58.3.
- **"No completed sales since 17 July" is FALSE.** Last completed sale: **2026-08-12**. Sales are
  extremely thin (max 28-day velocity 0.07 units/day) but not absent — phase 6's empty state must
  say "too thin to forecast", not "no sales".
- `product_velocity` is fresh (computed 2026-08-19) but **accumulates snapshots** — consumers must
  take the latest row per product or they read duplicates.
- Apple Juice and Still Water already resolve at tier 1 (`item_cost` = their true costs). **The
  products the tier fix flips are Cortado and Turmeric Latte** — the two with a PO cost and no
  outlet cost.

### The repo already had most of Block B — pattern #3 again

| brief asked for | already exists |
|---|---|
| par from velocity + lead time | `lib/inventory/par-levels.ts` — `computePar`, ABC safety, owner-tunable knobs, called by cron + API |
| days-of-cover, urgency-sorted surface | `components/dashboard/InventoryReorderPanel.tsx`, mounted on `dashboard/inventory`, days-of-cover as "the hero per item" |
| velocity | **three** implementations: `product_velocity` (movement-velocity.ts), `product_performance_scores` (what `computePar` reads), `velocity.ts` — pattern #4, named not consolidated |

Phases 4–6 are therefore **reconciliation**: the missing pieces are the `no_history` distinction,
the confidence statement, and the honest empty state — not the engine or the panel.

---

## PHASE 1 — TRANSACTIONS BEAT CATALOGUE

**Commit:** *(recorded in phase 2's commit — never amend a pushed commit.)*

### The bug was in the orchestrators, not the order

The pure `resolveCost()` has **always** ranked a PO price above catalogue — its header calls that
order "documented + locked". The defect: `resolveCostFor` and `resolveCostBatch` only *fetched*
the PO price after outlet **and catalogue** had both failed. Whenever a catalogue figure existed,
the recorded transaction was never even loaded. The estimate won by fetch-sequencing, not by
policy.

Fixed by restructuring both orchestrators: outlet tiers first (without `cost_price`, so an
estimate cannot answer early), then the PO fetch for every outlet miss, then one final resolution
where the locked order actually decides. Query shape unchanged — still at most one pass per PO
table; the `.in()` list grows from ~10 ids to 73.

### ⚠️ THE COUNT THE BRIEF ASKED FOR, honestly

**Products whose resolved cost changes: 2** (Cortado $1.80→$2.70, Turmeric Latte $2.40→$3.20).
Apple Juice and Still Water were already right via tier 1.

**Reader sites: the brief's "one resolver, all 65 reader sites behind it" is not true today and
was not made true.** Measured:

| | files |
|---|---|
| resolver-backed (now show the corrected figures) | **27** |
| reading `cost_price` directly (STILL show the fabricated figure) | **53** |
| (overlap — files doing both) | 6 |

The 53 direct readers include the LLM-facing routes (pos-chat, price-intelligence,
product-insights, dynamic-pricing…). Routing them all through the resolver unattended is exactly
the retrofit the decision table pattern forbids — this repo's measured adoption without a guard is
9–15%. **Named as the follow-up: a canon-rail rule against new direct `cost_price` reads plus a
per-sprint migration, the same shape as the SMS rail.** Not done here.

### Stored data untouched
No product's `cost_price` was edited (NOT-SCOPE). The fabricated values remain in the column and
remain visible to the 53 direct readers — phase 3 discloses them; correcting them is the owner's
decision.

### Mutations — all observed red, then restored green
| mutation | result |
|---|---|
| restore the catalogue gate on the single path | 1 red |
| flip the pure order (catalogue above PO) | 2 red |
| batch keys off total unknowns again | 1 red |

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** · vitest green (see phase commit).

### Parked
None.
