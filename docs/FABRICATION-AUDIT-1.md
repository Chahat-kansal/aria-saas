# FABRICATION-AUDIT-1 — Where Aria can emit an ungrounded number/fact

**Date:** 2026-06-23 · **Type:** READ-ONLY investigation (no code changes) · **HEAD:** post INV-STAFF-APP-2

> **Trigger.** `/dashboard/inventory` "Inventory insight" shows *"capital tied up in your A$234,523 inventory"* when the real value (`SUM(items_on_hand × cost_price)`) is **A$11,476**. The number is generated live (Refresh button, not cached). This audit finds every Aria AI surface with the same class of risk.

---

## 0. TL;DR — the fabrication risk surface

| Bucket | Meaning | Count (approx) | Owner/customer-facing $ at risk |
|---|---|---|---|
| **GROUNDED+GUARDED** | Real values injected **and** post-validated (GROUNDING-TEETH-V2 council path, or a surface-local validator) | ~9 | Low |
| **GROUNDED-ONLY** | Real computed values injected, but **no post-validation** — LLM can still drift a figure | ~55 | **Medium–High** |
| **UNGROUNDED** | LLM invents/estimates numbers with **no real-value injection** | ~10 | **High** |
| **WRONG-FIELD** | Injects a "real" number that is itself computed from the wrong column (the trigger) | ~4 | **Critical (wrong even before the LLM)** |

**Headline:** GROUNDING-TEETH-V2 wraps **exactly one entry point — the Ask-Aria council path** (`/api/aria/ask` → `council.ts` → `validateAndHeal`). **~100 other LLM surfaces call `client.messages.create` directly and bypass it.** The inventory insight is not even "ungrounded" in the LLM sense — it faithfully echoes a number that was **computed from the wrong field** (`pos_products.stock_quantity`, the demoted write-through cache) instead of `pos_outlet_inventory.items_on_hand`. So both the LLM prose **and** the hard metric tiles are wrong.

---

## 1. What GROUNDING-TEETH-V2 actually guards (and what it doesn't)

