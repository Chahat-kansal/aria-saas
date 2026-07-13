# POS-AUDIT-29 — Full POS End-to-End Audit + Gap Analysis

**Date:** 2026-06-23 · **Type:** READ-ONLY (no code changes; fixes = follow-up sprints) · **HEAD:** post BUGFIX-FAB-3
**Scope:** 138 pages in `app/pos` · 265 routes in `app/api/pos` · `lib/pos*`, `lib/hardware`, `lib/pos-offline`, `lib/pos-permissions`

## Method note
Four parallel read passes (money flows / catalog-at-sale / full-tree pattern scan / wiring+gap-matrix). **Deep-read & line-confirmed by me:** the money spine (sale/refund/void), `cash-sessions/[id]` close, `stock/adjust`, terminal price/discount/total computation, `terminal` POST body. **Scanned (agent-reported, line-cited, sampled-confirmed):** the broader unchecked-write pattern, gift-card/layby/returns/split races, feature gap matrix. Where an agent's severity didn't survive my spot-check it's **calibrated** and noted (e.g. several "unchecked writes" were actually error-checked).

## Money spine — re-confirmed GOOD (per brief)
`pos/sale` (auth, idempotency replay, stock-check, compensation-void on items-insert-fail, canonical `items_on_hand` decrement via `adjustOutletStock`, atomic session totals via `increment_session_totals`), `refund` (manager PIN, restores stock, logged), `void` (double-void guard, restores stock) — spot-checked, behave as described. The unchecked-`error` pattern below touches *peripheral* writes inside otherwise-guarded flows; it is a hardening class, not a spine break.

---

## PASS 1 — Money flows (the unknowns)

