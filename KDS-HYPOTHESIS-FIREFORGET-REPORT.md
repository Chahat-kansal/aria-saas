# KDS-FIX-1 + HYPOTHESIS-JSON-FIX-1 + FIRE-AND-FORGET-SWEEP

**Date:** 2026-07-14 | **Method:** same live-data-first approach as LOYALTY-REGRESSION-1 — trace the
code, then verify every claim against real production data before writing a fix.

---

## PART A — `pos_kds_tickets` stopped 2026-07-02

### Root cause, stated plainly

There are **two independent KDS systems** in this codebase, both shown together on the expo screen
(`/pos/kds/expo`): `pos_kds_orders` (the older "kitchen page", `/pos/kitchen`) and `pos_kds_tickets`
(the newer "station KDS", `/pos/kds/[station]`). `pos_kds_orders` is created **reliably**,
server-side, inside `/api/pos/sale` itself (industry-gated to `cafe`). `pos_kds_tickets` was
created **only** via a separate client-triggered `fetch('/api/pos/kds/auto-fire').catch(() => {})`
after the terminal's sale call — and that call had a real, confirmed bug: the terminal sent
`{ id: i.product.id, product_id: i.product.id, ... }` for each cart line — the **product's** ID,
not the real `pos_sale_items.id`. `fireKdsTickets()` wrote that value straight into
`pos_kds_tickets.sale_item_id`, which carries a real foreign-key constraint
(`pos_kds_tickets_sale_item_id_fkey → pos_sale_items.id`) — **every insert failed**, and the
failure was invisible three times over: the route returned HTTP 200 even when its own `errors`
array was non-empty, the terminal's `fetch(...).catch(() => {})` only catches network failures
(never inspects status/body), and nothing ever alerted on the resulting `activity_log`-less
silence.

**Confirmed via git blame:** this exact payload shape has been unchanged since commit `02f5f4701`
(2026-05-26) — the bug likely predates 07-02 entirely; it just happens that the 3 pre-existing rows
in `pos_kds_tickets` (all dated 2026-07-02, all with `sale_item_id = NULL`) came from a different,
unidentified source (neither `fireKdsTickets` nor `pos/sales/route.ts`'s own correct insert would
ever produce a NULL `sale_item_id` under normal operation) — most likely manual/test data, not live
terminal traffic. Real terminal sales have most likely never successfully created a
`pos_kds_tickets` row via this path.

### Fix

1. **`src/lib/pos/kds-fire.ts`** — `fireKdsTickets` no longer accepts item identity from the
   caller at all. It re-queries the real `pos_sale_items` rows server-side by `sale_id` (the exact
   pattern already proven correct in `pos/sales/route.ts`), guaranteeing a real, FK-valid
   `sale_item_id`. Also now idempotent (skips if tickets already exist for the sale), so it's safe
   to call from multiple trigger points.
2. **`src/app/api/pos/kds/auto-fire/route.ts`** — simplified (no longer reads/needs an `items`
   field from the client), and now surfaces `fireKdsTickets`'s `errors` to `activity_log` instead
   of silently returning HTTP 200 regardless.
3. **`src/app/api/pos/sale/route.ts`** — added a **second, reliable, server-side** call to
   `fireKdsTickets`, colocated with the sale/sale_items this same request just created — not
   industry-gated (the client call it backstops fired for every business, every sale). This is the
   real reliability fix: ticket creation no longer depends on a fragile second client-initiated
   HTTP round-trip succeeding at all. The terminal's own client-side auto-fire call is kept as a
   redundant, now-harmless-if-duplicate second trigger (idempotency guard makes both safe together).

### Verification

**Could not drive the live terminal UI** — no browser session available in this environment
(consistent with this session's standing constraint). As the closest rigorous proxy, dry-ran the
exact fixed query chain against a real, already-completed sale (`c96393f8`, a genuine `takeaway`
sale from 2026-07-14 with zero existing KDS tickets) without writing anything: it resolves a real
`pos_sale_items.id` (`3dc2336e-98f3-...`) with `kds_station='barista'` correctly populated —
proving the fixed logic produces a valid, FK-satisfying row against live schema and data. **Founder
should place one real test order at the terminal and confirm a ticket appears on `/pos/kds/[station]`
before fully trusting this in production** — stated explicitly per this repo's own verification
standard, not silently marked done.

---

## PART B — hypothesis-engine Gemini fallback JSON truncation

### Root cause, stated plainly

Two independent problems stacked on the same code path:

1. **Real truncation.** `generateHypothesesForBusiness` calls `callAnthropic` with `maxTokens:
   2048`. When Anthropic fails, `callAnthropic`'s Gemini fallback (`tryGeminiFallback` →
   `callGemini`) forwards that same `2048` as Gemini's `maxOutputTokens`. Gemini is measurably more
   token-hungry than Claude for the same structured JSON — a verbose 5-hypothesis array (title +
   2-3 sentence description + evidence_summary each) genuinely exceeds 2048 tokens and hits
   `MAX_TOKENS` mid-array, every time.
