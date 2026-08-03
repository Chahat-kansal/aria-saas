# BUG-HUNT-1 — Systematic Audit Report

Read-only investigation. **Nothing in this repo was changed to produce this report.** Three parallel
sweeps, cross-referenced against this project's own sprint history so nothing already fixed is
re-reported. One synthesized, risk-ranked list follows — write a fix sprint directly from any item below.

## How to read this

Findings are grouped by real business risk, not by which of the three parts (A/B/C) found them:

- **TIER 0 — CRITICAL**: unverified WRITE with essentially zero access check, or a chain that reaches
  real money/financial-data exfiltration across tenants.
- **TIER 1 — HIGH**: unverified WRITE with a partial/discarded check, or a cross-tenant READ of
  clearly sensitive data (cost price, revenue, PII).
- **TIER 2 — MEDIUM**: cross-tenant READ of moderately sensitive data, or a WRITE with real but
  narrower impact / an unconfirmed downstream consequence.
- **TIER 3 — LOW**: data-integrity pollution, unreachable from any shipped UI, or low-severity
  fire-and-forget of a non-critical signal.
- **PART A** (place-order / sync-offline vs. `createSale()`) and **PART B** (fire-and-forget sweep)
  are kept as their own sections since each is a cohesive audit of a bounded surface, with an
  internal ranking — cross-referenced into the tiers above where they overlap.

Every finding below was read in full by an agent that also checked this codebase's own security
reports (`SECURITY-P1/P2/P3-LITE-REPORT.md`, `SECURITY-AUTHZ-AUDIT.md`) and relevant sprint history to
avoid re-reporting fixed items. Where an agent verified live RLS policy behavior via Supabase MCP
before flagging something, that's noted — several "looks bad on first read" cases turned out to be
covered by DB-level RLS and were correctly *not* reported as bugs.

---

## TIER 0 — CRITICAL

### 0.1 — Xero OAuth callback: zero auth, unsigned client-controlled `business_id` → cross-tenant financial-data exfiltration
**`src/app/api/integrations/xero/callback/route.ts`** (whole file, lines 9-69)

No `supabase.auth.getUser()` call at all — every sibling OAuth callback (Facebook, Google, Instagram,
Square, Slack, Shopify, Kounta, Lightspeed-X) checks the live session; this one doesn't. It decodes
`state` as **unsigned** base64url JSON and trusts the embedded `business_id` outright, then writes real
Xero tokens onto that business via `supabaseAdmin` (bypasses RLS):
```ts
const decoded = JSON.parse(Buffer.from(state, 'base64url').toString()) as { business_id: string }
business_id = decoded.business_id
...
await supabaseAdmin.from('businesses').update({
  xero_access_token: tokens.access_token, xero_refresh_token: tokens.refresh_token,
  xero_tenant_id: tenant.tenantId, xero_connected_at: new Date().toISOString(),
}).eq('id', business_id)
```
Unlike Square/Slack/Shopify/Kounta/Lightspeed-X (all migrated to the CONNECTOR-VAULT-1a pattern — a
random `auth_state_token` row stored server-side and redeemed on callback), there is no stored state
to check `state` against. Xero's own OAuth server only echoes `state` back verbatim.

**Exploit:** attacker completes their own legitimate Xero consent (their own Xero org), then edits the
`state` param on the redirect to `base64url(JSON.stringify({business_id: '<victim-uuid>'}))` before
hitting the callback. The victim's business is now linked to the attacker's Xero tenant. Any
subsequent sync pushes the **victim's real sales/invoice data into the attacker's Xero account** —
cross-tenant financial-data exfiltration via a legitimate-looking connected integration.

**Companion bug making this trivial to trigger — 0.1b:** `src/app/api/integrations/xero/connect/route.ts:16-28`
accepts `business_id` from the query string with no ownership check (only falls back to session-derived
resolution when the param is *absent*). An attacker doesn't even need to intercept the redirect — they
can call `GET /api/integrations/xero/connect?business_id=<victim-uuid>` directly.

---