**The guard** = `validateAndHeal()` + `stripUngroundedNumbers()` in [src/lib/aria/response-validator.ts](src/lib/aria/response-validator.ts). Checks 5 & 6 (the number-stripping ones) are **gated on `pipelinePath === 'council'`** ([response-validator.ts:313](src/lib/aria/response-validator.ts#L313), [:345](src/lib/aria/response-validator.ts#L345)).

**Callers that route through it (the only guarded surfaces):**

| Surface | How it's guarded |
|---|---|
| `/api/aria/ask` (chat / Ask-Aria) | `pipelinePath:'council'` → Check 5 + Check 6 against clean anchors |
| `src/lib/aria/council.ts` | Per-advisor `stripUngroundedNumbers` before synthesis (`advisor_guard` log) |
| `/api/aria/briefing` | **Council path only**; the single-model fallback path is NOT guarded |
| `/api/aria/weekly-report` + `src/lib/reports/weekly-ai.ts` | Generated via `runAriaCouncil` → guarded |
| `/api/customers/[id]/summarise` | **High-value customers only** route through council; low-value go direct (unguarded) |
| `src/lib/community/cold-start-cards.ts` | Surface-local `numericallyGrounded()` — allows only numbers in the signal, else template fallback |
| `src/lib/aria/memory/summarize.ts` + `validate-summary.ts` | Surface-local `filterUngrounded()` (SUMMARIZER-FIX-1) — validates against the **owner's own messages** |

**Everything else** (every `/api/aria/*-insight`, `*-intelligence`, narrative, briefing-fallback, marketing, social, reels, SEO, agents, crons) calls the Anthropic SDK directly with **no post-validation**. Grep proof: `validateAndHeal|stripUngroundedNumbers` appears in only `ask/route.ts`, `council.ts`, `response-validator.ts` (+ the surface-local validators above). **That gap = the fix list.**

---

## 2. Root cause of the inventory insight ($234,523)

**File:** [src/app/api/aria/inventory-insight/route.ts](src/app/api/aria/inventory-insight/route.ts) · **Renders:** [src/app/dashboard/inventory/page.tsx:96](src/app/dashboard/inventory/page.tsx#L96) (LLM prose) + tile at [:79](src/app/dashboard/inventory/page.tsx#L79) (`metrics.total_value`).

It is **NOT a hallucination and NOT ungrounded-in-the-LLM-sense.** The route computes a number and injects it verbatim into the prompt — but computes it from the **wrong column**:

```ts
// route.ts:29-31 — reads the DEMOTED write-through cache, business-wide, NOT per-outlet items_on_hand
const { data: products } = await supabase.from('pos_products')
  .select('id, name, stock_quantity, cost_price, low_stock_threshold')
  .eq('business_id', bid).eq('track_stock', true).limit(2000);

// route.ts:51-54 — value = stock_quantity × cost_price
const stock = Number(p.stock_quantity ?? 0);
const cost  = Number(p.cost_price ?? 0);
totalValue += stock * cost;

// route.ts:71 — the computed (wrong-source) number is injected as ground truth:
content: `Total inventory value: A$${totalValue.toFixed(0)}. Dead stock ... What should the owner do?`
```

**Why $234,523 ≠ $11,476:** `pos_products.stock_quantity` was **demoted to a write-through cache** by the INV sprints; canonical sellable stock is `pos_outlet_inventory.items_on_hand` (CLAUDE.md RULE 6). The cache is stale/inflated and is summed business-wide across all 2,000 SKUs, so the arithmetic is real but the **input field is wrong**. The LLM just echoes it (adds the comma). The authoritative computation already exists — [src/lib/inventory/stock-value.ts](src/lib/inventory/stock-value.ts) `computeStockValue()` uses `items_on_hand` (it's what the new staff-app home route uses) — but inventory-insight doesn't call it.

**Three compounding faults:** (1) wrong field → wrong number; (2) bypasses GROUNDING-TEETH-V2 (direct `client.messages.create`, [route.ts:66](src/app/api/aria/inventory-insight/route.ts#L66)); (3) no post-validation, so even LLM drift on top of the wrong number is uncaught. **The hard `metrics.total_value` tile is wrong too** — this is a data-source bug, not only an LLM bug.

---

## 3. Surface inventory — classified

> Line numbers below are from sub-agent reads and should be re-confirmed at fix time. Classification key: **G+G** GROUNDED+GUARDED · **G-O** GROUNDED-ONLY · **UNG** UNGROUNDED · **⚠WF** WRONG-FIELD · **👁C** customer/public-facing.

### Cluster A — `/api/aria/*` insights & narratives (owner-facing)

| Surface | Class | Notes |
|---|---|---|
| `inventory-insight` | **⚠WF / G-O** | **THE TRIGGER.** `stock_quantity` not `items_on_hand`; injects number, no post-validate |
| `product-insights` | **⚠WF / G-O** | Reads `pos_products.stock_quantity` for days-of-stock |
| `page-insight` (stock pages) | **⚠WF / G-O** | `stock_quantity` for reorder logic |
| `stocktake-intelligence` | G-O (WF-adjacent) | `stock_quantity` for variance match; injects variances/velocity/cost, no validate |
| `sale-insight` | G-O | Injects `total_amount`/`line_total`/LTV; no validate |
| `first-insight` | G-O | Injects product/revenue/basket/customer counts; no validate |
| `customer-insight` | G-O | Injects RFM/LTV/visits; no validate |
| `cash-commentary` | G-O | Injects burn rate/runway/low-point; no validate |
| `daily-narrative` | G-O | DATA PACKET with rev7d/rev30d; prompt says "cite only listed" but no post-strip |
| `daily-briefing` | G-O | 40+ real fields injected; LLM emits rec JSON; no validate |
| `activity-narrative` | G-O | Real events enriched by LLM; no validate |
| `weekly-report` | **G+G** | via council (`weekly-ai.ts` → `runAriaCouncil`) |
| `briefing` | **G+G / G-O** | Council path guarded; **single-model fallback path NOT guarded** |
| `shift-analysis` | G-O | Injects revenue/txns/hourly/top products |
| `cashup-intelligence` | G-O→G+G | Injects 90d variance; output JSON-schema validated (impact int) |
| `supplier-margin-intelligence` | **G-O (weak)** | Real margin injected **but competitor prices come from LLM `web_search`** — unvalidated |
| `supplier-savings` | G-O | Real PO costs injected; **LLM estimates monthly savings** |
| `theft-detection` | G-O | Injects variance ratios; LLM names pattern |
| `delivery-prediction` | G-O | Injects carrier avg; LLM predicts arrival |
| `slow-day` | **UNG** | "Generate 3 promo ideas"; discount/uplift %s are pure LLM fiction |
| `business-health-quick` | n/a | Pure rule-based, no LLM |

### Cluster B — marketing / pricing / staff / agents (many 👁C)

| Surface | Class | Notes |
|---|---|---|
| `generate-quote` | **UNG 👁C** | **Quote line items, subtotal, GST, total all LLM-invented** ("realistic Australian pricing"); emailed/PDF'd to customers |
| `generate-promotion` | **UNG 👁C** | Offer %/SMS text invented, no real data injected; posted to customers |
| `marketing-campaigns` | **UNG 👁C** | LLM SMS copy; only user-input discount %, no business metrics |
| `recipe-cost-optimiser` | **UNG** | `estimated_saving_per_unit` invented, then written to `aria_actions` as fact |
| `auto-review` | **UNG 👁C** | Review-request SMS, template + LLM polish, no grounding |
| `winback` / `winback-send` / `winback-compose` | G-O 👁C | Reach/days-since grounded; copy free-text; SMS/email to customers |
| `quote-followup` | G-O 👁C | Amount real; **`win_score` 0–100 is pure LLM estimate** |
| `competitor-prices` | G-O | `web_search` results + own margin; honest confidence flag, no post-validate |
| `competitive-brief` / `competitor-opportunities` | G-O | Real snapshots/reviews injected; LLM narrative |
| `price-intelligence` | G-O 👁C | DB-grounded alerts; the AI **cart upsell** suggestion is ungrounded |
| `dynamic-pricing` | G-O | Prices computed deterministically; LLM only polishes reason text |
| `menu-optimisation` | G-O | Margin/sales injected; LLM insight |
| `social-suggest` | G-O 👁C | Top products/slow-day computed; caption published to audience |
| `social-learning` / `social-listening` | G-O | Engagement stats real; LLM narrative |
| `staff-schedule` / `roster` / `staff-talk` | G-O 👁C | Forecast/availability grounded; LLM shift JSON; sent to staff |
| `draft-review-reply` | G-O 👁C | Rating/review injected; LLM public reply |
| `influencer/generate` | G-O 👁C | Real 7d revenue/top product; LLM Reel caption, public |
| `flash-revenue-agent`, `pricing-agent`, `query-agent` (libs) | G-O | Deterministic signals; LLM reasoning/selection |
| `talk` | G-O 👁C | Public landing-page brand chat; no business data |

### Cluster C — community / reels / social / SEO / public (heavy 👁C)

| Surface | Class | Notes |
|---|---|---|
| `social/owner-request` | **UNG 👁C** | **Free-form owner text → multi-platform posts, ZERO business data injected**; published to IG/FB/Google |
| `reels/captions` | G-O 👁C | Product name/price + reviews injected; published to social |
| `social/growth-post` | G-O 👁C | Week revenue/top product/review injected; published; narrative free-form |
| `reels/ideas` | G-O | Owner-only ideation; real revenue/stock/reviews |
| `reels/ai-edit` | UNKNOWN | Partial read — re-confirm at fix time |
| `community/owner/ai-draft` | G-O 👁C | In-stock products + 30d sellers injected; published to feed |
| `community/owner/marketer/plan` | G-O | Owner-only calendar; real products/engagement |
| `community/posts/[id]/aria-reply` | G-O 👁C | Public reply; explicit "NEVER invent hours/prices/stock" + hardcoded fallback |
| `community/live/[id]/pulse` | G-O 👁C | Pure SQL counts, no LLM |
| `community/cold-start-cards` | **G+G 👁C** | Surface-local `numericallyGrounded()` + template fallback |
| `community/abuse-guard` | n/a | LLM binary yes/no only, not user-facing |
| `public/widget/chat` | **G+G 👁C** | Real product/stock/rating/member injected; explicit "never invent" guards + hardcoded stock labels |
| `public/menu/[business_id]/descriptions` | G-O 👁C | Real product fields injected; flavour text only (low risk) |
| `bookings/aria-suggest` | G-O | No-show/cancel % pre-computed; LLM narrates |
| `seo/generate-fix`, `seo/competitors`, `lib/seo/ai-fix` | G-O | Real page/business metadata; owner-only; no $ |
| `seo/keyword-suggestions`/`local-scan`/`recommendations`/`competitor-analysis` | UNKNOWN | Partial — re-confirm |
| `customers/[id]/summarise` | **G+G / G-O** | High-value → council (guarded); low-value direct |
| `customers/[id]/ai-summary` | G-O | Real customer+sales injected; no validate |
| `loyalty/aria-insight` | G-O | Points liability/basket pre-computed; LLM narrates |
| `dashboard/inbox/summary` | G-O | Demand-signal counts pre-computed; LLM narrates |

### Cluster D — POS / wholesale / warehouse / crons / brain libs

| Surface | Class | Notes |
|---|---|---|
| `pos/quick-promo-suggest` | **UNG** | Slow movers named not quantified; LLM "Try 20% off" |
| `lib/aria/intelligence/competitor` | **UNG** | Competitor price regex-extracted from `web_search` text, unvalidated |
| `lib/aria/hypothesis/counterfactual` | **UNG** | "What-if" `predicted_impact_cents` — inherently speculative |
| `lib/aria/hypothesis/generate` | G-O | Real 30/90d revenue/margins; LLM quantifies impact → `aria_hypotheses` |
| `pos/cash-flow/analysis` | G-O | Real balances/inflow/outflow; LLM runway commentary |
| `pos/shift-reports` | G-O | Real revenue + labour cost; LLM summary |
| `warehouse/ai-order-suggestions` | G-O | Stock/velocity/lead-time computed; LLM reason text only |
| `aria/supplier-reorder` / `aria/weekly-order` | G-O | Qty deterministic; LLM reason narrative |
| `wholesale/aria-intelligence` | **G+G** | `containsPII()` post-check + retry; order stats real |
| `wholesale/orders/aria-suggest` / `from-email` | G-O | Repeat-item/tier pricing deterministic |
| `cron/parcel-insights` | G-O | Overdue calc deterministic; LLM advice text |
| `cron/daily-briefing-submit` / `generate-briefings` | G-O→G+G | Real sales context; generation via parallel-agents/council orchestrator |
| `lib/aria/business-brain` | G-O | System prompt forbids invention; **no code-level post-validate** |
| `lib/staff/workforce-brain` | G-O | Labour % grounded; rule-based fallback; LLM `impact_dollars` free-text |
| `lib/aria/ask/suggestions` | G-O | Context-grounded question prompts (no $ claims) |
| `pos/customer-greet`, `pos/online-orders/aria-upsell`, `pos/display-suggestions` | G-O→G+G 👁C | Descriptive only / discount capped by SQL `maxPct` |
| `pos/recipes/[id]/allergens` | G+G | Rule-based primary, LLM secondary |
| `pos/cart-intelligence`, `pos/product-intelligence`, `pos/agents/[type]` | G-O | Mostly deterministic; agent decisions require owner approval |

---

## 4. Number-source map — main owner-facing $/% surfaces

| Surface | Dollar/% figure | Originates in | Verdict |
|---|---|---|---|
| Inventory insight | "A$234,523 capital tied up" | **Computed from wrong field** (`stock_quantity`) then echoed by LLM | ❌ wrong source |
| Inventory insight | `metrics.total_value` tile | Same wrong computation (no LLM) | ❌ wrong source |
| Generate-quote | subtotal / GST / total | **LLM free-text** | ❌ fabricated |
| Generate-promotion / marketing-campaigns | offer % / discount | **LLM free-text** (or raw user input) | ❌ unanchored |
| Supplier-savings | "save A$X/month" | **LLM estimate** over real cost gap | ⚠ partial |
| Supplier-margin-intel | competitor price | **LLM web_search**, regex-parsed | ⚠ unvalidated |
| Quote-followup | `win_score` % | **LLM estimate** | ⚠ presented as metric |
| Recipe-cost-optimiser | `estimated_saving_per_unit` | **LLM invented**, saved as fact | ❌ fabricated |
| Counterfactual hypothesis | `predicted_impact_cents` | **LLM speculation** | ⚠ inherent |
| Daily-briefing / daily-narrative / weekly-report | revenue, counts | Real SQL injected (weekly-report also council-validated) | ✅ / ✅guarded |
| Ask-Aria chat | any $/% | Real SQL + **council Check 5/6 strip** | ✅ guarded |
| Cash-commentary / shift-analysis / cashup | runway / variance | Real SQL injected, no post-validate | ✅ source / ⚠ drift |

---

## 5. Prioritised fix list (no code changed this sprint)

**P0 — Wrong-source owner-facing $ (the number is wrong before the LLM even runs):**
1. **`inventory-insight`** — switch to `computeStockValue()` / `pos_outlet_inventory.items_on_hand`; fixes both the LLM prose and the `metrics.total_value` tile. *(the trigger)*
2. **`product-insights`, `page-insight` (stock), `stocktake-intelligence`** — same `stock_quantity → items_on_hand` correction (RULE 6 sweep).

**P1 — UNGROUNDED, customer-facing $ (fabricated numbers leave the building):**
3. **`generate-quote`** — inject real product/service prices; never let the LLM author line totals/GST.
4. **`generate-promotion`, `marketing-campaigns`, `auto-review`** — inject real product/discount data; validate before SMS/social send.
5. **`social/owner-request`** — inject business context or restrict to owner-preview (no direct publish).
6. **`recipe-cost-optimiser`** — stop persisting LLM `estimated_saving_per_unit` as fact, or ground it.

**P2 — UNGROUNDED owner-facing (estimates presented as data):**
7. **`slow-day`, `pos/quick-promo-suggest`** — quantify or label as suggestion.
8. **`supplier-margin-intelligence`, `lib/.../competitor`** — validate `web_search` competitor prices; never echo a regex-scraped figure as fact.
9. **`quote-followup` `win_score`, `counterfactual` impact** — label as estimate, not metric.

**P3 — Systemic (close the guard gap):**
10. Extract the GROUNDING-TEETH-V2 number-strip (`stripUngroundedNumbers` against clean anchors) into a **reusable post-validator for the single-model path**, and apply it to the GROUNDED-ONLY owner-facing $/% surfaces (insight/narrative/briefing-fallback family) — they currently rely 100% on prompt discipline.
11. **`briefing`** single-model fallback path — route through the same validator as its council path.

---

## 6. Confirmation of audit scope
- READ-ONLY. No source files modified. No fixes applied (per sprint brief).
- Personally verified: inventory-insight root cause + render path, guard-coverage grep (`validateAndHeal`/`stripUngroundedNumbers` confined to council path + surface-local validators), `computeStockValue` uses `items_on_hand`.
- Cluster tables compiled via 4 read-only sub-agents; line numbers to be re-confirmed when each fix is implemented. A handful of SEO/reels routes marked UNKNOWN need a direct read at fix time.
