# RUN LOG — MEGA-SPRINT 9 · TRUSTED NUMBERS + PAR LEVELS

**Autonomous run under RULE 20.** Completed 2026-08-20.

---

## SUMMARY

**Phases done: 6 of 6 · Parked: 0 · Commits: 5** (phases 4+5 share one — same files, deviation
noted in place).

### THE COUNT THE BRIEF PUT AT THE TOP: money figures changed by phase 1

**2 products** (Cortado $1.80→$2.70, Turmeric Latte $2.40→$3.20) across **27 resolver-backed
files** — margins 60.0%→40.0% and 60.0%→46.7%. **And honestly: 53 files still read `cost_price`
directly and still show the fabricated figure**, including the LLM-facing routes. The brief's "one
resolver, all 65 sites behind it" was not true before and was not made true unattended — that
migration needs a guard first (measured adoption without one: 9–15%). Named as the follow-up.

### The three things you most need to know

**1. The fabrication is 73 products, not 4.** `cost_price = price × 0.4` to the cent on 73 of 83
costed rows — every margin was definitionally 60.0%. Phase 1 makes recorded transactions win where
they exist; phase 3 flags every fabricated-looking figure in the valuation panel ("cost looks
derived from price") with the fix route. **Nothing was auto-corrected — the column is your data.**
The four PO-costed products prove the pattern: every real cost is HIGHER than the fabricated one,
so true margins are lower than reported.

**2. Phase 1 armed a crash and phase 2 defused it.** The valuation panel kept a private copy of
the tier vocabulary that was missing `purchase_order` — the moment a PO price could win, Cortado's
row would have crashed the panel. Also found: a third resolver path (`stock-value.ts`) with the
same gating bug, now routed through the canonical batch resolver. One orchestrator, one answer.

**3. The runs-out surface now tells you how much to believe it.** Never-sold products get no par
and no date (distinct from a par of zero); thin evidence prints its reason ("based on only 2 sales
in 28 days — date is a rough guess", thresholds: 14 days observed / 5 units); and an empty list
distinguishes "everything is fine" from "not enough history to forecast yet". For Sip today the
honest state is the latter, and it says so. ⚠️ **The "Order N" button on that list has no onClick
and never has** — left for the ordering sprint, but it looks like it works and it does not.

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

**Commit:** `eb6cbb3f`

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


---

## PHASE 2 — EVERY NUMBER CARRIES ITS TIER

**Commit:** `b88c09a9`

### One vocabulary, exported from the tier's home

`COST_SOURCE_LABEL` now lives in `resolve-cost.ts` beside the tiers themselves: *"from your
purchase order"*, *"estimated from your catalogue"*, *"no cost recorded"* — trust calibration in
the owner's words, which is the thing no POS does.

### 🚨 Phase 1 had ARMED A CRASH, found and defused here

`InventoryValuePanel` kept a **private copy** of the tier vocabulary — and its copy was missing
`purchase_order` entirely (its local `Source` type too). The moment phase 1 let a PO price win,
any Cortado or Turmeric Latte row would have hit `SOURCE_META[source] → undefined → .label` and
**crashed the valuation panel**. Fixed by importing the shared labels and covering the full
`CostSource` union, so a future missing tier is a compile error rather than a runtime crash. A
private copy of a vocabulary is a crash with a delay on it.

### A THIRD orchestrator had the same gating bug

`stock-value.ts` ran its own inline `resolveCost()` over its own query — with **no PO data**, the
same fetch-gating defect phase 1 fixed in the other two orchestrators. The valuation panel would
have kept valuing Cortado at the fabricated $1.80 while every other surface showed $2.70. Now
routed through `resolveCostBatch` — one orchestrator, one answer, and the tier a figure carries is
the tier that actually resolved.

### Also
- Staff scan card: `cost basis · last_delivery` (raw enum) → the owner phrase.
- `/api/pos/reports/inventory`: **zero UI consumers** and a `resolved?.cost ?? 0` fabricated-zero
  inside — a dead endpoint with a lie in it. Logged, not decorated; candidate for cleanup, not
  provenance.

### Mutation
Collapse all tiers to one label → **3 red**. Restored → 6/6 green.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** (clean rebuild — see incident below) · `vitest` 335/335 (30 files).

### ⚠️ Incident: a concurrent-build corruption, caught by the gate rule
The first phase-2 build wrote `BUILD_EXIT=1` (ENOENT on `_app.js.nft.json` in
collect-build-traces) after I started a fresh build while the previous one was still finishing —
the session's known two-builds-one-`.next` corruption. **The wrapper notification claimed
"completed (exit code 0)" for that failed build**; only `BUILD_EXIT` told the truth, again.
Remedied by killing the zombie build process (3.8 GB), clearing `.next`, and rebuilding once.
`build.log` also picked up a NUL byte, so the gate greps now need `-a` — noted for the next run.

### Parked
None.


---

## PHASE 3 — THE 60% TELL

**Commit:** `82df480f`

### Detection and disclosure, nothing corrected

`looksBackCalculatedCost(price, cost_price)` lives beside the tier vocabulary in `resolve-cost.ts`:
true when the stored catalogue cost matches `price × 0.4` **to the cent** (tolerance half a cent —
the fabrication was written by exact multiplication, so a real cost that merely lands near 40%,
like Apple Juice's true $2.50 against $6.00 at 41.7%, clears it).

Flagged on the **stored** figure regardless of which tier won resolution — so Cortado, now costed
from its PO, still tells the owner its catalogue entry looks fabricated. Surfaced in the valuation
panel as a chip — *"cost looks derived from price"* — with the tooltip naming the fix route (record
a real delivery or purchase cost). The fix mechanism is the panel's existing per-product cost
entry; nothing new was built.

### Scale, verified live
**73 of 83** costed products carry the signature; the 10 at other ratios do not. The brief's "four
products" are simply the only ones where the fabrication is *provable* against a recorded price.

### Mutations — both observed red, then restored green
| mutation | result |
|---|---|
| detector always false | 2 red |
| tolerance loosened to 10¢ (accuses honest costs) | 2 red |

The second mutation matters as much as the first: at 10¢ tolerance the four GENUINE PO costs start
getting flagged, and accusing an honest figure is worse than missing a fabricated one.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 340/340 (31 files).

### Parked
None. (An earlier hook rejection is on the record: phase 3's test file existed before its
implementation, and the pre-push tsc caught the tree-level mismatch and blocked phase 2's push
until the implementation landed. The hook working as designed — recorded, not hidden.)


---

## PHASE 4 — PAR FROM VELOCITY & PHASE 5 — "WHAT RUNS OUT THIS WEEK"

**Commit:** *(one commit for both — see the deviation note.)*

### ⚠️ Deviation from one-commit-per-phase, stated plainly
Phases 4 and 5 both land in the same two files (`par-levels.ts`, `InventoryReorderPanel.tsx`) —
the engine and the surface the brief itself paired. Splitting them would have manufactured two
commits whose diffs interleave in the same functions. One commit, both phases, this note.

### Phase 4 — the engine existed; the distinction did not
`computePar` (velocity → par, ABC safety, owner knobs) was already built and running from a cron —
pattern #3, reported not rebuilt. What was missing is exactly what the brief named:

- **Never-sold gets NO par.** `product_velocity.history_state='no_history'` (or no velocity row at
  all — absence of evidence fails closed) → `no_history: true`, no par computed, **no par columns
  written** (whatever the owner typed survives), `days_of_cover` null, never below-reorder, never
  suggested. Distinct from `review` (sold-but-slow) and from a par of zero.
- The math was **extracted pure** (`computeParMath`) — identical arithmetic, now assertable.
- `product_velocity` accumulates snapshots; the evidence map reads only the newest `computed_at`.

### Phase 5 — the surface existed; the confidence did not
`InventoryReorderPanel` already ranks by days-of-cover. Added the third clause of "what runs out,
when, **and how sure are we**":

- `coverConfidence`: **'low'** when under **14 days** observed (a café cycles weekly; fourteen days
  is two full cycles, the minimum to tell a weekend-only seller from a steady one) **or** under
  **5 units** in the window (below five, one stray sale moves the velocity 20%+ — the date is
  dominated by an event, not a pattern). **'none'** for never-sold: no date, full stop.
- The panel prints the reason on the card: *"based on only 2 sales in 28 days — date is a rough
  guess"* — and cover renders as `~N days`, tilde deliberate.
- A no-history product can never appear with a date: `days_of_cover` is null at the engine.

### 🚩 Found, logged, not fixed: the Order button is dead
The below-reorder list's **"Order N" button has no onClick** — it has never done anything. Failure
pattern #1 on the exact surface this sprint makes owners look at. In this sprint's scope ordering
is deliberately out (*"no PO is drafted, sent or spent"*), so it was left — but a dead button
looks like a working one, and it should be either wired or removed by the ordering sprint.

### Mutations — all observed red, then restored green
| mutation | result |
|---|---|
| ignore velocity (constant par) | 3 red |
| `no_history` collapses into `review` | 2 red |
| never-sold gets a par anyway | 2 red |
| confidence always 'ok' | 3 red |
| observation threshold drops to 2 days | 1 red |

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** (sole build, tree complete) · `vitest` 363/363 (34 files).

---

## PHASE 6 — HONEST EMPTY STATE

**Commit:** *(this commit)*

### Two empty states, because two different things can be true
The runs-out list used to say *"✓ Everything is above its reorder point"* whenever it was empty —
including when it was empty because **nothing is forecastable**. For Sip today (one completed sale
since mid-July, most products never sold) that was a false all-clear built on an absence of data:
GROUNDING-TEETH in prose form.

Now: `forecastable = rows with history AND velocity > 0`. When that is zero, the panel says **"Not
enough sales history to forecast yet"**, counts the never-sold products, says **nothing is
broken**, and names what fills it — selling through the till, plus a stocktake so the first
forecasts start from a counted number. The genuine all-clear still shows for businesses with real
history.

**Correction applied from preflight:** the brief said "no completed sales since 17 July" — false
(last: 12 Aug). The empty state accordingly says *not enough* history, never *no* sales.

### Mutation
Gate the honest state off (`&& false`) → 1 red. Restored → 6/6 green.

### Gates
Same run as above: `tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 363/363.

### Parked
None in Block B.