### 0.2 — `sales/return`: client-supplied `sale_item_id` reaches a business-id-blind RPC → cross-tenant refund fabrication
**`src/app/api/pos/sales/return/route.ts:30-31,45`**, backed by **`decrement_stock_quantity`/`claim_return_qty` RPC** (`supabase/migrations/20260623150000_pos_race_atomics.sql:39-48`, `WHERE id = p_item_id` only — no business_id)

```ts
const itemIds = items.map((i) => i.sale_item_id)   // client body
const { data: origItems } = await supabase.from('pos_sale_items').select('*').in('id', itemIds)
// no .eq('business_id', bid); no check items belong to the already-verified sale_id
```
An attacker in Business A can supply `sale_item_id`s belonging to Business B's sales: (a) reads back
Business B's product/price/qty/tax data, (b) the RPC mutates `returned_quantity` on Business B's real
row, (c) the attacker's own business gets a fabricated refund/`pos_sales` row and inventory reversal
built from foreign data — directly corrupts the gross-vs-net revenue ledger CLAUDE.md RULE 6 and
BRIEF-INTEGRITY-2 treat as a first-class concept.

---

### 0.3 — `orders/receive`: client-supplied purchase-order line id → cross-tenant PO corruption
**`src/app/api/pos/orders/receive/route.ts:63-66,75-77`**

Business ownership is verified for `order_id` and `product_id`, but `item.line_id` (from `req.json()`)
is used directly in both a READ and a WRITE against `pos_purchase_order_items` with no business filter:
```ts
const { data: poLine } = await supabase.from('pos_purchase_order_items').select('unit_cost').eq('id', item.line_id).maybeSingle()  // cross-tenant READ
...
await supabase.from('pos_purchase_order_items').update({ quantity_received: item.received_qty, receive_status: receiveStatus, received_at: ... }).eq('id', item.line_id)  // cross-tenant WRITE
```
An attacker authenticated to their own business can submit a receive request whose `line_id` points at
another business's purchase-order line, silently corrupting that tenant's purchasing/inventory records.

---

### 0.4 — `product-batches/[id]/decrement`: no tenant scoping at all — the exact `bid`-computed-then-discarded pattern
**`src/app/api/pos/product-batches/[id]/decrement/route.ts:18-27`**

```ts
const bid = (_ab?.business_id as string) ?? null   // correctly derived...
...
const { data: batch } = await supabase.from('pos_product_batches').select('quantity_remaining').eq('id', id).maybeSingle()  // ...never applied
await supabase.from('pos_product_batches').update({ quantity_remaining: newQty, ... }).eq('id', id)  // ...never applied
```
`bid` is computed and then **never used** on either the read or the write — the worst variant of this
bug class, since even the intent to check is visible in the code and simply wasn't wired up. Any
authenticated user can zero out (floored via `Math.max(0, ...)`) another business's tracked batch
quantity purely by knowing/guessing the batch UUID.

**This connects directly to a Part B finding (§B.2 below)**: the terminal UI fires this exact endpoint
fire-and-forget from the client. Fixing the fire-and-forget without fixing this server-side check
leaves the vulnerability fully intact (just now confirmed rather than silent); fixing the server check
without fixing the fire-and-forget leaves the *legitimate* same-tenant call still unreliable. Both need
fixing together for this endpoint to be correct.

---

### 0.5 — `future-prices`: client-supplied `product_id` → cross-tenant price sabotage via a delayed write
**`src/app/api/pos/future-prices/route.ts`**

POST (lines 36-51) inserts a scheduled price change with the correct session-derived `business_id`, but
never checks the client-supplied `product_id` belongs to it. The auto-apply GET (lines 21-29) later
does the actual price write scoped **only by `id`, not `business_id`**:
```ts
await supabase.from('pos_products').update({ price: fp.new_price }).eq('id', fp.product_id)  // no business_id filter
```
Attacker in Business A schedules a $0.01 future price for Business B's product with today's date; the
next time *anyone* loads `GET /api/pos/future-prices` (which the attacker will naturally trigger
themselves), the unscoped update silently overwrites Business B's live price.

---

### 0.6 — `sale-payments`: `sale_id` trusted with zero ownership check, no `business_id` on the row at all
**`src/app/api/pos/sale-payments/route.ts:8-47`**

