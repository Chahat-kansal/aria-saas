# CLAUDE CODE PROMPT — Aria Agent Council: Best-Practice Algorithm Upgrade (14 agents)

Paste this whole file to Claude Code. It is the authoritative task. Work through it in the phase order given. Do NOT skip the verification steps — they are how we guarantee correctness.

---

## 0. CONTEXT YOU MUST LOAD FIRST (before writing any code)

1. Read `CLAUDE.md` in the repo root and obey it exactly (commit protocol, RULE 0 upgrade-only, build gate).
2. Read every file in `src/lib/agents/`:
   - `base-agent.ts`, `council.ts`, `council-executor.ts`, `types.ts`, and all 14 `*-agent.ts` files.
3. The 14 agents and their EXACT files (verified):
   `reorder-agent.ts, pricing-agent.ts, schedule-agent.ts, menu-engineering-agent.ts, flash-revenue-agent.ts, clv-agent.ts, labour-optimisation-agent.ts, waste-elimination-agent.ts, supplier-negotiation-agent.ts, bas-agent.ts, reputation-defence-agent.ts, reconciliation-agent.ts, customer-acquisition-agent.ts, inventory-financing-agent.ts`
4. Council runs each via `runCouncilSession(business_id)` in `council.ts`, which now uses the explicit `AGENT_REGISTRY` (do not revert to dynamic import). It collects `result.decisions` from each agent's `run()` and converts them to `agent_council_proposals` (the UI source). **An agent produces nothing in the UI unless its `run()` returns decisions via `this.saveDecisions(...)`.**

### Verified DB contracts (DO NOT GUESS — these are live as of 2026-06-04; re-confirm with a schema dump before editing if unsure)
- `agent_decisions` columns: `business_id uuid NOT NULL`, `agent_type text NOT NULL`, `decision_data jsonb NOT NULL`, `reasoning text`, `status text`, `confidence_score numeric`, `projected_impact_cents integer`, `expires_at timestamptz`. `saveDecisions` in `base-agent.ts` already inserts these with `status:'pending'`.
- `aria_ai_calls` columns (NOT NULL ones must always be set): `agent_key text NOT NULL`, `provider text NOT NULL`, `role text NOT NULL`, `success boolean NOT NULL`; plus nullable `business_id, model_id, input_tokens, output_tokens, latency_ms, cost_usd_cents, error_message, request_summary, response_summary, search_units, cache_write_tokens, cache_read_tokens, model_provider`.
- Money is stored in DOLLARS as `numeric` everywhere EXCEPT `staff_pay_rates.hourly_rate_cents` (CENTS). `projected_impact_cents` is in CENTS (integer) — convert dollars→cents (`Math.round(dollars*100)`).
- `pos_sales.status != 'voided'` must be excluded from all sales reads.

### Read-before-write rule (mandatory, per existing DB pre-flight protocol)
Before editing ANY agent, dump the real schema of every table it reads/writes (`information_schema.columns`), confirm column names/types verbatim, and confirm the agent's current `run()` return shape. Never assume a column, state var, or import. If a column named in this prompt differs from live schema, TRUST LIVE SCHEMA and flag the discrepancy in the commit body.

### Hard invariants (violating any = stop and flag)
- **AI never computes money, quantities, tax, or scores.** Every dollar figure, order quantity, GST amount, CLV/confidence score, safety stock, and price is computed by deterministic TypeScript. The LLM only writes human-readable explanations/messages and (optionally) a should-propose/urgency judgment.
- **Upgrade-only (RULE 0):** never remove or weaken existing logic, fields, or capability. Add alongside; if something must change, flag it.
- **Build gate:** `npx tsc --noEmit` then `npm run build` must pass before every commit. Node heap 6GB.
- **One commit per phase task** (batch files), not per file. `pwd` must be `C:\Users\kansa\aria-saas-audit` before git. Never touch the Codex worktree.
- **No new sub-daily crons.** The council already runs on its schedule.
- **Stats in TypeScript only** (mean, std-dev, OLS slope, z-score, IQR are closed-form). BG/NBD needs a small numeric optimiser (~50 lines) or published closed-form estimators — no Python, no new heavy deps without flagging.

---

## PHASE 1 — CORRECTNESS (do this first, it is the active bug surface)

These are bugs, not enhancements. After Phase 1, every agent that has data must emit at least one decision, and every decision must carry a real dollar impact.

### 1.1 ~~Fix the 3 silent agents~~ — VOID / DO NOT DO (premise was false; verified 2026-06-04)
**SKIP THIS TASK ENTIRELY.** The claim that `waste-elimination-agent.ts`, `supplier-negotiation-agent.ts`, and `bas-agent.ts` "never call `this.saveDecisions(...)`" is STALE and WRONG. Live-code verification confirms all three DO emit (waste: saveDecisions at ~L334; supplier: ~L372; bas: ~L55). There are NO silent-no-saveDecisions agents. Do not add emission code here — it already exists. The real, verified issues for these three are in their D-sections: waste → D.9 (par/shelf-life upgrade only), supplier → D.10 (DATA-STARVED: 4 phantom tables + no invoice line-items, not silent), bas → D.12 (verify current super rate + deadline urgency). Follow D.9 / D.10 / D.12, not this section.

### 1.2 Fix silent-on-data agents
`reorder` (had 2 low-stock products yet emitted nothing), `pricing`, `clv`, `menu-engineering` (70 sales, 12 customers) stayed silent on real data. For each, find the guard/threshold/early-return that suppressed output and fix so a data-rich business gets ≥1 proposal:
- reorder: emit even when a low-stock product has no `supplier_id`/`track_stock` — propose "low stock, assign a supplier".
- pricing: add a margin/velocity path that works with empty `competitor_price_cache`.
- clv: lower the customer-count floor; surface the single clearest at-risk VIP.
- menu: ensure it emits when ≥1 clear Star/Puzzle/Dog exists.
Add a brief comment at each fixed guard explaining the change.

### 1.3 `projected_impact_cents` on EVERY decision (the #1 quality gap)
No decision may be saved with `projected_impact_cents = 0` unless impact is genuinely zero. Compute it deterministically per agent (formulas in Phase 2). This is what makes proposals rankable and "category-grade".

### 1.4 Confidence calibration + council filter audit
- Audit `council.ts` for any confidence threshold that filters proposals; record the threshold in the commit body.
- Re-calibrate each agent's `confidence_score` so well-supported proposals score ≥0.6 (a clear, data-backed action should not score 0.35). Confidence must reflect data strength, deterministically.

**Phase 1 commits (suggested):**
1. ~~`fix(agents): waste/supplier/bas now emit agent_decisions (were silent)`~~ — VOID (they already emit; see §1.1 note + D.9/D.10/D.12). No commit needed.
2. `fix(agents): reorder/pricing/clv/menu emit on real data (remove over-strict guards)`
3. `feat(agents): real projected_impact_cents on every decision + confidence calibration`

