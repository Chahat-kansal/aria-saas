# INVENTORY-FUNCTION-AUDIT — real depth, not "exists"

READ-ONLY audit. Each café-relevant inventory function judged on 6 dimensions:
1 REAL·vs·placeholder · 2 DEVICE reality · 3 STATES (empty/error/loading/denied/offline) · 4 USABILITY depth ·
5 CANONICAL & attributed · 6 GROUNDED. Verdicts: **DONE / SHALLOW / BROKEN / NOTBUILT**.

(The master-plan doc with `CODE?:` blanks was not present at `/mnt/user-data/outputs/` or in the repo, so this
file IS the filled audit. All file refs are `src/app/inventory/[slug]/page.tsx` unless noted.)

## Headline
The **scan camera** was the one café-relevant **BROKEN** (hardcoded "no camera here"; INV-SCAN-CAMERA fixed it —
real `react-zxing` scanner + manual fallback, `components/inventory/ui/PipelScanner.tsx`, wired at page ~1271).
**No other café-relevant function is BROKEN.** The remaining real-world gap is **OFFLINE TOLERANCE** (cross-cutting
SHALLOW on every write screen) and the **price-tickets "scan" being manual search** (SHALLOW, and café-hidden).
`stub()` ("Coming in the next update", line 932) is **dead code — never called**; café tiles all route to real screens.

## Per-function verdicts