`bid` is fetched (gates "must belong to *a* business") but never checked against the client-supplied
`sale_id`, and the insert doesn't even set `business_id` on the new row:
```ts
const { data, error: insertErr } = await supabase.from('pos_sale_payments').insert({ sale_id, method, amount_cents, reference }).select('id').single()
```
Any authenticated user of any business can inject a fake payment record into another tenant's sale,
corrupting their payment reconciliation/split-payment totals — same table Part B's terminal-page
fire-and-forget call also writes to (§B.1), a second independent way this table's integrity is at risk.

---

## TIER 1 — HIGH

### 1.1 — `mobile-session/[id]/submit`: session ownership check bypassed by client-supplied `business_id` override
**`src/app/api/pos/mobile-session/[id]/submit/route.ts:15-22,66-83`**

`session` is fetched by id with no business scoping; `const bid = business_id || session.business_id`
lets the client-supplied value silently override the session's true owner, and the ownership check only
verifies the attacker owns *that* `bid` — never that `session.business_id === bid`. The completion write
(status, `submitted_by`, notes) is scoped only by `.eq('id', params.id)`. For `session_type === 'order'`,
Business A's scanned product/cost data gets copied into the attacker's own `purchase_order_drafts` —
cross-tenant inventory/cost-data leak plus an unauthorized state mutation on another tenant's record.

### 1.2 — `mobile-session` PATCH: complete absence of tenant check (companion to 1.1, different verb)
**`src/app/api/pos/mobile-session/route.ts:75-96`**

Unlike GET/POST in the same file, PATCH never calls `getBid` or checks ownership at all — any
authenticated user can PATCH any `mobile_inventory_sessions` row's `scanned_items`/`status`/`notes` by
guessing its id.

### 1.3 — `timed-prices`: PATCH/DELETE have zero tenant scoping (GET/POST in the same file are correct)
**`src/app/api/pos/timed-prices/route.ts:90-113`**

`bid` isn't even fetched in PATCH/DELETE. Any authenticated user can silently edit or delete another
business's scheduled/happy-hour pricing.

### 1.4 — `production-plan` PATCH: only checks *some* user is logged in, no business resolution at all
**`src/app/api/pos/production-plan/route.ts:162-171`**

`supabaseAdmin.from('pos_production_plans').update({...}).eq('id', body.id)` — no `getBid`, no
business_id anywhere in the handler, admin client bypasses RLS. Any logged-in user can overwrite any
business's production-plan `actual_qty`/notes.

### 1.5 — `products/generate-image`: verified `businessId` doesn't gate the actual write target (`productId`)
**`src/app/api/pos/products/generate-image/route.ts:76-82,235-242`**

`businessId` ownership is checked correctly, but the separate client field `productId` used in the final
`pos_products` update is never checked against it, and the write uses the service-role client. Attacker
spends their own image-generation credit but overwrites a *different* business's product image —
cross-tenant catalog tampering via a guessable UUID.

### 1.6 — `customer-intel`: client `customer_id` fetches full PII record with no business filter
**`src/app/api/aria/customer-intel/route.ts:36`**

`bid` correctly scopes the *sales* query, but `pos_customers` itself is fetched by raw `customer_id`
with no business filter — any authenticated user gets another tenant's customer's full record (name,
loyalty points, visit history) plus an AI-generated CLV/churn profile built from it. Same shape as the
already-fixed KDS bug: an identifier used as a scoping key without ownership verification.

### 1.7 — `competitor-watches`: GET and POST skip the ownership check the sibling DELETE has
**`src/app/api/aria/competitor-watches/route.ts:61-70 (GET), 147-158 (POST)`**

Both take `business_id` from the client with zero ownership check, using `supabaseAdmin` (bypasses
RLS). GET also auto-seeds new watch rows for the guessed `business_id`. POST lets any user write
arbitrary competitor-watch rows into any other business. The fact that DELETE in the same file *does*
check ownership makes this look like an oversight in the two siblings, not a deliberate public mode.

### 1.8 — `pos_customers` PATCH: mass-assignment lets `business_id` itself be overwritten in the SET clause
**`src/app/api/pos/customers/route.ts:178`**

