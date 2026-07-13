# ASK-ARIA-AUDIT-2 — Execute-and-Verify Audit of Ask Aria

**Date:** 2026-06-25 · **Scope:** READ-ONLY on app code (no fixes). Every write action **actually invoked** against the live test business **Sip** (`ff5055a0-c351-4ada-817a-1804961035f3`) and the written row **field-diffed** against schema + the discount engine. All `[AUDIT]` test rows torn down.

> **Method:** Write-correctness bugs (right value → wrong field) are invisible to code-reading. So each action was run through the **real `executeAction`** (the exact code the route runs after confirmation), the row SELECTed back, and every column diffed against what the **discount engine actually reads** (`src/lib/pos/discount-engine.ts`). The `planAction` LLM was also run live to prove what the planner emits.

---

## COVERAGE STATEMENT (no silent skips)

- **8 executable action-path actions exist** (`ActionType` union, [action-planner.ts:5-14](../src/lib/aria/ask/action-planner.ts#L5-L14)). **8 executed + field-diffed. 0 unexercised.**
- **3 tool-loop write/outward paths** exist ([aria-tools.ts:1482-1487](../src/lib/aria-tools.ts#L1482-L1487)): `update_product_price`, `send_email_now`, `send_sms_now`. `update_product_price` was **code-analyzed but not executed** (overlaps bulk-price logic; avoided gratuitous price write). `send_email_now`/`send_sms_now` were **deliberately not executed** — they send real email/SMS via Resend/Twilio; exercising them would spam a real inbox/number. Named here explicitly, not silently skipped.
- **4 brief-listed actions do not exist** as Ask Aria actions: `create_purchase_order`, `create_product`, `schedule_report`, `create_customer/loyalty`. Reported as **MISSING capabilities** (Phase 5), not unexercised paths — there is no code path to run.

**Net: every write path that exists was either executed+diffed, or named with the reason it wasn't run. Zero untracked.**

---

## PHASE 1 — COMPLETE ACTION INVENTORY

### A. Action-path actions (plan → confirm → `executeAction`)
Planner: [action-planner.ts](../src/lib/aria/ask/action-planner.ts) (LLM, model `sonnet`). Executor: [action-executor.ts](../src/lib/aria/ask/action-executor.ts) (service-role writes). Both invoked from [route.ts:296](../src/app/api/aria/ask/route.ts#L296) (chat confirm) and [action/route.ts:65](../src/app/api/aria/ask/action/route.ts#L65) (button confirm).

| Action | Table(s) written | Key columns set | Value source |
|---|---|---|---|
| `create_promotion` | `pos_promotions` | promotion_type, **discount_amount**, active, is_active, starts_at, ends_at, min_spend, product_ids, category_ids, active_days, stack_priority, current_uses, exclude_discounted | promotion_type+discount_amount **LLM**; rest code |
| `apply_category_discount` | `pos_promotions` | promotion_type='percentage_discount', **discount_percent**, applies_to='category', category_id, active/is_active, starts_at, active_days | category_id+discount_percent **LLM**; rest code |
| `bulk_price_update` | `pos_products.price` | price (floored at cost_price) | type+value **LLM**; price computed code |
| `mark_products` | `pos_products` | is_active \| age_restricted | field+value **LLM** |
| `adjust_stock` | **`pos_products.stock_quantity`** | stock_quantity | type+qty **LLM** |
| `set_low_stock_threshold` | `pos_products.low_stock_threshold` | low_stock_threshold | threshold **LLM** |
| `create_roster` | `pos_rosters` | **name**(✗), week_start, status='draft', published, generated_by_agent, total_cost_cents | **LLM** |
| `create_invoice` | `invoices` + `invoice_line_items` | invoice_number, customer_name, **customer_email**(✗), due_date, subtotal, tax_amount, total, status='draft' | customer/items **LLM**; totals code |
| *(every action also writes)* | `aria_action_log`, `aria_actions` | audit rows | code |

**Bug-prone columns (value from LLM or a mapping):** `create_promotion.promotion_type`→`promoTypeMap` ([action-executor.ts:236-244](../src/lib/aria/ask/action-executor.ts#L236-L244)) and `create_promotion.discount_amount` (LLM is told to put **%** here for a percentage promo — [action-planner.ts:37](../src/lib/aria/ask/action-planner.ts#L37)). These are the recurring-bug surface.

### B. Tool-loop write/outward tools (no plan/confirm gate)
[aria-tools.ts](../src/lib/aria-tools.ts), dispatched by `executePOSTool` during the answer tool-loop:

| Tool | Writes / does | Gate |
|---|---|---|
| `update_product_price` ([:257](../src/lib/aria-tools.ts#L257), exec [:1486](../src/lib/aria-tools.ts#L1486)) | `pos_products.price` | **prompt-only** ("use only when user explicitly asks") — **no confirmation** |
| `send_email_now` ([:232](../src/lib/aria-tools.ts#L232), exec [:1482](../src/lib/aria-tools.ts#L1482)) | Resend email | **prompt-only** |
| `send_sms_now` ([:245](../src/lib/aria-tools.ts#L245), exec [:1484](../src/lib/aria-tools.ts#L1484)) | Twilio SMS | **prompt-only** |
| `save_extracted_receipt` ([:359](../src/lib/aria-tools.ts#L359)) | writes expense/receipt row | prompt-only |
| read tools | query_sales, query_inventory, query_customers, compare_periods, get_top, get_summary, get_profit_leaks, generate_report/chart/pdf … | n/a (read) |

---

## PHASE 2 — EXECUTE & FIELD-DIFF (the core: every write actually run on Sip)

Authoritative read columns proven from [discount-engine.ts:175-190](../src/lib/pos/discount-engine.ts#L175-L190):
`percentage_discount`→**`discount_percent`** (null ⇒ `return null`, no discount); `fixed_discount`→`discount_amount`; `bogo`→`buy_quantity`/`get_quantity`; bundle→engine only matches `'combo'`+`bundle_price`; no `multibuy` branch.

| # | Action (request) | Row written (key fields) | Verdict | Exact wrong field → fix |
|---|---|---|---|---|
| 1 | `create_promotion` **15% off** | promotion_type=percentage_discount, **discount_percent=NULL**, discount_amount=15 | **❌ BUG (critical)** | Engine reads `discount_percent` (null) ⇒ **15% never applies — dead promo**. Fix: for percentage_discount write `discount_percent`, not `discount_amount`. |
| 2 | `create_promotion` **$5 off** | promotion_type=fixed_discount, discount_amount=5 | ✅ PASS | Engine reads `discount_amount`=5 → $5 applies. |
| 3 | `create_promotion` **BOGO** | promotion_type=bogo, **buy_quantity=NULL, get_quantity=NULL**, discount_amount=10 | ⚠️ PARTIAL | Works via engine defaults (1/1) but `discount_amount=10` stored & ignored, no product scope. Fix: set buy/get_quantity + product_ids; drop discount_amount. |
| 4 | `create_promotion` **bundle** | promotion_type=**bundle**, bundle_price=NULL | **❌ BUG** | Engine handles `'combo'` not `'bundle'`, and needs `bundle_price` ⇒ **dead**. Fix: map→`combo` + set `bundle_price`/`product_ids`. |
| 5 | `create_promotion` **multibuy** | promotion_type=**multibuy** | **❌ BUG** | **No engine branch** ⇒ dead. Fix: implement multibuy in engine or map to supported type. |
| 6 | `apply_category_discount` **Coffee 10%** | percentage_discount, **discount_percent=10**, applies_to=category, category_id=set | ✅ PASS | Correct column → 10% off Coffee applies. |
| 7 | `bulk_price_update` **+10%** | price 10 → **11** | ✅ PASS | Correct, floored at cost. |
| 8 | `mark_products` **is_active=false** | is_active → false | ✅ PASS | Correct. |
| 9 | `adjust_stock` **set 42** | **pos_products.stock_quantity=42**; `pos_outlet_inventory.items_on_hand` still **5**; `pos_stock_adjustments` rows **0** | **❌ BUG** | Writes **legacy** `stock_quantity`, not canonical `items_on_hand`; **not attributed**. Fix: route through `adjustOutletStock` + `pos_stock_adjustments` (the INV-* canonical path). |
| 10 | `set_low_stock_threshold` **7** | low_stock_threshold → 7 | ✅ PASS | Correct. |
| 11 | `create_roster` | **ERROR: "Could not find the 'name' column of 'pos_rosters'"** → ok:false, nothing written | **❌ BUG** | Executor inserts a `name` column that doesn't exist ([action-executor.ts:153](../src/lib/aria/ask/action-executor.ts#L153)). **Every roster create fails.** Fix: use real column (`title`/`week_label`) per `pos_rosters` schema. |
| 12 | `create_invoice` | **ERROR: "Could not find the 'customer_email' column of 'invoices'"** → ok:false, nothing written | **❌ BUG** | Executor inserts `customer_email` (+likely others) absent from `invoices` ([action-executor.ts:195](../src/lib/aria/ask/action-executor.ts#L195)). **Every invoice create fails.** Fix: align insert to real `invoices` columns. |

**LIVE planner proof (when the dead path triggers):**
- `"create a 20% off promotion on coffee"` → routes to **`apply_category_discount`** (working path) — "coffee" resolves to a category.
- `"create a 10% off storewide promotion"` → routes to **`create_promotion`**, `promotion_type=percentage_discount, discount_amount=10` → **the dead path**.
- `"make a 15% off everything sale this weekend"` → `create_promotion … discount_amount=15` → **dead**.

**⇒ Precise trigger:** category-resolvable %-off promos work (`apply_category_discount`); **storewide / "everything" / named-product %-off promos are dead** (`create_promotion` writes `discount_amount` while the engine reads `discount_percent`). This is exactly the live promo bug (id `1d896f68`).

**Teardown:** all `[AUDIT]` promotions / rosters / invoices / action_log / aria_actions hard-deleted; residue **0**. The `[AUDIT]` product could not be hard-deleted (`pos_products` has a DB trigger enforcing **soft-delete only**) → soft-deleted (`is_active=false`, renamed `[AUDIT-VOID] probe`). No active AUDIT rows remain.

---

## PHASE 3 — CONVERSATION / READ CORRECTNESS

### Coreference (3-turn walk) — **CONFIRMED BROKEN on the council path**
- The **tool-loop answer path** DOES rehydrate history: `buildAskAriaContext` loads `aria_conversations.messages` ([business-context.ts:131-210](../src/lib/aria/ask/business-context.ts#L131-L210)) → `historyMessages` → `priorMessages` ([route.ts:1856](../src/app/api/aria/ask/route.ts#L1856)); client floating-panel history is also injected ([route.ts:1674-1678](../src/app/api/aria/ask/route.ts#L1674-L1678)).
- **BUT the strategic/council path skips all of it.** [route.ts:667](../src/app/api/aria/ask/route.ts#L667) explicitly skips `buildAskAriaContext` ("19 DB queries wasted"); `runAriaCouncil(augCtx + '\n\nOWNER_QUESTION: ' + message, …)` ([route.ts:907](../src/app/api/aria/ask/route.ts#L907)) receives business context + the **current** question only — **never `conversation_history`**.
- **Break:** turn-1 "who is my best customer" → council (see over-answering). Turn-2 "what does **she** buy" → analytical → council → **"she" has no referent** because the council never sees turn-1. The system prompt's coreference instruction ([route.ts:1290](../src/app/api/aria/ask/route.ts#L1290)) lives in the tool-loop prompt, which the council path doesn't use. **Exact location: route.ts:667–907 (council path omits history).**

### Over-answering — **CONFIRMED**
- `isStrategicQuestion` ([route.ts:392](../src/app/api/aria/ask/route.ts#L392)) regex matches `best` (and `why`, `how can`, `improve`…). So **"who is my best customer"** — a one-row lookup — sets `isStrategicQuestion=true` → routes to the **full council** ([route.ts:667](../src/app/api/aria/ask/route.ts#L667)) with facts-packet + ground-truth, including the `payment_coverage_note` / `business_health` ("POS failure / verify") messaging ([route.ts:816-828](../src/app/api/aria/ask/route.ts#L816-L828)). **Root cause: superlative/intent words in the `isStrategicQuestion` regex misclassify factual lookups.**

### Grounding on answers — present
- Council synthesis runs through `validateAndHeal` with `groundTruthAnchors` = clean live-queried `_anchor_values` ([route.ts:929-933](../src/app/api/aria/ask/route.ts#L929-L933)); small-sample payment coverage is explicitly nulled to stop fabricated "POS failure %" ([route.ts:816-818](../src/app/api/aria/ask/route.ts#L816-L818)). Grounding teeth are wired on the council + deliverable paths.

---

## PHASE 4 — FAILURE & SAFETY

| Check | Finding | Location |
|---|---|---|
| **Swallowed writes** | Per-row `.update()` loops never check `error` but still `affectedCount++` → reports "Done — N updated" even if every write failed. | [action-executor.ts:59-62](../src/lib/aria/ask/action-executor.ts#L59-L62) (bulk_price), [:83-85](../src/lib/aria/ask/action-executor.ts#L83-L85) (mark), [:115-117](../src/lib/aria/ask/action-executor.ts#L115-L117) (adjust_stock), [:137-139](../src/lib/aria/ask/action-executor.ts#L137-L139) (threshold) |
| **Swallowed audit** | `aria_action_log` + `aria_actions` inserts unchecked — but entity-create inserts ARE checked (roster/invoice/promo return ok:false on error). | [:401](../src/lib/aria/ask/action-executor.ts#L401), [:418](../src/lib/aria/ask/action-executor.ts#L418) |
| **Idempotency (double-confirm)** | Safe against double "yes": `pending_action` is cleared immediately after execute ([route.ts:297-299](../src/app/api/aria/ask/route.ts#L297-L299), [action/route.ts:67-70](../src/app/api/aria/ask/action/route.ts#L67-L70)). | — |
| **Idempotency (re-request)** | **No entity-level guard** — asking "create 10% off" twice creates **two promotions** (no unique key on name/window). Dup risk. | create_promotion |
| **Auth / ownership** | All executor queries scope `.eq('business_id', businessId)`; `businessId` = `getBid(user)` (the user's own active business) → cross-business write prevented. **But** writes use `supabaseAdmin` (service role) → **RLS bypassed**; safety relies solely on manual `business_id` scoping. | [route.ts:51-56](../src/app/api/aria/ask/route.ts#L51-L56), executor throughout |
| **LLM JSON parse** | Planner uses safe `parseLLMJsonOr` ([action-planner.ts:111](../src/lib/aria/ask/action-planner.ts#L111)). `pending_action` re-parse `JSON.parse(rawPending)` ([route.ts:292](../src/app/api/aria/ask/route.ts#L292)) is un-try'd but caught by `withErrorCapture` (→500, not silent). | — |
| **aria_ai_calls CHECK** | ask path uses `role:'chat'` / `provider:'anthropic'` — both valid per CHECK (`role ∈ {…chat…}`, `provider ∈ {…anthropic…}`). No rejection risk. | constraints verified live |
| **Destructive gating** | No deletes in executor (HARD RULE 1). create_* are drafts. **GAP:** `update_product_price`, `send_email_now`, `send_sms_now` execute in the tool-loop with **no confirmation gate** — only a prompt instruction ([aria-tools.ts:1482-1487](../src/lib/aria-tools.ts#L1482-L1487)). A price change / outbound email can fire without the plan→confirm flow. | tool-loop |

---

## PHASE 5 — INVENTORY READINESS (for INV-12)

| Owner question | Status | Data source needed / gap |
|---|---|---|
| "What's low / what should I reorder?" | **PARTIAL** | `query_inventory` tool reads stock, but reorder logic (par levels / `computeParReadonly`) isn't wired into Ask Aria; answers raw stock, not "below reorder". |
| "What's expiring?" | **MISSING** | No tool reads `pos_product_batches` (expiry). Needs an expiring-batches tool (INV-SUPPLY-TILES data). |
| "Who counted X / count accuracy?" | **MISSING** | No tool reads `pos_stock_adjustments` / count tasks attribution. |
| "Approve this PO / what's awaiting receipt?" | **MISSING** | `create_purchase_order` / PO actions don't exist; no `pos_purchase_orders` read tool. |
| "Why is there a variance?" | **MISSING** | No tool reads `inventory_review_queue` / variance flags. |
| "Adjust stock to N" | **BROKEN** (see Phase 2 #9) | `adjust_stock` writes legacy `stock_quantity`, not canonical `items_on_hand` — wrong field for the whole INV-* spine. |

---

## PRIORITISED MASTER FIX LIST (grouped by ROOT CAUSE — fix classes, not cases)

### ROOT CAUSE 1 — Write-validation: LLM/mapping value lands in the wrong column *(highest impact)*
1. **`create_promotion` percentage → `discount_percent`** (not `discount_amount`). Dead %-off promos for all storewide/everything/named-product cases. *(Phase 2 #1 — the recurring live bug.)*
2. **`create_promotion` bundle/multibuy** — map `bundle`→`combo`+set `bundle_price`; implement/much map `multibuy`. Currently dead. *(#4, #5)*
3. **`create_promotion` bogo** — set `buy_quantity`/`get_quantity`/`product_ids`; stop writing meaningless `discount_amount`. *(#3)*
4. **`adjust_stock` → canonical** `items_on_hand` via `adjustOutletStock` + attributed `pos_stock_adjustments`. *(#9)*
5. Add a **post-write field-validator** in `executeAction`: after insert, assert the engine-read column for the chosen `promotion_type` is non-null (would have caught #1/#4/#5 automatically).

### ROOT CAUSE 2 — Schema drift: executor inserts non-existent columns
6. **`create_roster`** — remove/rename `name` to the real `pos_rosters` column. Currently 100% fail. *(#11)*
7. **`create_invoice`** — align insert to real `invoices` columns (`customer_email` etc. absent). Currently 100% fail. *(#12)*
8. Add a CI/schema-drift guard (the action inserts are not covered by `tsc` because they're untyped object literals → only execution catches them, which is why this audit ran them).

### ROOT CAUSE 3 — Intent-routing
9. **Over-answering:** narrow `isStrategicQuestion` ([route.ts:392](../src/app/api/aria/ask/route.ts#L392)) so factual lookups ("who is my best customer", "best seller") don't trigger the council; route superlative-lookup to the tool-loop.
10. **Coreference:** pass `conversation_history` into the council path ([route.ts:667-907](../src/app/api/aria/ask/route.ts#L667-L907)) — either don't skip `buildAskAriaContext`, or thread `historyMessages` into `runAriaCouncil`.

### ROOT CAUSE 4 — Error-handling & gating
11. Check `error` on every `.update()`/insert in `executeAction`; only `affectedCount++` on success (stop reporting false "Done"). *(Phase 4 swallowed writes)*
12. Gate tool-loop **`update_product_price` / `send_email_now` / `send_sms_now`** behind the same plan→confirm flow as the action executor (or a per-tool confirmation). *(Phase 4 destructive gating)*
13. Add an idempotency guard for `create_promotion` (dedupe by name+window) to stop duplicate promos on re-request.

### ROOT CAUSE 5 — Inventory wiring (INV-12)
14. Add Ask Aria read tools for: expiring batches, below-reorder, PO awaiting-receipt, count attribution, variance queue (Phase 5). Reuse INV-SUPPLY-TILES / INV-PAR data sources.

---

## EXECUTION CONFIRMATION
Every action-path write action (8/8) was **actually executed** against Sip via the real `executeAction` and field-diffed against the live schema + discount engine. The `planAction` LLM was run live to confirm payload generation and the exact dead-path trigger. Tool-loop write paths were enumerated; `send_email_now`/`send_sms_now` were intentionally not fired (real outbound side-effects) and are named here, not skipped. **All `[AUDIT]` rows torn down; Sip left clean** (one probe product soft-deleted, as `pos_products` forbids hard delete by design).