| # | Function | CODE? | Evidence / what's missing |
|---|---|---|---|
| 1 | Login (staff PIN) | **DONE** | pick/pin keypad, HMAC session (`lib/inventory/staff-session.ts`), attributed. States: loading/pick/pin/error. |
| 2 | Home (value hero + tiles + needs-you) | **DONE** | `computeStockValue` + manifest tiles + needs-you from real counts. States loading/error/empty (~1700-1760). |
| 3 | Scan — price-check / locate | **DONE** *(was BROKEN)* | `scanLookup` (canonical on_hand, per-outlet locate). Camera now real: `PipelScanner` (rear cam, react-zxing) + manual fallback + permission pending/granted/denied (`PipelScanner.tsx`; page ~1271-1290). **Needs a real-device test (Vivo/HTTPS) — code-real, hardware-unverified.** |
| 4 | Add-to-catalogue (scan miss) | **DONE** | INV-1-FINISH form → POST `/scan` → re-resolve. Name/price validation. |
| 5 | Stock count / stocktake (full/cycle/perpetual) | **DONE** | `lib/inventory/stocktake.ts`; FEFO not here but variance→`inventory_review_queue`, canonical only on owner-accept. Steppers. States pick/loading/active/submitted. |
| 6 | Tasks / guidance (Tanpin) | **DONE** | `lib/inventory/guidance.ts` velocity/weather/par/expiry/count + temp/recall tasks; grounded (weather honestly "insufficient"), attributed completion. States loading/error/empty. |
| 7 | Pulse | **DONE** | per-outlet today-vs-baseline, attention chips (incl. temp/on_hold). Read-only, grounded. |
| 8 | Handover | **DONE** | open/done + flagged, real rows. |
| 9 | Receive (PO → stock) | **DONE** | `adjustOutletStock` + `captureReceiptCost` + batches, atomic claim, attributed, per-line steppers + expiry date. States loading/error/empty. |
| 10 | Transfer (multi-outlet) | **DONE** | approve→send→receive canonical, attributed, idempotent; single-outlet hidden. States loading/error/empty. |
| 11 | Waste | **DONE** | canonical decrement + `cost_cents`, reason chips, qty stepper, waste-today list, spike→review. |
| 12 | Adjust | **DONE** | set/add/remove canonical, **manager-gated** (`staffCanAdjust`), reason required, value-impact preview, permission-denied state. |
| 13 | Expiring (buckets + waste/markdown) | **SHALLOW** | Real batch buckets + canonical waste; markdown "flags owner" (propose). But the `fefo`/`batches`/`markdown` tiles all route to this ONE screen — no dedicated FEFO pick-list or markdown-apply flow. Functional, mild friction. |
| 14 | Reports (13-report library) | **DONE** | grounded generators (`lib/inventory/reports.ts`), KPI chips + table + tile library; PDF via serverless chromium (prod-only) + schedule→Resend. States loading/error/empty. |
| 15 | Order / buying (reorder + draft PO) | **DONE** | `lib/inventory/buying.ts` per-outlet reorder grouped by supplier (NEEDS-COST/supplier flagged), draft→approve(manager,403)→send(Resend). |
| 16 | Production / fresh (recipe depletion) | **DONE** | `lib/inventory/fresh.ts` canonical FEFO depletion, cents-safe, "no linked ingredients" flagged honestly; temp log; markdown propose. |
| 17 | Recall / loss (quarantine + shrinkage + age) | **DONE** | `lib/inventory/loss.ts` recall (stock not deleted), resolve(manager,canonical), shrinkage from real rows (theft = pattern, **never an accusation**), age gate (existing flag + attributed log). |
| 18 | Price tickets (shelf-ticket batch) | **SHALLOW** | Batch→queue→dashboard→print round-trip is real (INV-TICKETS), snapshot/print/status all work. **But the staff "scan a shelf ticket" tab uses a TEXT SEARCH, not the camera** (`ticketSearchRun`, page ~1623; placeholder lies "Scan or search"). A floor-walker must type/search each item. *(Café-hidden: `tickets` tile is RETAILY, so café staff don't surface it.)* |
| 19 | Temp / compliance | **DONE** | log pass/fail vs threshold, attributed, surfaces as `temp` task + Pulse. |
| 20 | Review queue (owner) | **DONE** | accept→canonical adjust / investigate / dismiss, attributed, idempotent. States loading/error/empty. |

## Cross-cutting

- **OFFLINE TOLERANCE — SHALLOW on every write function (count/waste/adjust/receive/transfer/recall/stocktake).**
  `public/inventory-sw.js` caches the app SHELL (opens offline) but **data is network-only** → on failure it
  returns `503 {offline:true}`. The page **never inspects `{offline:true}` or `navigator.onLine`** (grep = 0) — so
  offline reads show a generic "Couldn't load", and **offline WRITES are not queued — they just fail** (`r.ok`
  false → silent / "something went wrong"). A stockroom/cellar dead-zone breaks counting & receiving. This is the
  single biggest real-world gap (the brief's "stockroom features need offline tolerance").
- **CANONICAL & ATTRIBUTED — DONE across the board.** Every stock write routes through `adjustOutletStock`;
  every move is attributed (staff name / id); money/stock-removing actions are manager-gated (adjust, PO approve,
  recall resolve). No fabricated numbers found — thin data is shown honestly everywhere.
- **DEAD ROUTES (NOTBUILT, café-hidden).** `routeTile` default → `home` for grocery/supermarket-only tiles
  (`weigh`, `avg_weight`, `shrink_trim`, `scale_link`, `pick_pack`, `oos_sync`, `reserve_stock`, `planogram`,
  `abc_analysis`, `supplier_performance`, `promo_stock`, `central_stock`, `outlet_compare`, `age_restricted`,
  `shelf_capacity`, `backroom`). Café hides all of these, so P2 — **but for a grocery/supermarket they'd be dead
  controls** (tap → silently lands on home, no feedback).

## Priority list

### P0 — café-relevant BROKEN
- **(none remaining).** Scan-camera was the only one; fixed by INV-SCAN-CAMERA (`7073ee77`). *Action: founder must
  confirm it works on the Vivo X300 Pro at `https://ariaos.site/inventory/sip-ff5055` — code is real but
  hardware-unverified.*

### P1 — café-relevant SHALLOW
1. **Offline write tolerance** — count/waste/adjust/receive/transfer/recall/stocktake. No offline detection, no
   write queue; offline = failure. Real-world: a cool-room/stockroom with no signal can't count or receive.
   *Fix shape (later): detect `{offline:true}`/`navigator.onLine`, surface an honest "offline — will retry"
   banner, and queue writes for replay (IndexedDB) — additive.*
2. **Expiring screen overloaded** — `fefo`/`batches`/`markdown` tiles all land on one screen; no dedicated FEFO
   pick order or one-tap markdown-apply. Friction, not failure.
3. **Scan camera — device-unverified.** Code-real; needs the Vivo test to graduate from "P1 watch" to DONE.

### P2 — café-hidden NOTBUILT (and grocery/supermarket dead controls)
1. Price-tickets staff "scan" is manual search (SHALLOW) — but café-hidden (RETAILY tile), so low priority for
   café; would matter for a retail/grocery rollout (wire `PipelScanner` into the tickets tab).
2. Grocery/supermarket advanced tiles route to `home` (dead controls): weigh / scales / pick-pack / OOS-sync /
   planogram / ABC / supplier-scorecard / shelf-capacity / backroom / central-stock / outlet-compare /
   age-restricted-register. Expected NOTBUILT for café; **block or build before any grocery/supermarket launch.**

## One-line takeaway
After the camera fix there are **no café-relevant BROKEN functions**; the real depth gap is **offline write
tolerance** (P1, every write screen), plus a manual-not-camera tickets scan and grocery-tile dead controls that
only bite outside café. Everything is canonical, attributed, and grounded.