**Phase 1 acceptance:** with the test business (Sip café, `ff5055a0-c351-4ada-817a-1804961035f3`), a council run yields decisions from reorder, pricing, clv, menu_engineering (data present) and from waste/supplier/bas IF their source tables have data; no emitted decision has `projected_impact_cents = 0` unless truly zero; build passes. (Trigger: tonight's `/api/cron/council-session` cron, or ask the owner to run it; do NOT add a permanent unauthenticated trigger.)

---

## PHASE 2 — PROVEN ALGORITHM UPGRADES (one commit per agent)

For each agent: keep all existing structure (upgrade-only), add the proven method, wire its output into the decision + `projected_impact_cents`. Source methods are industry/academic standard.

### 2.1 reorder — statistical safety stock (replace flat 1.5 factor)
- Compute per product: `D_avg` (avg daily demand, 60–90d), `σ_D` (std-dev of daily demand).
- Safety stock: `SS = Z × √(LT_avg·σ_D² + D_avg²·σ_LT²)`; if no lead-time variability data, degrade to `SS = Z × σ_D × √LT`.
- `Z` from a `service_level` setting in `agent_settings.config` (default 95% → Z=1.65; map 90→1.28, 97.5→1.96, 99→2.33).
- ROP = `D_avg×LT + SS`; order qty = `max(S − on_hand, 0)` case-rounded (keep existing case logic). Add day-of-week seasonality multiplier from 90d.
- `projected_impact_cents` = expected lost-sales avoided = `P(stockout) × D_avg × price × days_to_delivery` → dollars→cents.
- KEEP: supplier/delivery-date logic, trend detection, case rounding.

### 2.2 pricing — log-log price elasticity
- For products with ≥6–8 distinct (price, weekly-qty) points: fit `ln(Q)=β0+β1·ln(P)` via closed-form OLS slope; `ε = β1`.
- Inelastic (ε > −1): propose increase toward `P* = MC × ε/(ε+1)`, capped +10%, `roundToNearest99`. Elastic (ε < −1): flag do-not-raise.
- No price variation in history → fall back to margin-band/velocity rule (Phase 1.2 path).
- `projected_impact_cents` = `(new_price − old_price) × forecast_qty_at_new_price` (qty adjusted by ε).
- KEEP: competitor logic, .99 rounding, margin guards.

### 2.3 clv — BG/NBD + Gamma-Gamma
- Inputs per customer from `pos_sales`/`pos_customers`: frequency (repeat count), recency (last−first), T (now−first).
- Implement BG/NBD (closed-form estimators or small Nelder-Mead). Output per customer: `P(alive)`, `expected_purchases_next_90d`, `expected_next_order_date`.
- Monetary: Gamma-Gamma OR robust fallback (trimmed mean order value). `CLV = exp_purchases × exp_value × margin`.
- Decisions: high-CLV + dropping P(alive) → VIP win-back; overdue vs expected-next-order-date → churn intervention.
- `projected_impact_cents` = CLV-at-risk of targeted customer(s).
- KEEP: RFM as secondary segment label; existing campaign wiring.

### 2.4 menu_engineering — Kasavana & Smith matrix
- CM = `price − ingredient cost` (use `cost_price`; if missing, estimate from category food-cost % and FLAG). Use CM in DOLLARS, not food-cost %.
- Popularity high if item sales ≥ `0.70 × category-average units per item`. Compare WITHIN category.
- Quadrants + actions: Star (protect), Plowhorse (reprice/re-engineer), Puzzle (reposition/promote), Dog (remove/rework).
- `projected_impact_cents`: Puzzle promoted → CM×extra units; Plowhorse repriced → ΔCM×units; Dog removed → waste/capacity saved.
- KEEP: scoring tables.

### 2.5 flash_revenue — demand-curve-relative trigger
- Build expected hourly cumulative-revenue curve per weekday (8–12 weeks). Trigger when today >1.5σ below expected for the current hour (not a raw time gap).
- Expected lift from elasticity (2.2) of target product/segment; fallback conservative cafe SMS reactivation 10–20% with confidence reflecting data.
- `projected_impact_cents` = `expected_lift_pct × expected_remaining_daily_revenue × response_rate`.
- Re-calibrate confidence ≥0.6 on a clear breach + responsive segment.
- KEEP: intervention/channel/segment logic + message generation (already strong).

### 2.6 inventory_financing — 13-week rolling cash-flow
- Ensure a true 13-week rolling direct-method forecast: weekly inflows (sales run-rate, open invoices) − outflows (payroll, rent, supplier terms, BAS/tax) → weekly ending balance; runway = first week ending_balance < 2 weeks opex.
- Propose financing only if net benefit = (value unlocked − financing cost) > 0.
- `projected_impact_cents` = that net benefit / shortfall covered. AI never invents figures.
- KEEP: forecast engine + opportunity generation.

### 2.7 labour_optimisation — labour-cost-% + SPLH targeting
- Forecast revenue by daypart (reuse 2.5 curve). Required staff/daypart = `forecast_revenue × target_labour_pct / blended_hourly_wage`, floored at min coverage. Target_labour_pct config (default 0.30).
- AU award rates: load `staff_pay_rates` (`hourly_rate_cents` is CENTS — handle separately) and apply penalty multipliers (evening/weekend/public holiday) when proposing changes.
- `projected_impact_cents` = wage saved (overstaffed) or sales protected (understaffed).
- KEEP: existing forecast + roster logic.

### 2.8 schedule — coverage/assignment (no overlap with labour)
- Use daypart forecast to flag uncovered peaks / overstaffed troughs; propose concrete shift moves. Respect max-hours + award rules.
- `projected_impact_cents` = sales protected by covering a peak.
- Coordinate with labour via existing council conflict rules; labour=cost, schedule=coverage. KEEP coverage logic.

### 2.9 waste_elimination — par levels + markdown timing (also Phase 1.1 emission)
- Par per perishable = `avg daily usage × shelf-life-days + safety`; flag on-hand > projected demand before expiry.
- Escalating markdown (e.g. 20% at T−1 day, 50% same-day) to clear above-full-price stock.
- `projected_impact_cents` = waste avoided = spoil-risk units × cost.
- Route its raw `anthropic` call through the logged BaseAgent helper (Phase 3). KEEP prep/waste tables.

### 2.10 supplier_negotiation — purchase price variance (also Phase 1.1 emission)
- Per SKU: compare recent unit cost vs trailing baseline; flag price creep beyond threshold/CPI. Leverage = annual spend, alternates, contract renewal window.
- `projected_impact_cents` = `(current_price − target_price) × annual_volume`.
- Route raw `anthropic` through logged helper. KEEP brief/profile tables.

### 2.11 reconciliation — match-rate + anomaly detection
- Compute and surface match-rate %. Flag expense lines beyond IQR/z-score of category history. POS cash-up vs bank variance.
- `projected_impact_cents` = total value of anomalies/unmatched needing review. KEEP matching/anomaly tables.

### 2.12 bas_compliance — ATO correctness (also Phase 1.1 emission)
- Verify GST (10%), PAYG, and super guarantee rate against CURRENT ATO rates — make rates CONFIG, not hardcoded. **FLAG to the owner: confirm the current AU super guarantee rate for this financial year before shipping; do not assume.**
- Decision: "BAS due in X days: set aside $Y" + anomalies. `projected_impact_cents` = liability to set aside or penalty/interest avoided. AI NEVER computes tax.
- Route raw `anthropic` through logged helper. KEEP bas_drafts/super_obligations.

### 2.13 reputation_defence — reply-memory (beat Birdeye)
- Pass the business's recent past replies into the reply-draft prompt so new replies don't repeat phrasing.
- Add competitor review benchmarking using existing competitor tables (own rating/sentiment vs nearby).
- Per-aspect sentiment (service/food/price) not just polarity.
- `projected_impact_cents` = estimated revenue protected (label as estimate, conservative). KEEP sentiment/reply logic.

### 2.14 customer_acquisition — local-pack/AEO gap analysis
- Specific competitor query/topic gaps → content recommendations; GBP completeness checklist.
- `projected_impact_cents` = estimated value of closing the top gap (label estimate). KEEP AEO/competitor tables.
- FOLLOW-UP (flag, don't block): pull BrightLocal ranking-factor checklist to finalise.

**Phase 2 commits:** one per agent, e.g. `feat(agents): reorder statistical safety stock (s,S model)`.

---

## PHASE 3 — AI REASONING LAYER + LOGGING

1. Extend `BaseAgent.claudeReason`/`claudeStructured` to accept `agent_key` + `role`, measure latency, and insert ONE `aria_ai_calls` row per call (set NOT-NULL cols: agent_key, provider='anthropic', role, success; plus model_id, tokens, latency_ms, summaries). Keep existing graceful-null behaviour (AI failure returns ''/null, never throws).
2. Route the raw-`anthropic` agents (waste, supplier, bas) through these helpers so all AI is logged uniformly.
3. ~~Add an AI reasoning step to the 5 agents lacking it~~ — VOID / DO NOT DO (premise was false; verified 2026-06-04). **SKIP.** All 5 named agents (flash_revenue, clv, inventory_financing, menu_engineering, labour_optimisation) ALREADY use `claudeReason`/`claudeStructured` — verified per agent in D.3, D.4, D.5, D.6, D.8. In fact ALL 14 agents have AI. Do NOT add a duplicate AI reasoning step. The only AI work in Phase 3 is steps 1–2: make sure every existing AI call routes through the logged BaseAgent helpers and writes an `aria_ai_calls` row (correct `agent_key`). If any agent's existing AI call is unlogged or bypasses the helper, fix that — but do not add new AI calls to agents that already have them.
- Model: `claude-haiku-4-5-20251001` for reasoning; `claude-sonnet-4-5-20250929` only for flash_revenue copy and inventory_financing judgment.

**Phase 3 commits:**
1. `feat(agents): log all LLM calls via BaseAgent helpers (aria_ai_calls)`
2. `feat(agents): route all existing AI calls through logged BaseAgent helpers (no new AI added — all 14 already have it)`

---

## PHASE 4 — VERIFICATION (must pass before declaring done)
1. `npx tsc --noEmit` and `npm run build` both pass.
2. After a council run on Sip: `agent_decisions` has rows from every agent whose data warrants one; reorder/pricing/clv/menu appear (data present). NOTE: waste/supplier/bas already emit by design — they will stay correctly silent on Sip only if their source data is genuinely absent (e.g. supplier has 0 invoices), which is expected, not a bug.
3. No emitted decision has `projected_impact_cents = 0` unless genuinely zero.
4. `aria_ai_calls` has rows for every agent that ran AI, with correct `agent_key`.
5. Read each diff and confirm NO LLM computes money/qty/tax/scores.
6. No existing feature, field, or table write removed.
7. Confidence scores calibrated (clear proposals ≥0.6); council filter doesn't hide valid proposals.
Report a short per-agent table: emitted? impact$ populated? AI logged? method upgraded?

---

## DO NOT
- Do not revert `council.ts` to the dynamic `./${agentType}-agent` import — keep the explicit `AGENT_REGISTRY`.
- Do not let an LLM compute money, quantities, tax, or scores.
- Do not add an LLM call that only rephrases a rule-based string with no added judgment (that's a wrapper — refused).
- Do not remove the deterministic fallback path.
- Do not hardcode tax/super rates — config + flag for owner confirmation.
- Do not add sub-daily crons or a permanent unauthenticated trigger route.
- Do not commit without `npx tsc --noEmit` + `npm run build` passing.

## ORDER OF WORK
Phase 1 (all of it) → Phase 2 (agent by agent, in the order listed) → Phase 3 → Phase 4. One commit per task. Stop and flag if any live schema or code contradicts this prompt — trust live code/DB over this document.

---

## ADDENDUM A — customer_acquisition agent: target SearchAtlas specifically (Phase 2.14 expansion)

When building the `customer-acquisition-agent.ts` upgrade (§2.14), make it BEAT SearchAtlas on the things it structurally can't do. Do NOT try to match its backlink index / keyword DB / rank-tracking infra (the wrapper trap).

Decision logic the agent must produce (each as an `agent_decisions` row with real `projected_impact_cents`):
1. **Real-code on-page fixes.** For each public page missing SEO essentials, propose a concrete fix that Aria can apply as REAL code (not a JS overlay): missing/!weak `<title>`, meta description, canonical, `LocalBusiness`/`Product` JSON-LD, OG tags, H1, image alt text. (See Addendum B — these must be server-rendered.)
2. **POS-data-driven SEO (the moat SearchAtlas cannot do):** detect high-margin or top-selling products (from `pos_products`/`pos_sale_items`) that have NO landing page or thin content → propose creating one; detect a product ranked/searched that is now out of stock → propose pausing related spend; use busiest-day data to time local posts.
3. **Severity-ranked, plain-English actions.** Every issue tagged critical/high/normal with its `projected_impact_cents` and a one-line owner explanation. (This beats SearchAtlas's documented "unprioritised wall of issues".)
4. **AEO / AI-crawler visibility:** because Aria pages are server-rendered, propose structured-data + answer-style content that GPTBot/ClaudeBot/PerplexityBot CAN read (SearchAtlas's JS-pixel fixes are invisible to these — verified weakness). Flag any page that relies on client-only rendering for key content.
5. **AU-native:** AU local pack, GBP completeness, AU competitor gap (reuse `aria_competitor_watches`).

`projected_impact_cents`: estimate from the issue (e.g. missing title on a page with existing impressions → impressions × baseline CTR uplift × avg order value). Label SEO impact figures as estimates; keep conservative. AI writes the content/explanation; never the numbers.

## ADDENDUM B — VERIFY-FIRST: make Aria's server-rendered SEO actually count (do BEFORE claiming the OTTO-beating advantage)

The "Aria writes real crawler-visible SEO, beating SearchAtlas's JS pixel" claim is only HALF TRUE today (verified 2026-06-04 against live code):
- `src/app/menu/[business_id]/page.tsx` and `src/app/vs/[competitor]/page.tsx` are the only pages with `generateMetadata` + `application/ld+json`. Their pattern is a STRUCTURAL reference only — note the menu page's JSON-LD is minimal (`FoodEstablishment` + `hasMenu`, no name/address/geo) and it fetches metadata via an HTTP round-trip to its own API. Do BETTER than that (richer schema + direct DB read), do not copy it verbatim.
- `src/app/[slug]/page.tsx` (the main business hub) and most public pages have **NO `generateMetadata`, NO JSON-LD, NO openGraph** (only 2 pages in the entire app use `generateMetadata`). The hub is server-rendered (content is crawler-visible) but missing the metadata/schema that make it rank and appear in AI answers.

**Task — own commit, Phase 2.14a, BEFORE wiring the agent's on-page proposals:**
1. Read `src/app/[slug]/page.tsx` fully. It is an async server component that already fetches the business server-side via `supabaseAdmin` with these REAL fields: `id, name, slug, city, suburb, community_bio, logo_url, community_verified, website, google_review_link, google_business_url` (confirm against live code before using; do not assume others exist). Do NOT add `'use client'`.
2. Add `export async function generateMetadata({ params })` that reads the business DIRECTLY via `supabaseAdmin` (NOT via an HTTP fetch to its own API — the hub already has DB access, so a round-trip is wasteful and slower). Return: `title` = `"${name} — ${suburb ?? city ?? ''}".trim()` style, `description` from `community_bio` (truncated) or a sensible default, `alternates.canonical` = `https://www.ariaos.site/${slug}`, and `openGraph` (title, description, type:'website', images:[logo_url] if present). Handle the not-found case gracefully (return a minimal title, never throw).
3. Add a RICH `LocalBusiness` JSON-LD block (richer than the menu page's): `@context https://schema.org`, `@type 'LocalBusiness'` (or a more specific subtype when known, e.g. café → `CafeOrCoffeeShop`), `name`, `url` (the hub URL), `image`/`logo` (logo_url), `address` with `addressLocality` (suburb/city) + `addressCountry: 'AU'`, and `sameAs: [website, google_business_url]` filtered to non-null. Render as `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />` in the returned server markup. Only include fields that have real values — never emit empty/placeholder schema properties.
4. Audit other public routes (`about`, `contact`, `book`, `loyalty`, `community`) and add `generateMetadata` where missing, reusing the same direct-DB pattern. Static-content pages can use static `metadata` export instead of the function.
5. Reconsider `export const dynamic = 'force-dynamic'` on `[slug]`: prefer ISR (`export const revalidate = <e.g. 3600>`) for SEO + speed UNLESS the page genuinely needs per-request freshness. If unsure, leave it and flag in the commit body. Upgrade-only: never break existing rendering.
6. **VERIFY (mandatory):** after deploy, `curl -s https://www.ariaos.site/<a-real-business-slug>` and confirm the INITIAL server HTML contains the `<title>`, `<meta name="description">`, canonical, and the `application/ld+json` block — i.e. present WITHOUT executing JS (that is the whole point vs SearchAtlas's pixel). Paste the relevant HTML lines into the commit body as proof. Also paste the page through Google's Rich Results Test mentally/structurally (valid LocalBusiness).

Only after step 6 passes is the "crawler-visible, beats the JS pixel" advantage fully TRUE and marketable. Until then, do not state it as a live strength.

## ADDENDUM C — SEO feature UI (scope: SEO/acquisition screens ONLY, not the whole Aria UI)

Build these screens in Aria's existing Financial-Trust design system (palette #7FB897/#2D5240, Fraunces italic + Inter, existing motion/primitives). Borrow SearchAtlas's *patterns* (their UI is the reference for "looks deep"), NOT their dark-purple styling. Patterns to implement, drawn from their actual screens:

1. **SEO command-center overview** (their OTTO dashboard): top status strip with small progress rings (pages audited, issues fixed, crawl coverage); an **"Aria SEO Grader" gauge** (0–100 overall score); a **"SEO Pillars"** row of vertical bar meters (Content / Authority / Technical / Local) each with score + up/down delta; a **"Fixes this week"** task list where each row has a progress ring (e.g. "Meta descriptions 15/43") and chevrons. Feed from existing `seo_audits/pages/issues/keywords/keyword_history/local` tables.
2. **Recommendations two-pane** (their Title Tags screen — the strongest pattern): LEFT = issue-category list with per-category counts + completion rings (Title Tags, Meta Description, Headings, Alt Text, Schema, Canonical…); RIGHT = table of affected pages showing **"Current" vs "Aria suggests" side-by-side**, a **before→after score bar (e.g. 60→100)**, and per-row **Apply / Applied / Roll back** + **Bulk apply**. Aria's edge: "Apply" writes REAL code (Addendum B), and rows are severity-ranked with $ impact.
3. **Site Explorer** (their domain search): one input (your domain or a competitor's) → metric tiles with circular scores (visibility, pages indexed, local rank, review score), organic overview, country/suburb distribution table, historical trend chart.
4. **Local SEO geo-grid heatmap:** a map grid showing local-pack rank by point around the business (high value for AU local). Use existing `seo_local` data + a map lib already in the stack if present (do not add heavy deps without flagging).
5. **Site visualisation (optional, "wow" factor):** node/tree diagram of the site, nodes sized by page health, red = non-indexable/missing-metadata. Nice-to-have; lower priority than 1–3.

UI build rules: reuse existing Aria components/tokens; do NOT touch protected files (AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts); additive only; every "deep-looking" number must be backed by a REAL value from the DB/SEO engine — no decorative fake metrics (a fake gauge is worse than none). If a metric isn't computed yet, either compute it deterministically or omit the tile. Apply the same principles (command-center overview, severity+$ action lists, before/after, one-click "Aria does it") to other Aria feature screens you build, but ONLY the relevant feature — not a global redesign.

Commits: `feat(seo-ui): SEO command-center + recommendations two-pane (Aria design system)`, then the explorer/heatmap as separate commits. Build gate applies. Verify every displayed metric maps to a real query before shipping.

---

## ADDENDUM D — PER-AGENT VERIFIED FINDINGS (read against live code + live DB; these CORRECT the earlier sections where they conflict)

> Process for each agent below: findings were taken by reading the actual `*-agent.ts` and dumping `information_schema.columns` for its tables on 2026-06-04. Where this contradicts §2 or the benchmark, TRUST THIS. Re-verify before editing.

### D.1 reorder — VERIFIED (corrects §2.1 and benchmark)
**What's already TRUE in code (do NOT "add" these — they exist):**
- Statistical safety stock is ALREADY implemented: code builds a 30-day daily-units series (incl. zero-sales days) per product and computes `SS = Z × σ_D × √LT` (confirmed: `Math.sqrt`, `variance`, comment present). The benchmark's "flat 1.5 factor" claim is OUTDATED — do not regress it.
- 30d + 90d velocity, trend multiplier (up 1.2 / down 0.85), delivery-day-aware next-delivery-date, supplier price-change detection from `supplier_product_prices`, case rounding — all present.

**REAL bugs/gaps to FIX (verified):**
1. **Phantom column:** the supplier select reads `lead_time_days` from `pos_suppliers`, but that column DOES NOT EXIST (live schema: pos_suppliers has id,business_id,name,contact_name,email,phone,address,notes,created_at,delivery_days[],order_cutoff_days[],region,short_code,order_email,custom_columns). So `supplier?.lead_time_days` is always undefined → it silently falls back to `KNOWN_LEAD_TIMES[name]`/default. Either (a) add a `lead_time_days integer` column to `pos_suppliers` via migration and populate it, or (b) remove `lead_time_days` from the select and rely on the known-map/default explicitly. Pick (a) — it's the proper fix — but confirm nothing else writes that column first.
2. **Unused `reorder_point`:** `pos_products.reorder_point` (integer) EXISTS in schema but the agent never reads or writes it (count=0). The manual POS reorder UI likely uses it → two sources of truth. FIX: have the agent WRITE its computed ROP back to `pos_products.reorder_point` (so the POS UI and the agent agree), and/or respect a manually-set `reorder_point` as an override. Confirm who else reads/writes this column before changing.
3. **σ_LT (lead-time variability):** not modelled — correct to DEFER (no lead-time history captured). Note for later: once `pos_purchase_orders` has delivered timestamps, compute σ_LT and upgrade to `SS = Z × √(LT·σ_D² + D²·σ_LT²)`.
4. **`projected_impact_cents`:** appears once — VERIFY it's actually non-zero (lost-sales-avoided = P(stockout) × avg_daily × price × days_to_delivery, ×100 → cents). If it's 0 or a placeholder, fix per §1.3.
5. **service_level / Z:** confirm Z is configurable (`agent_settings.config.service_level`, default 95→1.65), not hardcoded.

**Verify after:** run on Sip; confirm reorder emits for the 2 low-stock products (incl. ones without supplier_id, per §1.2), each with a non-zero impact, and that `pos_products.reorder_point` is written. Paste a sample decision row in the commit body.

**NOTE on the benchmark/spec:** because reorder was already largely upgraded, treat §2.1 as "verify + fix the 3 real bugs above," NOT "rewrite the safety-stock math." The remaining 13 agents will each get the same verified pass appended here before they are built — do not assume the §2 description is current until its D-section confirms it.

### D.2 pricing — VERIFIED (corrects §2.2 and benchmark)
**What's already TRUE in code (do NOT "add" — they exist):**
- BOTH paths exist and BOTH call `saveDecisions` + log AI via `claudeReason` (with agent_key/role/business_id): (1) competitor-based path using `competitor_price_cache`, quantiles (p25/median/p75), price-position percentile, 14d-vs-prev-14d velocity trend; (2) a margin+velocity FALLBACK path when competitor cache is empty (so §1.2 "silent when competitor empty" is ALREADY handled — verify it actually emits, don't rebuild it).
- `projected_impact_cents` IS computed in both paths (`(suggested−price) × units × 4 × 100`). Confidence is differentiated (0.78/0.65/0.55), not a flat 0.35.
- 7-day cooldown via recently-approved decisions; `roundToNearest99`; AI reasoning in AU English.

**REAL bugs/gaps to FIX (verified):**
1. **Phantom columns (dead branch):** the competitor-path SELECT reads `own_price_cents` and `own_margin_pct` from `competitor_price_cache`, but NEITHER COLUMN EXISTS (live cols: id,business_id,product_name,competitor_name,competitor_address,competitor_distance_m,competitor_price_cents,source,confidence,found_url,searched_at,expires_at). Result: `own_margin_pct` is always undefined → the `positionPct <= 0.25 && own_margin_pct > 30` lift branch CAN NEVER FIRE. FIX: compute own margin from the matched `pos_products` row (price & cost_price are already fetched) instead of the non-existent column; drop `own_price_cents`/`own_margin_pct` from the select. Re-verify the lift branch then works.
2. **No price elasticity (the §2.2 upgrade is genuinely NOT done):** current logic is heuristic thresholds (velRatio/position), not elasticity. The proven log-log elasticity method from §2.2 is the real value-add here. ADD it as a THIRD signal: where a product has ≥6–8 distinct (price, weekly-qty) historical points, fit `ln(Q)=β0+β1·ln(P)` (closed-form OLS slope, ~15 lines), use ε to (a) gate raises (don't raise elastic items), (b) target `P*=MC·ε/(ε+1)`. Where insufficient price variation, keep the existing heuristic (do not regress it).
3. **Impact uses ×4 (weeks→~monthly) heuristic:** fine, but when elasticity is known, adjust forecast qty by ε at the new price for a truer impact figure.
4. **`MIN_COMPETITOR_POINTS = 3`** before competitor path fires — reasonable; confirm the fallback path covers the <3 case (it does, via the empty-cache branch — but NOTE: the empty-cache branch only triggers when `compRows` is fully empty, NOT when a specific product has <3 comp points; such products silently get no decision. FIX: route under-3-point products into the margin/velocity logic too.)

**Verify after:** run on Sip (likely empty competitor cache → fallback path). Confirm pricing emits margin/velocity decisions with non-zero impact; then seed a few `competitor_price_cache` rows and confirm the competitor path + the now-fixed lift branch fire. Paste a sample decision in the commit body.

**Spec correction:** §2.2 said "hard-depends on competitor data → silent when empty" — that's OUTDATED; the fallback exists. The genuine remaining work is (a) the phantom-column fix and (b) adding real elasticity. Treat §2.2 accordingly.

### D.3 clv — VERIFIED (corrects §2.3 and benchmark)
**What's already TRUE in code (766 lines — do NOT rebuild these):**
- Rich per-customer feature model: avg_basket_size, visit_frequency_per_month, months_as_customer, product_diversity, price_sensitivity, seasonal_consistency (with variance/stdDev via Math.pow), visit_trend, spend_trend, days_since_last_visit.
- Predictions: predicted_monthly/annual_revenue, **predicted_3yr_clv = annual×3×(1−churn)**, and a churn_probability = `min(daysSinceLastVisit/365 × (1−seasonalConsistency), 0.90)`.
- 6 tiers (champion/loyal/potential/at_risk/dormant/lost), intervention priority, recommended offer type/value/message with rationale, AND a portfolio-summary decision with AI summary via claudeReason. Emits via `saveDecisions` (2 call sites: per-customer at-risk + portfolio). Writes `customer_clv_scores` + `clv_portfolio_summary`.

**REAL bugs/gaps to FIX (verified against live schema):**
1. **Phantom columns:** the `customer_clv_scores` upsert writes `churn_risk_score` and `churn_risk_updated_at` (≈lines 601-602), but NEITHER EXISTS in the table. Live cols include `predicted_*`, `clv_tier`, `intervention_*`, etc. but NOT those two → the churn score never persists here. FIX: either add `churn_risk_score numeric` + `churn_risk_updated_at timestamptz` columns via migration, OR write churn into an existing column. Confirm what reads churn before choosing. (Note: a separate `customer_scoring` cron may own churn elsewhere — check for a second source of truth.)
2. **`projected_impact_cents: 0` on the per-customer SCORE rows (line ~331):** the bulk score decisions are saved with impact 0 and `confidence_score: 0.99`. The ACTIONABLE decisions (line ~713 `impact = predicted_annual_revenue × 100 × 0.3`; line ~756 portfolio `atRiskRevenue × 100 × 0.15`) DO have impact — good. But the 0.99-confidence/0-impact score rows may be flooding `agent_decisions` with non-actionable rows. FIX: don't emit score-only rows as council decisions (persist them to `customer_clv_scores` only); reserve `agent_decisions` for the at-risk/win-back ACTIONS. Verify the council isn't showing 0-impact "decisions".
3. **Churn model is heuristic, not BG/NBD (the §2.3 upgrade is genuinely NOT done):** churn = linear `daysSinceLast/365`. This is reasonable but not the proven probabilistic method. ADD BG/NBD: from each customer's frequency (repeat count), recency (last−first), T (age), compute P(alive) and expected_purchases_next_90d; replace/augment the linear churn with P(alive); compute **expected_next_order_date** (Klaviyo's signature metric — currently ABSENT, count=0) from the individual transaction rate. Keep the existing tiering + 3yr-CLV as the monetary layer (that's effectively the Gamma-Gamma role via avg_basket). Implement BG/NBD as ~50-line closed-form/optimiser in TS; gate behind a min-repeat-buyers floor and KEEP the heuristic as fallback for thin data (so it still emits for Sip's 12 customers — surface the single clearest at-risk VIP).
4. **Confidence 0.99 on score rows** is mis-calibrated (a heuristic churn estimate isn't 99% certain) — recalibrate to reflect data strength (more orders/longer history → higher confidence).

**Verify after:** run on Sip (12 customers); confirm clv emits ≥1 at-risk/VIP ACTION decision with non-zero impact, the churn score persists (post-migration), expected_next_order_date is populated, and no 0-impact filler rows pollute the council. Paste a sample at-risk decision in the commit body.

**Spec correction:** §2.3/benchmark called clv "RFM heuristics" — it's actually a richer feature-model than RFM (no literal RFM scoring; it's basket/frequency/recency-derived tiers). The genuine work is: fix the phantom churn columns, stop emitting 0-impact score rows as decisions, add BG/NBD P(alive) + expected-next-order-date, recalibrate confidence.

### D.4 flash_revenue — VERIFIED (corrects §2.5, benchmark, AND the earlier "5 agents lack AI" list)
**What's already TRUE in code (940 lines — do NOT rebuild):**
- It ALREADY uses AI: one `claudeStructured` call builds the intervention (channel, segment, discount, message copy, expected_lift_pct, reasoning). So the earlier "flash_revenue has no AI" claim is WRONG — remove it from the no-AI list (the genuinely-no-AI set is now: clv*, inventory_financing, menu_engineering, labour_optimisation — and clv also has AI in its portfolio summary, so re-verify each before adding AI).
- Multi-signal trigger engine reading 9+ tables (pos_sales, pos_customers, pos_products, pos_promotions, pos_timesheets, competitor_snapshots, review_requests, community_posts, businesses); writes `flash_interventions`, `aria_autopilot_actions`, can create `pos_promotions`/`community_posts`. Calls `saveDecisions`. Supports auto vs pending mode.
- **Schema-clean:** the `flash_interventions` insert matches live columns exactly — NO phantom columns here (first agent of the 4 with none).

**REAL bug to FIX (verified — this is the root cause of the live $0 impact + 0.35 confidence we saw):**
1. **Impact formula is backwards for a dead period.** Line ~293: `projected_impact_cents = revenueIn2hBefore × expected_lift_pct/100 × 100`. But the trigger was a CRITICAL DEAD PERIOD (46h no sales) → `revenueIn2hBefore = 0` → impact = 0. Basing recovered-revenue on "revenue in the last 2h" is exactly wrong when the whole point is that recent revenue collapsed. FIX: base impact on EXPECTED RECOVERED REVENUE = (normal-period baseline revenue for this weekday/hour) × expected_lift_pct × response_rate. Compute the baseline from historical same-weekday-same-hour sales (deterministic). For non-dead-period triggers, a recent-revenue base is fine — so make the base trigger-aware.
2. **Confidence = expected_lift_pct/100** (line ~292) → a 35% lift estimate becomes 0.35 confidence. That conflates "size of effect" with "certainty of effect" — wrong. FIX: confidence should reflect DATA STRENGTH (how clearly the dead period deviates from the historical baseline, how responsive the target segment has been historically), not the lift magnitude. A clear, well-supported critical dead-period intervention should score ≥0.6.
3. **(Upgrade, §2.5) Dead-period trigger is a raw threshold, not demand-curve-relative.** No hourly expected-curve / percentile / σ (confirmed: no percentile/curve/sqrt in file). ADD: build an expected cumulative-revenue curve per weekday from 8–12 weeks; trigger when today is >1.5σ below expected for the current hour. This prevents false alarms on a normally-quiet Tuesday and gives the baseline needed for fix #1 above. Keep the existing trigger as a fallback.
4. **expected_lift_pct comes from the LLM** (`?? 15`). Per the no-AI-computes-numbers rule, the LLM should NOT invent the lift figure. FIX: derive expected_lift from the product/segment's historical discount response (or a conservative literature default 10–20%), and let the LLM write only the message/explanation. The LLM may suggest, but the number used for impact must be deterministic.

**Verify after:** force/await a dead-period run on Sip; confirm `projected_impact_cents` is now > 0 (from the baseline-revenue calc, not the dead 2h window) and confidence reflects data strength (≥0.6 on a clear breach). Paste the decision row in the commit body.

**Spec correction:** flash_revenue is AI-enabled and schema-clean; its only real defect is the backwards impact/confidence math (now explained). §2.5's demand-curve upgrade is still valid and ALSO supplies the baseline the impact fix needs.

### D.5 inventory_financing — VERIFIED (corrects §2.6, benchmark, and the no-AI list)
**What's already TRUE in code (699 lines — do NOT rebuild):**
- AI-enabled: uses `claudeStructured` (agent_key 'inventory_financing', role 'forecast') to produce `owner_message` + `reasoning`. So REMOVE it from the "5 agents lack AI" list too. (Updated no-AI set after D.4+D.5: only `menu_engineering`, `labour_optimisation`, and clv's per-customer path genuinely lack AI — re-verify each in its D-section before adding AI.)
- Multi-week cash-flow forecast off `pos_sales`, `pos_timesheets`, `business_expenses`; computes worst week, critical-weeks count, generates opportunities; emits one decision via `saveDecisions`. Confidence 0.72.

**CRITICAL bugs to FIX (verified against live schema — these are the biggest yet):**
1. **PHANTOM TABLES (not just columns):** the agent INSERTS into `cash_flow_forecasts` and `financing_opportunities`, and READS from `basiq_connections` and `supplier_negotiation_profiles` — **NONE of these 4 tables exist** in the live DB (confirmed via information_schema.tables; only `staff_members` and `wholesale_orders` of its non-core tables exist). Consequences: both inserts silently fail (error likely swallowed), and the bank-feed (`basiq_connections`) + supplier-profile reads return nothing → the forecast falls back to POS estimate only, and NO forecast/opportunity is ever persisted. FIX (decide with owner): either (a) CREATE the missing tables via migration (`cash_flow_forecasts`, `financing_opportunities` at minimum — these are the agent's own output store) with the columns the code writes, OR (b) if these were renamed/removed, point the code at the real tables. Do NOT leave inserts targeting non-existent tables. `basiq_connections` (bank feed) is a real integration gap — if Basiq isn't wired, gate that read behind a feature check and rely on POS estimate (which already works), and FLAG to owner that real bank-feed financing needs Basiq connected.
2. **$0 impact root cause (same class as flash_revenue):** line ~137 `projected_impact_cents = abs(min(0, worstWeek.closing_cash_position)) × 100`. This is >0 ONLY if cash goes NEGATIVE. Live: Sip's worst week was +$160 (low but positive) → impact = `abs(min(0,160)) = 0`. A cash CRUNCH (positive but below safe runway) wrongly scores $0. FIX: impact = shortfall against a SAFETY THRESHOLD (e.g. 2 weeks opex), i.e. `max(0, safety_threshold − worst_closing_cash) × 100`, OR the financing cost-benefit (value unlocked − financing cost). Per §2.6, only propose financing when net benefit > 0; impact = that net benefit. Deterministic; AI never invents the figure.
3. **No explicit runway metric / 13-week guarantee:** `runway`=0, `ending_balance`=0, `opex`=0 in code (uses `closing_cash_position`). Confirm the forecast spans a true 13 weeks and ADD `runway_weeks` = first week closing_cash < (2× weekly opex). Surface it in the decision.
4. **`net_benefit`/`cost_of` financing = 0 occurrences:** the financing opportunities don't appear to compute a cost-benefit. ADD per §2.6: only surface a financing opportunity when (value unlocked − financing cost) > 0, and explain the debt trade-off via the existing AI layer.

**Verify after:** (post-migration) run on Sip; confirm the forecast + opportunities PERSIST (rows appear in the created tables), `projected_impact_cents` > 0 for a low-but-positive cash crunch, and a `runway_weeks` value is present. Paste the decision row + confirm the insert no longer errors (check logs).

**Spec correction:** §2.6 assumed the forecast engine + opportunity store worked and just needed impact wiring. Reality: its OUTPUT TABLES DON'T EXIST so nothing persists, AND the impact formula only fires on negative cash. Both must be fixed before the agent is trustworthy. This is the clearest example so far of why per-agent live-schema verification matters.

### D.6 labour_optimisation — VERIFIED (corrects §2.7, benchmark, and the no-AI list)
**What's already TRUE in code (579 lines — strongest agent yet on impact quality; do NOT rebuild):**
- AI-enabled: uses `claudeStructured` for the labour-% alert reasoning. **The "5 agents lack AI" list is now essentially empty — only `menu_engineering` remains to verify (D.8). flash, financing, AND labour all have AI. Stop treating §3's "add AI to 5" as fact — re-verify per agent; most already have it.**
- Labour-cost-% targeting ALREADY built: configurable `target_labour_pct`/`labour_pct_threshold` (default 38%), `target_revenue_per_staff_hour` (default 120 — effectively an SPLH target), `minimum_staff`, suggest-vs-auto mode.
- TWO decision types, both with REAL impact + good confidence: (1) overstaffed `early_finish_offer` → `projected_impact_cents = saving×100`, confidence 0.8; (2) `labour_pct_alert` → `impact = (labourPct − threshold)/100 × revenueToday × 100`, confidence 0.95. Both formulas measure the right quantity (unlike flash/financing). Emits via `saveDecisions` (2 sites).

**REAL bugs/gaps to FIX (verified):**
1. **Phantom table:** inserts into `labour_demand_forecast` — that table DOES NOT EXIST (live: labour_optimisation_actions, staff_members, pos_timesheets, staff_pay_rates, intelligence_events exist; labour_demand_forecast does not). The forecast persistence silently fails (core decisions still save). FIX: CREATE `labour_demand_forecast` via migration with the columns the code writes, OR stop writing to it. Confirm intended.
2. **No AU award rates / real wages (the genuine §2.7 gap):** `award`/`penalty`/`casual`/`staff_pay_rates`/`hourly_rate_cents` all = 0 occurrences. It uses a generic wage assumption, not each staffer's real rate. FIX: load `staff_pay_rates` (REMINDER: `hourly_rate_cents` is in CENTS — convert; this is the one table that's cents, per global rules) for true wage cost, and apply AU award penalty multipliers (evening/weekend/public-holiday, casual loading) when computing savings/cost. This is the AU moat and makes the $ figures real, not assumed.
3. **No explicit per-daypart staffing requirement:** has a labour-% threshold but not the §2.7 "required staff per daypart = forecast_daypart_revenue × target_pct / blended_wage" breakdown. ADD daypart granularity (reuse the flash_revenue hourly curve from D.4 once built) so it proposes specific shift windows, not just a whole-day %.
4. **(minor) confidence 0.95 on labour_pct_alert** is high but defensible (it's a measured overage, not a prediction) — acceptable; leave unless over-firing.

**Verify after:** (post-migration) run on Sip — note Sip has 0 rosters/timesheets so labour may legitimately stay quiet; seed a roster + a `staff_pay_rates` row to confirm it emits an overstaffed/labour-% decision with a real wage-based $ impact (using cents conversion) and that `labour_demand_forecast` now persists.

**Spec correction:** labour was the BEST-built agent on impact quality (correct formulas, real confidence, AI present, labour-% targeting done). §2.7's "add labour-cost-% targeting" is largely DONE; the real work is the phantom table + AU award rates (staff_pay_rates, cents) + daypart granularity. §3 should NOT list labour as needing AI.

### D.7 schedule — VERIFIED (corrects §2.8 and benchmark)
**What's already TRUE in code (171 lines — do NOT rebuild):**
- AI-enabled (`claudeReason`, agent_key 'schedule', role 'rostering'). Builds a 4-week hourly revenue grid [outlet][dow][hour], generates a full 7-day roster assigning cheapest-available staff up to `targetStaff = ceil(avgRevenue / REVENUE_PER_CASHIER_PER_HOUR(200))`, with AU public-holiday exclusion from the baseline, RSA-expiry + availability + max-hours guards in code. Upserts `pos_rosters` (schema-clean — columns match) and emits via `saveDecisions`.

**REAL bugs/gaps to FIX (verified against live schema):**
1. **Most staffing logic runs on NON-EXISTENT fields → silently defaults.** The agent reads `pos_staff` but its `StaffRow` expects `hourly_rate_cents, rsa_expiry, max_hours_week, availability` — `pos_staff` has NONE of these (live cols: id,business_id,name,email,pin,role,is_active,color,permissions,created_at). The SELECT only fetches `id,name,role`, so: RSA check always passes, availability always "available", max-hours uses default 38, and **wage is hardcoded `hourly_rate_cents: 2500` for everyone**. So the roster's cost/compliance/availability are FAKE despite the code implying real checks. FIX: source real staff data from the right table. NOTE: `staff_members` (61 cols) AND `pos_staff` (10 cols) BOTH exist — schedule uses `pos_staff` while labour uses `staff_members`/`pos_timesheets` → TWO sources of truth for staff. Decide the canonical staff table (likely `staff_members`), point both agents at it, and pull real `hourly_rate_cents`/availability/RSA from there (or `staff_pay_rates` for wages — cents). This is a cross-agent consistency fix.
2. **`projected_impact_cents = totalCostCents` is WRONG (it's a cost, not impact).** Labelling the roster's total wage cost as positive "impact" misranks it in the council (a bigger roster looks like bigger "impact"). FIX: impact should be the SAVING vs the current/naive roster, or sales protected by covering peaks — not gross cost. Coordinate with labour (D.6): labour owns cost-saving, schedule owns COVERAGE correctness. Schedule's impact = sales protected by covering an otherwise-uncovered peak hour.
3. **No explicit uncovered-peak / overstaffed-trough decision (the §2.8 point):** it generates a whole roster but doesn't surface "peak hour X is under-covered" or "trough hour Y is over-covered" as the actionable insight. ADD that as the decision content (the §2.8 coverage focus), distinct from labour's cost focus.
4. **`REVENUE_PER_CASHIER_PER_HOUR = 200` hardcoded** — make it config (and reconcile with labour's `target_revenue_per_staff_hour = 120` — they DISAGREE, another cross-agent inconsistency to resolve).
5. **Overlap with labour:** both touch rostering. Boundary per §2.8: labour = cost optimisation (over/understaff $), schedule = coverage/assignment correctness. Ensure council conflict rules dedupe (they exist). Don't have both emit the same roster-cost decision.

**Verify after:** Sip has 0 rosters/staff data → schedule legitimately stays quiet (0 outlets/staff → early return). Seed an outlet + staff (in the canonical table with real rates) to confirm it emits a coverage decision with real wages and a SAVINGS-based (not gross-cost) impact.

**Spec correction:** schedule is more built than §2.8 implied (full roster generation, AU holidays, AI) BUT its staffing inputs are fake (phantom fields default to flat wage/always-available) and its impact is mislabelled cost. Priorities: (1) canonical staff table + real wages across schedule AND labour, (2) fix impact to savings/coverage, (3) surface coverage gaps, (4) reconcile the two revenue-per-staff-hour constants.

### D.8 menu_engineering — VERIFIED (corrects §2.4, benchmark, and KILLS the no-AI list)
**What's already TRUE in code (523 lines — most sophisticated agent; do NOT rebuild):**
- **AI-enabled** (`claudeStructured`). This was the LAST agent on the "no-AI" list — it has AI. **CONCLUSION: the "5 agents lack AI" / "add AI to 5" premise is FULLY FALSE. Every agent verified D.1–D.8 has AI. §3 should be reduced to "ensure all AI calls log to aria_ai_calls via BaseAgent helpers" — NOT "add AI to agents that lack it." Re-verify the remaining 6 (D.9–D.14) but assume AI is likely present.**
- Implements BCG/menu quadrants (star/puzzle/dog/plowhorse) via velocity-vs-baseline + margin thresholds (configurable: star_velocity 1.2, star_margin 0.6, dog_velocity 0.8, dog_margin 0.4). Does REAL actions: grid repositioning by peak/quiet mode, cross-category upsell wiring (`agent_upsell_product_id`), profitable bundles (`agent_bundle_*`), dog-hiding + clearance promos, halo/co-purchase analysis, a feedback weight-adjust loop. Emits via `saveDecisions`; impact = sum of star margin×units. **Schema-clean** except one phantom column (below).

**REAL bugs/gaps to FIX (verified):**
1. **TYPO BUG: `plowhouse` should be `plowhorse`** (correct spelling appears 0 times; `plowhouse` is used in the type union, classification, and summary). Any UI/filter/report expecting `plowhorse` silently misses these. FIX: rename `plowhouse`→`plowhorse` everywhere (type, tier assignment, summary keys, and the `product_performance_scores.performance_tier` values written — check for existing rows to migrate).
2. **Phantom column:** the product SELECT reads `prep_time_minutes` from `pos_products` — that column DOESN'T EXIST (all other selected agent_* / grid / margin columns DO exist — this agent is otherwise schema-clean). The peak-mode prep-speed sort therefore runs on undefined → no real prep prioritisation. FIX: add `prep_time_minutes integer` to `pos_products` (and populate), or remove it from the sort.
3. **NOT the proven Kasavana & Smith popularity rule (the genuine §2.4 upgrade):** popularity is velocity-vs-rolling-baseline, not the published **"≥70% of the category-average units per item"** menu-mix rule; `contribution`/`popularity`/`0.7` all = 0. And core tiering is NOT within-category (category only used for cross-sell). FIX per §2.4: classify popularity by the 70%-of-category-average rule, compare WITHIN category, use contribution margin in DOLLARS (it has `margin_dollars_per_unit` — good) on one axis. Keep the existing thresholds as a configurable alternative; don't regress the rich actions.
4. **Silent on Sip's 70 sales:** likely (a) thresholds didn't yield a clear star/dog at low volume, and/or (b) grid actions require `grid_position` set (Sip products may have null grid_position → no reposition actions → fewer decisions). FIX: ensure a classification + at least one action emits whenever ≥1 clear star/puzzle/dog exists, independent of grid_position being set; the 70%-rule (#3) will also make classification fire at low volume.
5. **Impact only counts stars:** `projected_impact_cents` = sum of star margin×units — ignores the value of dog-removal (waste/capacity saved) and puzzle-promotion. Broaden per §2.4.

**Verify after:** run on Sip (70 sales); confirm menu emits ≥1 classification/action decision with the corrected `plowhorse` spelling and non-zero impact; confirm `product_performance_scores` rows write with correct tier values.

**Spec correction:** menu is far more built than §2.4 implied (full BCG + grid + upsell + bundle automation + AI). Real work: the `plowhorse` typo, the `prep_time_minutes` phantom column, adopting the proper 70%-category popularity rule + within-category comparison, fixing silent-on-data, broadening impact. NOT "add AI" — it has AI.

### INTERIM CROSS-AGENT NOTE (after D.1–D.8)
Two systemic patterns confirmed across 8 agents — fix globally, not just per-agent:
- **Schema drift:** phantom columns/tables in reorder (lead_time_days), pricing (own_margin_pct), clv (churn cols), inventory_financing (4 phantom TABLES), labour (labour_demand_forecast), schedule (staff fields on wrong table), menu (prep_time_minutes). ACTION: before any agent edit, dump live schema and reconcile EVERY select/insert column against it; create or remove as decided; never leave a select/insert targeting a non-existent column/table.
- **Cross-agent inconsistency:** staff live in BOTH `pos_staff` (10 cols, used by schedule) and `staff_members` (61 cols, used by labour); revenue-per-staff-hour is 200 (schedule) vs 120 (labour). ACTION: pick canonical staff table + a single shared constant/config; point all agents at them.
- **"5 agents lack AI" is FALSE** — all 8 so far use claudeStructured/claudeReason. Treat §3 as "log all AI calls", not "add AI".

### D.9 waste_elimination — VERIFIED (CORRECTS §1.1, §2.9, benchmark — the "never emits" claim is STALE)
**IMPORTANT CORRECTION:** the benchmark/§1.1 said waste "never calls saveDecisions → silent". That is OUTDATED. Current code (481 lines) DOES emit: builds `AgentDecisionInput[]` (line 279), pushes `reduce_prep` decisions (293-313), calls `this.saveDecisions(decisions)` (line 334), and returns them. It ALSO has AI (`claudeReason`, line ~223 narrative). So waste is NOT one of the silent agents anymore — re-verify supplier (D.10) and bas (D.12) the same way; the "3 silent agents" list may be stale too.

**What's already TRUE in code (do NOT rebuild):**
- Prep predictions per product (writes `prep_predictions`), waste-risk = `max(0, recommended_prep_qty − predicted_units_sold) × cost_price`, filters to `wasteValue > 0.5`, top 5 by value. Each emits a `reduce_prep` decision with **correct impact** = `wasteValue × 100` cents (waste cost avoided — measures the RIGHT quantity, unlike flash/financing/schedule). Confidence = prediction_confidence (data-driven, good). AI narrative briefing via logged `claudeReason`. T-1 escalating 20% markdown promos auto-created for ≥$5 exposure items. **Schema-clean:** prep_predictions, waste_log, pos_promotions all exist; pos_products has shelf_life_days + cost_price.

**REAL bugs/gaps to FIX (verified — narrow):**
1. **Silent when `predictions.length === 0` (line 219-220):** if the prep-prediction step yields nothing (e.g. thin sales history), it returns no decisions. For Sip this is likely why it's quiet. ACCEPTABLE if genuinely no data, but ensure the prediction step itself isn't over-gated. Verify it produces predictions with Sip's 70 sales of cafe data; if not, loosen the prediction threshold.
2. **Par levels / shelf-life not fully used (the §2.9 upgrade):** `shelf_life_days` EXISTS on pos_products but the agent keys off predicted-sales-vs-prep, not a true par-level = `avg daily usage × shelf_life_days + safety`. Markdown is a flat 20% at T-1, not the escalating 20%→50% schedule. UPGRADE per §2.9: incorporate `shelf_life_days` into par/over-stock detection and make markdown escalate as expiry approaches (20% at T-1, 50% same-day). Keep the existing prep-based logic.
3. **Markdown promo has no agent_decision link:** the markdown promos (316-332) are inserted to `pos_promotions` but only the `reduce_prep` decision is surfaced to the council — the markdown action isn't its own visible decision. Consider surfacing the markdown as a decision too (or note it in the reduce_prep decision_data) so the owner sees/approves it. Confirm `pos_promotions` columns match the insert (name, discount_pct, product_ids, valid_from, valid_until, is_active, created_by) before relying on it.

**Verify after:** run on Sip; if waste stays silent, confirm it's because `predictions.length === 0` (legit thin data) vs an over-strict gate. Seed/confirm cafe items with cost_price + a few days of sales → confirm a `reduce_prep` decision with non-zero waste-cost impact emits. Paste the decision in the commit body.

**Spec correction:** REMOVE waste from the "silent agents to fix" list (§1.1) — it already emits with correct impact + AI. Its real work is the §2.9 par/shelf-life/escalating-markdown upgrade + verifying the prediction step fires on real cafe data. This is now the 2nd-cleanest agent (after menu) — good shape.

### D.10 supplier_negotiation — VERIFIED (corrects §1.1, §2.10, benchmark — "silent" claim STALE, but data-starved)
**CORRECTION:** like waste, the "never calls saveDecisions / silent" claim is STALE. Current code (382 lines) DOES emit: builds decisions, `decisions.push` (350), `saveDecisions` (372), real impact `projected_impact_cents = annualSavingIfSuccessful × 100` (364), AI via `claudeStructured`. PPV/price-creep/leverage logic present (leverage ×36, variance ×9). So REMOVE supplier from the "silent agents" list too — the §1.1 premise is now confirmed stale for waste AND supplier; re-verify bas (D.12).

**The REAL problem is worse than "silent" — it's DATA-STARVED by missing tables (verified):**
1. **4 of its 6 tables DO NOT EXIST:** `supplier_contracts` (read), `supplier_invoice_items` (read — THE per-line-item price source for PPV), `supplier_negotiation_profiles` (write), `supplier_price_variances` (write) are ALL MISSING. Only `supplier_invoices` and `supplier_negotiation_briefs` exist. Consequences: the price-creep/PPV engine has NO line-item data to analyse (reads return empty), and its profile/variance writes silently fail. It can still emit a brief, but with no real variance basis.
2. **`supplier_invoices` has only invoice-LEVEL totals** (`total`, `gst_amount`, `amount`, `supplier_name`, `invoice_date`) — NO per-SKU/line-item prices. So even the existing table can't support per-SKU price-variance. PPV is structurally impossible until per-line-item data exists.
3. **`target_price`/`annual_volume` = 0 occurrences** in code despite §2.10 calling for them — the saving figure is computed some other way; verify `annualSavingIfSuccessful` is grounded in real numbers, not an assumption.

**FIX (decide with owner — this needs a data foundation, not just code):**
1. CREATE the missing tables, primarily `supplier_invoice_items` (per-line SKU, qty, unit_price, invoice_id FK) — this is the foundation the whole agent needs. Also create `supplier_negotiation_profiles` and `supplier_price_variances` (its output stores) OR remove those writes. `supplier_contracts` create-or-remove.
2. Populate `supplier_invoice_items` — this requires invoice OCR/line-item capture (does the receipt-scan/OCR pipeline write line items anywhere? CHECK — there may be an existing source like `receipt_ocr_scans` to wire in). If no line-item data exists yet, the agent should HONESTLY emit nothing until invoices-with-lines exist, and the owner should be told "connect/scan supplier invoices to enable negotiation analysis" — do NOT fabricate variance from invoice totals.
3. Once line-items exist: implement true PPV per §2.10 (per-SKU recent unit cost vs trailing baseline; flag creep > threshold/CPI), leverage (annual spend, alternates, renewal window), `projected_impact_cents = (current − target) × annual_volume`.
4. Route the raw work through the logged AI helper (it already uses claudeStructured — confirm it logs agent_key='supplier_negotiation').

**Verify after:** Sip has 0 supplier invoices → legitimately silent. To prove it works, the owner must capture ≥2 invoices for the same SKU over time (or seed `supplier_invoice_items`); then confirm a price-creep brief emits with a real saving impact. Until line-item data exists, "silent" here is CORRECT, not a bug.

**Spec correction:** supplier isn't "silent because no saveDecisions" — it emits, but it's starved because `supplier_invoice_items` (and 3 other tables) don't exist and invoices store only totals. The real work is a DATA FOUNDATION (line-item capture) + creating output tables, THEN the PPV algorithm. Flag honestly to owner that this agent can't be meaningful without per-line-item invoice data.

### D.11 reconciliation — VERIFIED (confirms Tier-1 / §2.11 — strongest agent, minor gaps)
**What's already TRUE in code (459 lines — best-architected agent):**
- Modular: separate recon-decision and anomaly-decision builders, `decisions.push` ×4, conditional `saveDecisions` (only if decisions exist). AI via BOTH `claudeReason` (×3) and `claudeStructured`. Reads 10 tables, writes `daily_reconciliations`, `expense_anomalies`, `monthly_pl_reports`.
- REAL impact, correct quantities: recon variance → `impact = abs(variance_amount) × 100` (line 146); expense anomaly → `impact = (amount − avg) × 100` (line 274). Heavy statistical work (variance ×27). Two confidence scores (differentiated).
- **Almost schema-clean:** 6 of 7 tables exist (business_expenses, daily_reconciliations, expense_anomalies, monthly_pl_reports, pos_purchase_orders, supplier_invoices). Only `basiq_connections` missing.

**REAL bugs/gaps to FIX (verified — narrow, this agent is in good shape):**
1. **`basiq_connections` (bank feed) DOES NOT EXIST** — same missing table flagged in D.5 (inventory_financing reads it too). So the BANK side of reconciliation has no data; recon currently works POS-side only (cash-up vs sales vs expenses vs supplier invoices — all real tables). FIX: if Basiq bank-feed integration isn't built, gate the basiq read behind a feature check and have recon honestly operate on POS+expense data only, telling the owner "connect your bank (Basiq) for full bank reconciliation." Do NOT leave a read against a non-existent table. (Shared fix with D.5 — create `basiq_connections` only when the Basiq integration is actually wired.)
2. **No explicit `match_rate` % surfaced (the §2.11 point):** `match_rate`/`matched`/`unmatched` ≈ 0 in code — it does variance/anomaly but doesn't report a headline "X% of transactions reconciled, N need attention." ADD a match-rate metric to the recon decision so the owner gets the Xero-style headline number.
3. **Anomaly detection uses variance/avg, not explicitly z-score/IQR (§2.11):** it flags `amount − avg` overage. CONSIDER upgrading to a proper z-score or IQR outlier test (it already computes variance, so stddev is one step away) for statistically defensible anomaly flagging, with a configurable sensitivity. Keep the existing avg-based flag as fallback.

**Verify after:** run on Sip; recon may be quiet if Sip has no expenses/cash-up data. Seed a few `business_expenses` (incl. one outlier) → confirm an expense-anomaly decision with `impact = (amount−avg)×100` emits, and (after #2) a match-rate appears. Bank recon stays unavailable until Basiq is wired (honest, not a bug).

**Spec correction:** §2.11/benchmark Tier-1 verdict HOLDS — reconciliation is the strongest agent (modular, AI, correct impact, mostly schema-clean). Only real gaps: the missing Basiq bank feed (shared with financing), a missing headline match-rate %, and an optional z-score/IQR anomaly upgrade. No impact-math bug, no emission bug.

### D.12 bas_compliance — VERIFIED (corrects §1.1, §2.12, benchmark — cleanest/most-correct agent; "silent" claim STALE)
**IMPORTANT: the entire "3 silent agents (waste/supplier/bas)" premise (§1.1) is now CONFIRMED FULLY STALE.** All three emit. Delete §1.1 as written — there are NO silent-no-saveDecisions agents. The real issues were elsewhere (impact math, phantom tables/columns, data starvation).

**What's already TRUE in code (280 lines — the cleanest, most correct agent of all 12 so far; do NOT rebuild):**
- Emits: `saveDecisions([decision])` (line 55), real impact = `totalPayable × 100` (line 52), AI via `claudeReason`. Schema-clean: ALL 5 tables exist (bas_drafts, super_obligations, product_tax_classifications, pos_timesheets, supplier_invoices).
- **Already does the thing §2.12 asked for — rates are CONFIG, not hardcoded:** `gstRate = config.gst_rate ?? 0.10`, `superRate = config.super_guarantee_rate ?? 0.115`. AND it already emits an owner-confirmation flag: `super_rate_flag: 'ACTION REQUIRED: Confirm the current AU super guarantee rate...'`. Whoever built this was appropriately cautious — exactly what we wanted.
- **GST computed the CORRECT ATO way:** `field_1a_gst_on_sales = taxableSales × gstRate/(1+gstRate)` (extracts GST from GST-inclusive sales), `1b` credits likewise, quarter detection via `getCurrentQuarter`, due dates, super per staff from `pos_timesheets` earnings × superRate.

**REAL gaps to FIX (verified — minor, this agent is in excellent shape):**
1. **Default super rate `0.115` (11.5%) may be stale for the current FY** — the config default is a hardcoded fallback. The owner-confirm flag mitigates this, but: VERIFY the current AU super guarantee rate (it steps up over recent FYs) and update the DEFAULT, and ideally make the rate date-aware (different rate per financial year). Keep the config override + owner flag. (Per global rules: do not assume the rate — confirm against ATO.)
2. **PAYG withholding:** present (PAYG ×2, payg ×5) — verify it uses correct current withholding logic/tables, or clearly marks it an estimate. PAYG instalments vs withholding should be distinguished.
3. **Due-date alert urgency:** it computes dueDate but confirm the decision's urgency/confidence escalates as the BAS deadline approaches (a BAS due in 3 days should rank higher than one due in 80). Add deadline-proximity to confidence/urgency.
4. **`decisions.push: 0`** — it saves a single decision via `saveDecisions([decision])` (fine), but only ONE BAS decision per run. If there's also a super-shortfall or an anomaly, consider surfacing those as separate decisions. Minor.

**Verify after:** Sip likely has minimal sales/timesheets → a small BAS draft may still emit (GST on its 70 sales). Confirm a `bas_drafts` row + a decision with `impact = totalPayable×100` and the super_rate_flag present. Confirm GST extraction math on a known sale total.

**Spec correction:** REMOVE bas from "silent agents" (it emits). §2.12's "make rates config + owner flag" is ALREADY DONE. Real work: verify/update the current super rate default + make it FY-aware, verify PAYG, add deadline-proximity urgency. This is the model other agents should follow for handling regulated numbers (config + owner-confirm flag + correct formula + AI explanation only).

### D.13 reputation_defence — VERIFIED (confirms §2.13 / benchmark CLOSE→can-beat-Birdeye; schema-clean)
**What's already TRUE in code (336 lines):**
- Emits: `saveDecisions`, `decisions.push` ×2 (review-response + review-velocity decisions). AI via BOTH `claudeReason` and `claudeStructured`. Generates reply drafts (draft ×12), sentiment (×6), rating analysis, review-request automation. **Schema-clean:** all 5 tables exist (business_reviews, review_requests, pos_customers, staff_members, aria_autopilot_actions).

**REAL gaps to FIX (verified — these are the §2.13 "beat Birdeye" features, confirmed NOT built):**
1. **NO reply-memory (the headline beat-Birdeye feature):** `past_repl`/`previous_repl`/`reply_memory`/`memory` = 0 occurrences. The reply-draft prompt does NOT receive the business's recent past replies → it can repeat phrasing, the exact documented Birdeye weakness. FIX (the moat): before drafting, fetch the last N replies from `business_reviews` (or wherever replies are stored) and pass them into the prompt with an instruction to vary tone/wording. This is the cheapest genuine competitive win in the whole agent set.
2. **NO competitor review benchmarking:** `competitor`/`benchmark` = 0. §2.13 wants own rating/sentiment vs nearby competitors. The competitor tables exist elsewhere (aria_competitor_watches etc.) — wire them in to show "your 4.2 vs area avg 3.8".
3. **Sentiment is polarity, not per-aspect:** `aspect` = 0. UPGRADE to per-aspect (service/food/price/wait) so replies + insights are specific. Keep overall polarity.
4. **Impact is a flat heuristic:** line 234 `projected_impact_cents = thisWeek × 5000` (i.e. $50 per review this week — a fixed assumption). FLAG as estimate and make the per-review value config, or derive from the documented review→revenue elasticity (~5–9% revenue per star, applied conservatively). Don't present a hardcoded $50/review as if precise.

**Verify after:** Sip has 0 reviews → legitimately silent (correct). Seed 2–3 `business_reviews` (incl. a negative) → confirm a reply-draft decision emits, the draft VARIES from any prior reply (post reply-memory fix), and impact is labelled an estimate.

**Spec correction:** §2.13/benchmark verdict HOLDS — reputation is solid and schema-clean; its gaps are the un-built competitive features (reply-memory, competitor benchmarking, per-aspect sentiment) + a heuristic impact. No emission/phantom-table bug. Reply-memory is the priority — it's the documented way to BEAT Birdeye.

### D.14 customer_acquisition — VERIFIED (confirms §2.14 + SearchAtlas addendum; schema-clean)
**What's already TRUE in code (310 lines):**
- Emits: `saveDecisions`, `decisions.push` ×2 (a review-gap-vs-competitor decision + an AEO content-recommendation decision). AI via BOTH `claudeReason` ×2 and `claudeStructured` ×2. Real AEO + GBP + competitor work (aeo ×13, gbp ×33, competitor ×12, content ×32, review ×33). **Schema-clean:** all 4 tables exist (aeo_content_pieces, aria_competitor_watches, business_aeo_profiles, business_reviews).

**REAL gaps to FIX (verified):**
1. **Impact is heuristic constants, not derived:** line 279 `max(5000, (compReviews − reviewCount) × 500)` ($5 per review-gap, floor $50); line 294 high/med/low → $1500/$500/$200 fixed. These are assumptions. FLAG as estimates and make configurable; ideally tie content-rec impact to the page's existing impressions/traffic where available, not a flat tier.
2. **SearchAtlas-beating features (per Addendum A) NOT yet present:** `keyword`/`ranking`/`seo` = 0 in code — it does AEO content + GBP + review-gap, but NOT the real-code on-page SEO fixes (title/meta/JSON-LD per Addendum B) or POS-data-driven SEO (high-margin product with no page). ADD per Addendum A: (a) propose real-code on-page fixes for pages missing metadata/schema, (b) POS-data SEO (top/high-margin products lacking a landing page → propose one), (c) severity-ranked actions with $ impact. These are what differentiate vs SearchAtlas's JS-pixel approach.
3. **`gap` = 0 literal but competitor analysis exists:** it compares review counts vs competitors but doesn't do the full "queries/topics competitors rank for that you don't" gap analysis. ADD using `aria_competitor_watches`.

**Verify after:** run on Sip; confirm it emits an AEO content-rec and/or review-gap decision (Sip has competitor watches?). After Addendum A+B, confirm it proposes a real-code on-page fix and a POS-data-driven page suggestion. Label all SEO impact as estimates.

**Spec correction:** §2.14/benchmark HOLDS — customer_acquisition is schema-clean and emits with AI. Real work: SearchAtlas-beating features (real-code on-page fixes via Addendum B, POS-data SEO, severity+$ ranking), full competitor gap analysis, and labelling heuristic impact as estimates. No emission/phantom-table bug.

---

## ADDENDUM E — CONSOLIDATED FINDINGS ACROSS ALL 14 AGENTS (authoritative; supersedes §2 and benchmark where they conflict)

All 14 agents verified against live code + live DB on 2026-06-04. Summary:

**MAJOR CORRECTIONS to earlier sections (treat these as fact):**
1. **"5 agents lack AI" / "add AI to 5" is FALSE.** ALL 14 agents use `claudeReason`/`claudeStructured`. §3 = "ensure all AI calls log to aria_ai_calls via BaseAgent helpers", NOT "add AI". Verify logging, don't add AI.
2. **"3 silent agents (waste/supplier/bas) never call saveDecisions" is FALSE/STALE.** All 3 emit. Delete §1.1's "fix silent agents" task. (supplier is data-starved, not silent — see below.)
3. The earlier benchmark was written from a shallow scan and SYSTEMATICALLY too harsh — most agents are more built than it implied.

**THE TWO REAL SYSTEMIC PROBLEMS (fix globally):**

A. **SCHEMA DRIFT — phantom columns/tables (found in most agents).** Before editing ANY agent, dump live schema and reconcile every select/insert. Specifics:
   - reorder: `pos_suppliers.lead_time_days` (phantom col) + unused `pos_products.reorder_point`
   - pricing: `competitor_price_cache.own_margin_pct`/`own_price_cents` (phantom → dead lift branch)
   - clv: `customer_clv_scores.churn_risk_score`/`churn_risk_updated_at` (phantom cols)
   - inventory_financing: **4 phantom TABLES** (cash_flow_forecasts, financing_opportunities, basiq_connections, supplier_negotiation_profiles)
   - labour: `labour_demand_forecast` (phantom table)
   - schedule: reads `pos_staff` for `hourly_rate_cents/rsa_expiry/max_hours_week/availability` (NONE exist → fake wages/availability)
   - menu: `pos_products.prep_time_minutes` (phantom col) + `plowhouse`→`plowhorse` typo
   - supplier: **4 phantom tables** (supplier_contracts, supplier_invoice_items, supplier_negotiation_profiles, supplier_price_variances) + invoices have no line items
   - reconciliation: `basiq_connections` (phantom table — shared with financing)
   - (clean: bas, reputation, customer_acquisition, waste)

B. **IMPACT MATH MEASURING THE WRONG QUANTITY (3 agents) → the $0/odd values seen live:**
   - flash_revenue: impact = revenue in last 2h × lift → $0 during a dead period (the whole trigger). Fix: baseline-revenue × lift × response_rate. Confidence = lift/100 (wrong) → use data strength.
   - inventory_financing: impact = abs(min(0, closing_cash)) → $0 unless cash NEGATIVE. Fix: shortfall vs safety threshold / net financing benefit.
   - schedule: impact = total roster COST (mislabelled as benefit). Fix: savings or sales-protected.

**CROSS-AGENT INCONSISTENCIES (fix once):**
- Staff data split across `pos_staff` (10 cols, schedule) and `staff_members` (61 cols, labour) — pick canonical, point both at it, pull real wages from `staff_pay_rates` (CENTS).
- Revenue-per-staff-hour: 200 (schedule) vs 120 (labour) — reconcile to one config value.
- `basiq_connections` bank feed missing — blocks bank-side of BOTH financing and reconciliation; one integration unblocks both.

**DATA-FOUNDATION (not code) PROBLEMS — be honest with owner:**
- supplier_negotiation: needs per-line-item invoice data (`supplier_invoice_items`) that doesn't exist; can't do PPV until invoice line-items are captured (OCR pipeline). Until then, silent = correct.
- inventory_financing + reconciliation bank side: need Basiq integration.

**HEURISTIC IMPACT FIGURES TO LABEL AS ESTIMATES (not precise $):**
- reputation: $50/review (thisWeek × 5000)
- customer_acquisition: $5/review-gap, $1500/$500/$200 content tiers

**AGENT HEALTH RANKING (best→worst, verified):**
1. bas_compliance — cleanest, correct AU tax math, config rates + owner flag (MODEL to follow)
2. reconciliation — best architected, correct impact, only missing Basiq + match-rate %
3. waste_elimination — schema-clean, correct impact, emits (needs par/shelf-life upgrade)
4. menu_engineering — most sophisticated (typo + 1 phantom col + 70%-rule upgrade)
5. reputation_defence — schema-clean (needs reply-memory to beat Birdeye)
6. customer_acquisition — schema-clean (needs SearchAtlas-beating real-code SEO)
7. labour_optimisation — good impact math (1 phantom table + AU award rates)
8. pricing — emits + fallback (phantom col dead-branch + no elasticity)
9. reorder — stat safety-stock already done (phantom col + unused reorder_point)
10. clv — rich model (phantom churn cols + 0-impact filler + no BG/NBD)
11. flash_revenue — strong reasoning (backwards impact/confidence math)
12. schedule — full roster gen (fake staff inputs + cost-as-impact)
13. inventory_financing — forecast works (4 phantom tables + $0-impact bug)
14. supplier_negotiation — emits but DATA-STARVED (4 phantom tables + no line-item data)

**REVISED BUILD PRIORITY (supersedes earlier phase order):**
P1 (correctness, visible): fix the 3 impact-math bugs (flash, financing, schedule) → fix all phantom columns (reorder, pricing, clv, menu) → fix cross-agent staff/constant inconsistencies.
P2 (create missing output tables OR remove writes): financing (4), supplier (4), labour (1), reconciliation/financing basiq — decide create-vs-remove per table WITH owner.
P3 (data foundations, honest): supplier line-items, Basiq bank feed — flag to owner; agents stay honest-silent until data exists.
P4 (proven algorithms): reorder σ_LT, pricing elasticity, clv BG/NBD + next-order-date, menu 70%-rule, flash demand-curve, waste par/markdown, labour AU award rates.
P5 (beat-the-leader): reputation reply-memory, customer_acquisition real-code SEO (Addendum B) + POS-data SEO, competitor gap analysis.
P6: ensure all AI calls log to aria_ai_calls; recalibrate confidence; add match-rate to reconciliation.