The `WHERE` clause correctly scopes to the caller's own business, but the entire client-supplied `body`
is spread into `.update()` with no field allowlist — nothing stops `body.business_id` from being
included. An attacker can PATCH their own customer row and reassign it into another tenant's business
by setting `business_id` in the payload. (RLS `WITH CHECK` policy definition for this table wasn't
found in tracked migrations, so whether DB-level defense-in-depth exists here is unconfirmed —
regardless, the route itself has no allowlist.)

### 1.9 — `pos/price-points` GET: fully unscoped cross-tenant pricing/cost read
**`src/app/api/pos/price-points/route.ts:15-34`**

PATCH/DELETE in the same file verify product ownership; GET has no `business_id` scoping and doesn't
verify `product_id`/`outlet_id` ownership. Omitting both query params returns **every** business's
quantity-break pricing/cost tiers in one call.

---

## TIER 2 — MEDIUM

- **`price-intelligence`** (`src/app/api/aria/price-intelligence/route.ts:25-28`) — session-derived
  `bid` is computed then silently overridden by a client-supplied `business_id` with no match check;
  leaks another business's stock levels, cost price, and active promotions.
- **`pos-insight`** (`src/app/api/aria/pos-insight/route.ts:29`) — same override pattern; leaks
  today/yesterday/last-week revenue and top product for a guessed business.
- **`product-insights`** (`src/app/api/aria/product-insights/route.ts:38-53`) — `business_id` is
  verified but the separate `product_id` isn't checked against it; leaks a competitor's cost price,
  margin, and 30-day sales velocity. Response cache key is also global, not business-scoped, so a
  leaked result can be served to a second unrelated caller.
- **`splits/[id]/reassign-item`** (`src/app/api/pos/splits/[id]/reassign-item/route.ts:21-28`) — source
  split is verified; `to_split_id` is not, letting a caller inject an arbitrary line item into another
  tenant's active bill-split.
- **`splits/ai-suggest`** (`src/app/api/pos/splits/ai-suggest/route.ts:34-37`) — `sale_id` unscoped
  while every other query in the same file correctly scopes by `bid`; returns another business's sale
  items/total in an AI-generated split suggestion.
- **`expiry-alerts` PATCH** (`src/app/api/pos/expiry-alerts/route.ts:42-54`) — the only handler in the
  file with zero business check; any user can acknowledge/toggle another business's expiry alert. The
  POST handler's `mark_down`/`write_off` writes go through the admin client scoped only by
  `product_id`, relying entirely on an RLS read one step earlier to have blocked cross-tenant access.
- **`split-groups/[id]/members`** (`src/app/api/pos/split-groups/[id]/members/route.ts:28-41`) — URL
  `group_id` never checked against `bid` before inserting a member row.
- **`pos/migrate` GET** (`src/app/api/pos/migrate/route.ts:212-223`) — POST handlers scope correctly;
  GET (used to poll import progress) takes a client-supplied `id` with no ownership check, exposing
  another business's import source/field-mapping/error text.
- **Basiq OAuth callback** (`src/app/api/integrations/basiq/callback/route.ts:33-54`) — no auth check,
  no stored-state verification (unlike Kounta/Shopify/Lightspeed-X/Square). With a client-supplied
  `userId`, plants attacker-controlled bank data into a victim's `bank_accounts` and flips
  `basiq_connected` — pollutes rather than exfiltrates, still a genuine cross-tenant write.
- **`outlet-tax-overrides`** (`src/app/api/pos/outlet-tax-overrides/route.ts:33-42`) — `outlet_id`
  verified, `tax_code_id` isn't; downstream exploitability depends on how `pos_outlet_tax_codes` joins
  to `pos_tax_codes` elsewhere (not traced in this pass).

---

## TIER 3 — LOW

- **`aria/outcomes` POST** — client `business_id` skips the safe session-derived fallback path when
  present; data-integrity pollution, real-world exploitability depends on `aria_outcomes` RLS strictness.