2. **A second, redundant, weaker parse discarding the first, better one.** `callAnthropic`'s Gemini
   fallback already parses the raw text via `parseLLMJsonOr` (a 5-strategy tolerant parser — fence
   stripping, balanced-brace extraction, trailing-comma cleanup) into `result.data`. But
   `generateHypothesesForBusiness` **ignored `result.data` entirely** and re-parsed `result.raw`
   from scratch via `parseHypothesesFromText` — a plain `JSON.parse` with zero repair tolerance.
   Neither parser can repair genuinely truncated (missing-closing-bracket) JSON — that's a real
   limitation, not a parser bug — but running two independent parse attempts on the same text, the
   second one strictly weaker than the first, was pure waste even before truncation entered the
   picture.

### Fix

- `maxTokens: 2048 → 4096` for this specific call — real headroom for Gemini's fallback output,
  still cheap for a once-daily cron.
- `generateHypothesesForBusiness` now uses the already-parsed `result.data` directly instead of a
  second, weaker re-parse of `result.raw`.
- `callGemini` now checks `finishReason === 'MAX_TOKENS'` and logs a loud, specific warning — this
  exact failure mode had zero visibility anywhere until a live Vercel-log dig was needed to find
  it; a future recurrence (a different caller with a still-too-tight budget) should be diagnosable
  from `aria_ai_calls` alone.

### Days of hypotheses lost — precise, not estimated

Checked `aria_ai_calls` for `agent_key='hypothesis_engine'` day-by-day:

- **2026-06-25 → 07-09 (15 days):** Anthropic failed every day (credit exhaustion). **Zero Gemini
  attempts were logged at all** for this agent in that window — not a truncation issue, a *missing
  fallback* issue. Confirmed via `git log -S`: the Anthropic→Gemini→templated failover consolidation
  itself is commit `c5ba5b8a`, dated **2026-07-10 04:36 AEST** — before that commit, a failed
  Anthropic call just returned the static empty fallback with no Gemini attempt whatsoever. This
  15-day gap is a **separate, already-resolved** problem (by that same commit), not the truncation
  bug this sprint fixes.
- **2026-07-10 → today (5 days, 2026-07-10/11/12/13/14):** Gemini fallback calls succeed at the
  HTTP level every time (`aria_ai_calls` shows real `provider='google', success=true` rows,
  including for other agents platform-wide the whole time, confirming Gemini itself was never the
  problem) — but the JSON truncation bug discarded every single one. **5 days of generated
  hypotheses were silently lost to this specific bug.**

---

## PART C — Fire-and-forget sweep (report only, no fixes)

Two confirmed bugs (loyalty award on KDS-driven completion, KDS ticket creation) share this shape:
a downstream side-effect fires with no confirmation, no retry, and no alerting on failure. Swept
the codebase for the same shape elsewhere. **Ranked list below — not fixed, becomes its own
prioritized backlog.**