| # | File:line | Sev | Finding | Fix (describe) |
|---|---|---|---|---|
| 1.1 | `api/pos/cash-sessions/[id]/route.ts:64-67` | **HIGH** | **CONFIRMED.** Refund total in cash-up is hard-broken: `.in('original_sale_id', (sessionSales ?? []).map(s=>s).map((_,i)=>i).slice(0,0))` → `.slice(0,0)` always-empty **and** `sessionSales` never selected `id` (line 58). `total_refunds` is **always 0** → `expected_cash` overstated whenever a cash refund occurred in the session → false "short" variance + bad Z-figure. | Select `id` on line 57; replace the `.map().slice(0,0)` with `(sessionSales??[]).map(s=>s.id)`. |
| 1.2 | `api/pos/payments/gift-card/route.ts:106-130` | **HIGH** | Redeem uses a unique-index idempotency gate (prevents duplicate *rows*) but the balance is a read-modify-write (`select balance` → compute → `update`). Two concurrent redeems for *different* sale_ids on the same card can both read the old balance and both deduct. | Move balance mutation into a `decrement_numeric`-style RPC (atomic) or `SELECT … FOR UPDATE`. |
| 1.3 | `api/pos/gift-cards/route.ts:74-87,114` | MED | Issue/reload write the `gift_card_transactions` ledger inside `waitUntil()` (fire-and-forget) with no error check → card row updated but ledger row may be missing on a cold freeze. | Await the ledger insert (it's the audit source of truth), check error. |
| 1.4 | `api/pos/laybys/route.ts:88-112` | MED | Complete-layby guard is `if (status==='completed')` read-then-act; two concurrent completes can both pass → two `pos_sales` for one layby. Completion `update` not gated on `.eq('status','active')`. | Gate the update on `.eq('status','active')` (atomic claim) → second completes no-ops. |
| 1.5 | `api/pos/laybys/route.ts:~102` | MED | Layby completion tax hardcoded to ÷1.1 (10%) regardless of business tax. | Use business/line tax rate. |
| 1.6 | `lib/pos/return-engine.ts:263-271` | MED | `returned_quantity` increment is read-modify-write; concurrent returns on one line can lose a count (and the "available to return" guard at :114 can be bypassed). | Atomic `increment_numeric` RPC for `returned_quantity`. |
| 1.7 | `lib/pos/return-engine.ts:273-289` | MED | Inventory restore RPC runs *after* the return ledger writes and its failure is caught+ignored → return recorded but stock not restored. | Order restore before/with the ledger, or surface RPC failure. |
| 1.8 | `api/pos/cash/route.ts:44-64` | MED | `manage-cash` paid-in/out: `type` not validated against an enum and `amount` sign not enforced (negative accepted) → arbitrary movement types / sign confusion in the drawer balance. | Whitelist `type ∈ {cash_in,cash_out,cash_drop}`; require `amount>0`. |
| 1.9 | `api/pos/sales/[id]/split/route.ts:31-63` | MED | Split groups: no guard that `Σ split amounts == sale total`; last split silently absorbs the remainder; itemless splits allowed when parent has items. | Validate sum within ±1c; require item distribution when parent itemised. |
| 1.10 | — | **GAP** | **No dedicated X/Z report or formal EOD-close** route. `daily-summary` is the nearest; cash-session close is the only reconciliation and it's affected by 1.1. | Add `eod-close` / Z-report (opening float + cash sales + paid-in − paid-out − refunds = expected). |

---

## PASS 2 — Catalog / inventory at sale time

| # | File:line | Sev | Finding | Fix (describe) |
|---|---|---|---|---|
| 2.1 | `pos/(fullscreen)/terminal/page.tsx:1021,1040,1526` | **CRITICAL** | **CONFIRMED.** Manual quick-discount (`manualDiscountAmt`, the "% Disc" button) **and** applied promotions (`appliedDiscounts`) are **not subtracted from the charged total**. `subtotal` nets only per-line `discount_percent` (:1021); `total = subtotal + surchargeAmt` (:1040) ignores `manualDiscountAmt`/`appliedDiscounts`; the sale POST sends `discount_amount: 0` (:1526). The receipt *preview* computes `promoOff` (:2981-82) but payment charges the un-discounted total → **discount shown but not given** (and never recorded). | Fold `manualDiscountAmt + Σ appliedDiscounts.amount_off` into the payable total; send the real `discount_amount` in the POST; persist applied promo ids. |
| 2.2 | `api/pos/price-lists/*`, `api/pos/timed-prices/*` | HIGH | Price-lists and timed/future prices have full CRUD but **the terminal never consults them** — line price is `product.price + modifiers` only. Configured price lists/timed prices have zero effect at sale. | Add a `resolvePriceForProduct(productId, outlet, now)` resolver (timed → price-list → base) used at add-to-cart and re-validated server-side in `pos/sale`. |
| 2.3 | `api/pos/products/[id]/variations/route.ts` | MED | Variants carry their own **price** (correct) but have **no per-variant stock** — `pos_item_variations` has no `items_on_hand`; selling any variant decrements the parent only. Can't tell small vs large remaining. | If variant stock needed: add `items_on_hand` to variations + decrement by variant at sale. |
| 2.4 | `api/pos/stock/adjust/route.ts:35,40` | **HIGH** | **CONFIRMED.** POS quick stock-adjust writes only `pos_products.stock_quantity` (the demoted cache), **never `pos_outlet_inventory.items_on_hand`** (canonical). No outlet resolution, no required actor. Multi-outlet stock drifts; the canonical staff-app adjust path (`/api/inventory/app/[slug]/adjust`, INV-ADJUST-1) is correct — this older POS path is not. | Route through `adjustOutletStock` (canonical, attributed); require `outlet_id`. |
| 2.5 | `api/pos/stock-takes/route.ts:42-51` | MED | Writes both `stock_quantity` and `items_on_hand` but via non-atomic upsert and with no per-item actor. | Atomic per-row update; attribute actor per counted line. |
| 2.6 | `api/pos/orders/receive/route.ts` | ✅ GOOD | PO → receiving increments **both** `stock_quantity` and canonical `items_on_hand` atomically and captures real cost (`captureReceiptCost`, never fabricates 0) + batch/expiry. No gap. | — |
| 2.7 | `api/pos/transfers/[id]/transition/route.ts` | ✅ GOOD (w/ 3.x) | Transfers correctly move `items_on_hand` on both outlets + carry cost + log actor — but see Pass-3 unchecked-write/`||`-fallback items on this file. | — |

---

## PASS 3 — Full-tree pattern scan (265 routes)

> **Calibration:** the scan flagged ~35 "unchecked write" sites. My spot-checks found **some are actually error-checked** (e.g. `cash-sessions/[id]` close update destructures `updateErr` and returns 500 — *not* a defect). Treat the count as an **upper bound**; the *pattern* (not destructuring `error` on a financial/stock write) is real and worth a systematic sweep. Confirmed-real, highest-value instances below.

| # | File:line | Sev | Finding | Fix |
|---|---|---|---|---|
| 3.1 | `api/pos/stock/adjust/route.ts:44-53` | MED | Stock-adjust audit insert wrapped in `try{}catch{/*ignore*/}` → adjustment audit silently lost if it fails (compounds 2.4). | Check error; log. |
| 3.2 | `api/pos/transfers/[id]/transition/route.ts:78,103,109` | HIGH | **Falsy `|| 0/||fallback` where 0 is valid** on transfer quantities: `Number(item.quantity_sent) || Number(item.quantity_approved)` — a legitimate partial-send of `0` falls through to the approved qty → wrong stock moved. | Use `??` (null-coalescing) for quantity fields. |
| 3.3 | `api/pos/transfers/[id]/transition/route.ts:86-155` | MED | Several `pos_outlet_inventory` / `pos_transfer_events` writes don't check `error`. Transfer is multi-step without a transaction; a mid-sequence failure leaves partial state. | Check each error; consider an RPC/transaction for the decrement+increment pair. |
| 3.4 | `api/pos/migrate/route.ts:146-147,182` | HIGH | **`JSON.parse` without try/catch** on `formData` (`headers`, `samples`, `mapping`) → a malformed import payload 500s the CSV import. | Wrap in try/catch → 400 with a clear message. |
| 3.5 | `api/pos/gift-cards/route.ts:86,114` | MED | Ledger inserts in `waitUntil` unchecked (= 1.3). | As 1.3. |
| 3.6 | (pattern) money/stock peripheral writes | MED | A real but lower-severity class: refund/void/split/online-order *peripheral* inserts (audit-log, items) frequently don't destructure `error`. Within known-good flows so impact is "missing audit row" not "lost sale", but should be swept. | Systematic: destructure+check `error` on all `pos_*` financial/stock writes; standard helper. |
| 3.7 | Dead buttons / orphaned routes | LOW | None material found — POS pages render handlers; sampled routes (`ad-campaigns`, `audit-log`, …) all have callers. The 2 auth-less routes (`parcel-tracking/webhook`, `ad-impressions`) are legitimately public (confirmed per brief). | — |

---

## PASS 4 — Wiring
**Clean.** 200+ `fetch('/api/pos/…')` calls sampled all resolve to real route files; nav/sidebar entries all point to existing pages. **Zero 404-at-runtime wiring gaps.**

---

## GAP MATRIX vs Square / Lightspeed / Kounta(AU) / Vend

| Feature | Status | Evidence |
|---|---|---|
| Integrated card/EFTPOS (Tyro / Stripe Terminal / Square Reader) | **MISSING** | terminal `payMethod` card is a manual label ("Tap, insert or swipe" w/ no device driver). Tyro/Stripe-Terminal would need: a processor table + device pairing/token, a payment-intent + webhook route, and the terminal charge step to await device approval before finalizing the sale (~processor SDK + 2 routes + terminal wiring). |
| Tips / gratuity on a normal card sale | **MISSING** | `PayMethod` union = card/cash/split/gift_card/direct_deposit; no tip field/modal, no `tip_amount` on the sale payload. |
| AU card surcharging (applied at sale) | **HAVE** | `terminal:286` loads `surcharge_rules`; `:1026-1040` computes & adds `surchargeAmt` to total by method/day; settings at `/pos/settings/surcharging`, API `/api/pos/surcharge-rules`. |
| Offline resilience | **PARTIAL** | `lib/pos-offline.ts` = **localStorage** (not IndexedDB): products cache (15 min TTL), `queueOfflineSale`, sync via `/api/pos/sync-offline` on terminal load; queue keyed by sale_id (idempotent). **No queue size cap** (risk at scale) and localStorage (~5MB, sync, evictable) is weaker than IndexedDB for large/long offline windows. |
| Weighing-scale / price-embedded (EAN-13 weight) barcodes | **MISSING** | `lib/hardware` has printer/scanner/cash-drawer only; no scale driver, no weight-barcode parsing. |
| RSA / age-verification prompt | **HAVE** | terminal detects `is_age_restricted` (:1454), age-verify modal blocks sale (:4058-82), `age_verify` audit-logged; staff RSA expiry tracked. |
| Open bar tabs | **MISSING** | No `open_tab`/running-tab method; laybys are deposit-based, not tabs. |
| Quick-keys / sale-keys | **HAVE** | `/pos/sale-keys` page + `/api/pos/sale-keys`; `SaleKey` type (product/category/discount/open_price/note/custom). |
| Store-credit issue + redeem | **PARTIAL** | `pos_store_credits` + issue on refund (`return-engine.ts:169`, method `store_credit`); redeem path at terminal not clearly wired (balances endpoint exists). Verify redeem-at-sale. |
| House / on-account sales | **MISSING** | No `on_account`/`house` method or customer running-balance settlement. |
| Multi-register / multi-drawer | **HAVE** | `pos_registers` + `/api/pos/registers`; terminal stores outlet/register context; cash-drawer via WebUSB; session tied to `register_id`. |
| ESC/POS receipt firing | **HAVE** | `lib/hardware/escpos.ts` builds bytes; `printer-client.ts` sends via WebUSB/WebHID/network (`/api/pos/hardware-proxy`) — real, not a stub (prints only if device connected). |
| Barcode scanner in terminal | **HAVE** | `lib/hardware/scanner.ts` keyboard-wedge keydown listener (Enter-terminated, min-len/gap configurable). |
| Customer-facing display | **HAVE** | `/pos/display` page; renders cart/totals/loyalty + celebration; ad rotator. |
| X / Z reports | **MISSING** | No X/Z report pages under `/pos/reports`; cash-session close is the only reconciliation (and is hit by 1.1). |

**Score: 9 HAVE · 3 PARTIAL · 6 MISSING** (incl. Pass-1 X/Z gap).

---

## Prioritised action list (money/stock bugs first)

**P0 — money/stock correctness (fix before relying on POS figures):**
1. **2.1 Discounts/promos not charged** (`terminal:1021/1040/1526`) — quick-discount + promotions shown but not deducted; `discount_amount:0`. *Customer-facing money correctness.*
2. **1.1 Cash-up refunds always 0** (`cash-sessions/[id]:64-67`) — every session with a cash refund mis-reports variance.
3. **2.4 POS stock/adjust cache-only** (`stock/adjust:35/40`) — route through `adjustOutletStock`; multi-outlet stock drift.
4. **1.2 Gift-card balance read-modify-write** — atomic RPC.
5. **3.2 Transfer `|| 0` on quantities** — `??`; wrong stock moved on legitimate 0.

**P1 — guard/hardening (silent-failure & races):**
6. 1.4 layby double-complete atomic claim · 1.6/1.7 returns race + restore-after-ledger · 1.8 manage-cash type/amount validation · 1.9 split sum guard · 3.4 migrate `JSON.parse` try/catch · 3.6 sweep unchecked `error` on financial/stock writes (helper).

**P2 — launch-gating MISSING features (sequence after correctness):**
7. **Integrated EFTPOS (Tyro/Stripe Terminal)** — biggest competitive gap; manual card entry is a real risk for volume retail.
8. **X/Z reports + formal EOD close** (depends on 1.1 fix).
9. Price-lists/timed-prices applied at sale (2.2) — configured-but-ignored.
10. Tips, open tabs / on-account — hospitality gaps. Offline → IndexedDB + queue cap (PARTIAL hardening).

---

## Scope confirmation
READ-ONLY. No files modified. All findings carry `file:line`. Severities reflect my line-level confirmation where marked **CONFIRMED**; agent-reported items are line-cited and should be re-confirmed at fix time. The money spine (sale/refund/void) and PO-receiving are sound; the highest risks are the **terminal discount/promo not being charged**, the **cash-up refund-always-0**, and the **POS stock-adjust writing the stale cache** — all data-correctness, all fixable in small follow-up sprints.