- **`competitor-opportunities` / `menu-optimisation`** — both accept `business_id` with no ownership
  check (inconsistent with sibling routes' convention); leak business name/suburb + competitor list, or
  recipe cost-per-serve/margin, respectively — real but relying entirely on RLS as the only backstop.
- **`social-listening`** — leaks only business name/suburb/city as AI prompt context.
- **`loyalty/referrals` Mode B** (`src/app/api/loyalty/referrals/route.ts:97-112`) — inserts a
  cross-tenant `referred_customer_id` with client-controlled point values, but confirmed dead from the
  UI (no shipped caller) and confirmed the real point-crediting path (`evaluateReferrals()`) never
  trusts the stored values — data-integrity pollution only, not a financial exploit.
- **`laybys` / `sales/draft`** — client `customer_id` not verified to belong to `bid` before insert;
  data-integrity risk (a foreign customer_id reference inside your own tenant's row), not a read/leak.
- **`transfers/[id]/transition`** (`src/app/api/pos/transfers/[id]/transition/route.ts:41-47`) —
  client-supplied `pos_user_id` used for a permission check with no business filter; could let an
  attacker borrow another business's staff member's permission flags to unlock a privileged transition.
- **`competitor-prices/auto-adjust` PATCH** — trusts `action_id` alone; likely safe under RLS but not
  confirmed against the live policy in this pass, worth a second look.
- **`business-chat`** — passes client `business_id` into `collectBusinessData()`; not traced into that
  shared lib to confirm internal re-verification — flagged for follow-up, not a confirmed bug.

---

## PART A — `place-order` and `sync-offline` vs. `createSale()`

Neither file calls the consolidated `createSale()` service; both remain fully independent, confirming
this was a real, correctly-deferred gap from POS-SALE-CONSOLIDATE-1 — not something already fixed.

**`place-order/[business_id]/route.ts` — does not match `createSale()` on any guarantee:**
1. **`pos_sale_items` is never populated, at all, for any online order.** `place-order` inserts
   `pos_sales` directly and stamps `sale_id` onto the order immediately — which poisons the *only*
   other code that would ever insert items/decrement stock for an online order
   (`online-orders/[id]/route.ts:55`'s `if (ord && !ord.sale_id)` guard is permanently false by the time
   a merchant accepts). Every online-order sale has zero matching `pos_sale_items` rows, forever —
   breaks COGS/top-seller/category reports and leaves `fireKdsTickets` with nothing to convert.
2. **Stock is never decremented at order time** — only a partial fallback at pickup *completion*
   (`online-orders/[id]/route.ts:238-272`), which calls `adjustOutletStock` only (never the
   `decrement_stock_quantity` RPC `createSale` also uses, and never checks `track_stock`) — a real
   oversell window between order and pickup, and permanent cache/canonical drift.
3. **Loyalty degraded to base-earn-only, and conditional on the merchant manually marking pickup
   complete** — none of challenges/referrals/reward-rules/tier-perks fire; a no-show or a merchant who
   stops at "ready" means the customer earns nothing, ever.
4. **The idempotency key is illusory** — generated fresh *inside* the request being deduped
   (`'ONL-' + Date.now()...`), so a genuine retry can never match the existing-sale lookup. A flaky
   client resubmit creates two orders, two sales, potential double-charge.
5. **No parity with the canonical KDS ticket board** (`pos_kds_tickets`) — only the legacy board.

**`sync-offline/route.ts` — partial match; stock mechanism is correct, everything else is not:**
1. **Zero loyalty integration, structurally** — the offline-sale payload type carries no `customer_id`
   field at all; a barista ringing a known member's sale offline permanently earns them nothing.
2. **No idempotency guard for the actual double-submit scenario** — the only dedup check is scoped to
   the *already-inserted* sale's own id, useless against a genuine client retry of the same original
   transaction; a timeout-then-retry on reconnect double-counts revenue, tax, and stock, and doubles
   the session cash/card total if a session is open.
3. **No `track_stock` gate** — decrements stock for every line item regardless of whether the product
   is meant to be tracked, unlike `createSale`.
4. **No KDS integration at all**, either system.
5. **Fire-and-forget session-totals update — a previously-identified, still-open item.** This exact file
   is named in `prompts/202-fix-fire-and-forget-silent-loss.md:58` as a confirmed candidate; the code
   shows it was never actioned (`Promise.resolve(...).then(() => null, () => null)`, not awaited, not
   `waitUntil`-wrapped) — till-reconciliation risk on every sync.
6. **No Aria-brain feed** — offline-channel activity is invisible to briefings/reorder suggestions.

What *does* match: the dual stock-decrement mechanism (RPC cache + canonical `items_on_hand`) is
awaited per-item and `recordSaleMovements` is called, behaviorally equivalent to `createSale` — just
missing the `track_stock` gate.

**Git-history check:** `place-order` was last touched by a price-verification fix (unrelated to these
gaps); `sync-offline` was genuinely partially fixed by `INV-DECREMENT-FIX phase 2` (the stock mechanism
above) — loyalty/idempotency/KDS gaps predate and survive that commit untouched.

**Ranked, money/stock first:** (1) sync-offline's missing idempotency guard, (2) place-order's missing
`pos_sale_items`, (3) place-order's delayed/partial stock decrement, (4) sync-offline's missing
`track_stock` gate, (5) sync-offline's zero loyalty, (6) place-order's degraded/conditional loyalty,
(7) place-order's illusory idempotency key, (8) both missing KDS-ticket parity, (9) sync-offline's
fire-and-forget session totals, (10) both missing the Aria-brain feed.

---

## PART B — Fire-and-forget sweep

**Prompt 202's "zero IIFEs remain in `src/app/api/`" claim: confirmed true for its literal target, but
misleadingly narrow in scope.** No raw unwrapped IIFE remains server-side. But the sweep only ever
targeted `src/app/api/` and only grepped for IIFE syntax — two other shapes of the identical bug class
are alive today:

### B.1 — MONEY: four fire-and-forget POSTs inside the terminal's post-sale background block
**`src/app/pos/(fullscreen)/terminal/page.tsx:1608`** — a raw client-side IIFE, never awaited by its
caller, runs *after* the receipt is already shown. Inside it, all calls are `.catch(() => {})`
(network-error-only, never checks response status):
- **`preload/spend`** (line 1651) — the sole place a customer's store-credit balance is decremented.
  Lost call = customer keeps a balance they just "spent," can spend it again.
- **`loyalty/redeem`** (line 1638) — the sole place points/stamps are debited for a redemption already
  baked into the sale total. Lost call = the same reward can be redeemed again next visit.
- **`sale-payments`** (line 1656) — feeds `reconciliation-agent.ts`'s cash/card split for till
  reconciliation (same table as TIER 0.6's server-side gap — two independent ways this table's
  integrity is at risk). Lost call = a split-tender sale's cash portion is invisible at cash-up.
- **`loyalty/earn`** (line 1632) — lower severity (under-crediting, not double-spend), still real.

### B.2 — STOCK: new, unfixed instance of the exact INVENTORY-DECREMENT-FIX-1 bug class, different table
**`src/app/pos/(fullscreen)/terminal/page.tsx:1823`** — `fetch('/api/pos/product-batches/.../decrement', ...).catch(() => {})`,
never awaited. `pos_product_batches.quantity_remaining` is a *different* table than the one
`7d3273c9` fixed, so this specific instance was never touched by that sprint. A lost call leaves a
stale/inflated batch quantity feeding directly into expiry-alert/active-batch selection logic. **Also
see TIER 0.4** — the server endpoint this call hits has zero tenant scoping; both halves need fixing.

### B.3 — STOCK: stocktake commit swallows server failures, not just network failures
**`src/app/pos/inventory/stocktake/new/page.tsx:107`** — `await fetch(...).catch(() => {})`, then
navigates away regardless. `fetch()` doesn't reject on 4xx/5xx and the response is never checked — a
staff member's entire physical stock count can be silently discarded with zero indication anything
went wrong. Same shallow-catch anti-pattern as the KDS-FIX-1 root cause, here on a `.tsx` client write.

### B.4 — Systemic server-side pattern Prompt 202's grep structurally could not match
A bare `import('@/lib/aria/brain').then(({ logActivity, ariaObserve }) => {...}).catch(() => {})` fired
before the response returns, never `waitUntil`-wrapped — not an IIFE, so invisible to the original
sweep's regex. 7 call sites, all money/cash-adjacent: `pos/sessions/route.ts:158,263` (register
open/close — cash-session audit trail), `pos/splits/[id]/pay/route.ts:69`, `pos/returns/route.ts:84`,
`pos/orders/receive/route.ts:118`, `aria/sync-reviews/route.ts:204,212`. In every case the actual
money-moving write is correctly awaited first — only the Aria intelligence/activity-feed signal is at
risk of silently vanishing under a genuine Vercel freeze, degrading briefing quality with no visible
symptom (relevant to CLAUDE.md's Aria Intelligence Rule).

**Lower priority, noted not itemized:** a price-override audit-log POST is fire-and-forget (the price
change itself is already applied — only the compliance reason-code trail is at risk); ~280 other bare
`.catch(() => {})` instances across dashboard/POS UI are standard read-only
`fetch(...).then(setState).catch(() => {})` patterns with no money/stock/loyalty mutation involved, not
worth itemizing individually. **No unawaited `supabase.rpc()` calls were found in any `.tsx` client
file** — the client-side risk is entirely in bare `fetch()`, not direct RPC.

---

## Coverage — read this before assuming exhaustiveness

- **Part A**: exhaustive — both named files plus their two closest dependencies (`create-sale.ts`,
  `online-orders/[id]/route.ts`) read in full.
- **Part B**: `src/app/api/` fire-and-forget patterns checked exhaustively for the IIFE and
  `.then()`-without-`waitUntil` shapes; client-side (`.tsx`) checked exhaustively for bare `fetch()` and
  `supabase.rpc()`/`.from()` calls, prioritized to money/stock/loyalty-touching code — the ~280
  low-risk UI-population fire-and-forgets were sampled, not individually verified.
- **Part C**:
  - `src/app/api/pos/**` (180 files) — **fully covered**, all 6 batches × 46 files read in full.
  - `src/app/api/loyalty/**` (33 files) and `src/app/api/tickets/**` (9 files) — **fully covered**,
    including live RLS verification via Supabase MCP for ambiguous cases.
  - `src/app/api/integrations/**` (48 files) — **fully covered**.
  - `src/app/api/aria/**` (168 files) — **only ~59 files (~35%) covered.** Sampling prioritized routes
    combining `req.json()`/`searchParams` with a write, or a read keyed by a client-supplied id. The
    remaining ~109 files (`ask/*` sub-routes, `deliverable-*`, `roster/*`, `theft-detection`,
    `dynamic-pricing`, `feature-builder`, `compliance`, `command`, `plan`, `skills`, `nps`,
    `booking-insights`, `weekly-report`, `explain-metric`, and most Haiku/Sonnet insight generators)
    were **not opened and should not be assumed safe**.
  - `src/app/api/dashboard` (6), `api/social` (5), `api/training` (7), and the ~14 smaller groups —
    **not covered this pass at all**, per the task's own explicit prioritization order.
- The mechanical `getBid()` migration count itself (~33/362 files still on the canonical helper) is
  **unchanged by this report** — this sweep looked for the security bug, not the maintainability one;
  most files flagged above already had a locally-correct `getBid()`/`bid` derivation and failed on a
  *second*, unrelated client-supplied identifier instead.

## Cross-references confirmed, not re-reported

Reels-usage (fixed, `3b0425c3`), kiosk cookie (fixed), KDS ticket identity (fixed, `7fe80d3e`),
INVENTORY-DECREMENT-FIX-1's original `pos_outlet_inventory` bug (fixed, `7d3273c9`), Prompt 202's
29-route IIFE sweep (fixed, `a9971cfc` — see B's caveat on scope), `sync-offline`'s stock-decrement
mechanism (fixed, `842af9fe`), `place-order`'s client-trusted `unit_price` (fixed, `f7bca29a`) — none
of these are re-flagged above; every finding in this report is either new or a previously-documented
but explicitly-deferred gap (Part A, and B.3's stocktake item from `prompts/202-...md`).