| # | Risk | Finding | File:line |
|---|------|---------|-----------|
| 1 | **HIGH — new finding, not in either seed bug** | **Double stock decrement on every terminal sale.** `/api/pos/sale` already awaits a correct, canonical stock decrement (`adjustOutletStock`). The terminal *also* fires an extra, un-awaited `sb.rpc('decrement_outlet_inventory', ...).catch(() => {})` against the same table/column — confirmed this RPC is the sole, correct decrement mechanism elsewhere (`pos/outlet-transfers/route.ts`), meaning every tracked-stock item sold at the terminal is silently decremented twice. Produces phantom low-stock/86 states with no obvious cause. | `src/app/pos/(fullscreen)/terminal/page.tsx:1677-1691` |
| 2 | HIGH | **Loyalty redemption never verified at the terminal.** The discount is applied and the receipt printed *before* `POST /api/pos/loyalty/redeem` even fires — fire-and-forget, response never read. If it fails, the customer keeps full points/stamps while having already received the discount. Only mechanism that deducts `points_balance`/`stamps_count`. | `terminal/page.tsx:1636-1648` → `pos/loyalty/redeem/route.ts` |
| 3 | HIGH | **Store-credit ("preload") spend never verified at the terminal.** Same shape as #2, against a prepaid-liability balance instead of points. | `terminal/page.tsx:1649-1654` → `loyalty/preload/spend/route.ts` |
| 4 | HIGH | **xero-auto-sync cron has zero monitoring.** Per-business failures caught in an inner loop, never rethrown; not wrapped in `trackCron`/`withCronRetry` (unlike sibling `xero-sync`) so nothing lands in `cron_runs` or Sentry; outer dispatcher only `console.log`s. A business's Xero push can fail silently indefinitely. | `src/app/api/cron/xero-auto-sync/route.ts`, `src/lib/cron/dispatch.ts:19-42` |
| 5 | HIGH | **Stripe-paid online order may never reach the kitchen.** `fireKdsForOrder` inside `waitUntil`, failure only logged to `activity_log`, no alert/retry. A charged customer's order can silently never appear on any kitchen screen. Same failure shape as the KDS bug fixed in Part A, on the Stripe-payment path instead of the in-person terminal. | `src/app/api/webhooks/stripe-orders/route.ts:99-111` |
| 6 | MEDIUM-HIGH | **Split-payment breakdown rows fire-and-forget.** `pos_sales.total_amount` is correct, but the cash/card breakdown end-of-day till reconciliation depends on can silently go missing. | `terminal/page.tsx:1656-1660` → `pos/sale-payments/route.ts` |
| 7 | MEDIUM | **Gift card ledger entries can silently vanish.** Balance itself updates synchronously first (correct), but the audit ledger for dispute/reconciliation can be silently incomplete — failure only reaches `console.error`, weaker than the `activity_log` pattern used elsewhere. | `src/app/api/pos/gift-cards/route.ts:86,114` |
| 8 | MEDIUM | **Online-order status-transition notifications** (SMS/email/`cx_notifications`) — well-built individually (SMS→email fallback, contact validation) but a total-chain failure (e.g. both providers down) is invisible beyond an unwatched `activity_log` row. | `pos/online-orders/[id]/route.ts:107-173`, `pos/kds/[id]/route.ts:86-176` |
| 9 | MEDIUM | **Staff commission calculation fire-and-forget.** Silent failure means commission simply never records for that sale — invisible until a pay dispute. | `terminal/page.tsx:1663-1676` |
| 10 | LOW-MEDIUM | **`aria_ai_calls` cost-logging swallowed across ~15+ routes** (`console.error` only, no alert) — the same undercounting mechanism the AI-COST-AUDIT-1 incident already flagged, now confirmed to recur at scale rather than being isolated to the three paths previously named. | e.g. `pos/gift-cards/aria-check/route.ts:30-32`, `pos/online-orders/aria-upsell/route.ts:35`, `customers/[id]/summarise/route.ts:82-94` |
| 11 | LOW-MEDIUM | **Aria autopilot outcome-tracking gap.** A failure means an approved/executed action never gets its outcome row — corrupts Aria's own ROI-learning loop silently. Not customer-facing. | `aria/actions/[id]/route.ts:59-77` |
| 12 | LOW | **Community engagement notifications** — explicitly documented as fire-and-forget by design; cosmetic/social, not business-critical. | `src/lib/community/notifications.ts` |
| 13 | LOW | **KDS auto-fire itself** — included for completeness; this is Part A's own bug, now fixed. | `terminal/page.tsx:1622-1629` |
| 14 | LOW | **Sentry webhook auto-diagnosis** — internal tooling only; failure just means a diagnosis ticket misses its AI writeup. | `src/app/api/sentry/webhook/route.ts:244-247` |
| 15 | LOW, not actionable | Dozens of UI-refresh `.catch(() => {})` calls across dashboard/community pages — read-only, failure just means stale UI, self-evident to the user. Listed for completeness, not a backlog item. | various `dashboard/**/page.tsx` |

**Notable non-findings (checked, confirmed safe):** the canonical stock-decrement path
(`adjustOutletStock`/`recordSaleMovements`) is awaited synchronously everywhere *except* the
terminal's duplicate call (#1); `/api/loyalty/earn`'s terminal fire-and-forget call is a deliberate
no-op left for backward compatibility (real earning happens synchronously inside `/api/pos/sale`,
comment `WIRE-1`) — looks identical in shape to #2/#3 but isn't a risk.

---

## Commit / build verification

- Part A: tsc 0, build 0.
- Part B: tsc 0, build 0.
- Part C: no code changes, per its own rule.
- `vercel.json` unchanged. `pos_kds_tickets` schema unchanged (no migration needed — the fix is
  entirely in how identity is resolved before insert, not the table shape).
