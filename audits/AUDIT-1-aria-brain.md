# Aria Brain & Repo Audit — 2026-06-12

> AUDIT-1. Read-only. Every claim below is grounded in a file read or grep executed during this audit.
> Where something could not be verified without live-DB access, it is marked **NEEDS-DB-VERIFY**.

---

## 0. Executive findings (top 10)

1. **HIGH — "Today"/"yesterday" boundaries are UTC midnight everywhere.** Vercel runs UTC; for an AU business (UTC+10/11) every "today" figure actually covers a window starting 10–11am local. Affected: `src/app/api/aria/vitals/route.ts:22-23`, `src/lib/aria/ask/business-context.ts:85`, `src/app/api/cron/daily-briefing-submit/route.ts:80-82`, `src/lib/aria-tools.ts:411`, `src/app/api/cron/generate-briefings/route.ts:103`. The `businesses.timezone` column is selected by daily-briefing-submit (line 118) but **never used** in date math.
2. **HIGH — "Same week last month" = `d-35 → d-28` (28-day month assumption).** Weekday-aligned but lands 2–3 calendar days off a true "same dates last month" for 30/31-day months — this is the suspected off-by-2-day. Two implementations, same definition: `src/lib/aria/ask/facts-packet.ts:66-79` and `src/lib/aria/get-business-context.ts:21-23,100-103`. Verbatim quotes in §3.
3. **HIGH — "This week" is rolling-last-7-days in ALL AI context code, but the briefing prompt labels it "Week so far"** (calendar-week-to-date connotation). No calendar-week (Mon-to-now) definition exists anywhere in the revenue paths audited. `src/app/api/cron/daily-briefing-submit/route.ts:83,101,141`.
4. **HIGH — `public/aria-sw.js` serves stale pages on client-side navigation.** `/api/*` is correctly excluded (line 17), and full navigations are network-first (lines 18-24). BUT all other same-origin GETs — which include Next.js RSC payload fetches (`?_rsc=`) used by client-side `<Link>` navigation — are **cache-first** (lines 26-33: `return cached || net`). This matches the founder's "needs hard refresh" report exactly.
5. **HIGH — Cron sprawl: 54 crons in vercel.json.** CLAUDE.md RULE 4's "22" refers to the `functions` block (currently 9 configs — compliant). 54 cron entries needs checking against the Vercel Pro plan cron limit (**NEEDS-VERIFY** — Pro historically capped at 40). All schedules are daily-or-less ✓ (the previously-flagged `parcel-insights 0 */6` is now `0 6 * * *` ✓).
6. **MED — 8 cron route folders exist but are NOT scheduled in vercel.json**: `clv-outcomes, clv-weekly, flash-outcomes, flash-revenue, generate-briefings, memory-consolidate, reviews-weekly-digest, run-scheduled-reorders`. Either dead code or manual-trigger-only; `generate-briefings` (425 lines) overlaps the scheduled `daily-briefing-submit`/`daily-briefing-poll` batch pipeline and writes two briefing tables.
7. **MED — THREE briefing tables all actively used by different routes** (per RULE 6 they have different columns): `daily_briefings` ← read by `api/aria/daily-briefing/route.ts:120`; `aria_daily_briefings` ← written by `cron/daily-briefing-poll:54` + `cron/generate-briefings:329`, read by `api/aria/briefing/route.ts:128`; `pos_daily_briefings` ← written by `cron/generate-briefings:209,363`. No single source of truth; the two UI-facing briefing routes read **different tables**.
8. **MED — Two BlockRenderers with split consumers.** `components/dashboard/BlockRenderer` ← `app/dashboard/ask-aria/page.tsx:15` + `components/dashboard/AriaBriefingCard.tsx:3`; `components/aria/BlockRenderer` ← `app/pos/ask/page.tsx:9`. Every new AskBlock type must be added twice or the POS surface silently degrades.
9. **MED — Second dashboard route group `app/(dashboard)/chat/` with its own layout and its own sidebar** (`components/chat/Sidebar`). The main dashboard uses `components/dashboard/Sidebar` via DashboardShell. A third surface to forget during nav/UX changes.
10. **MED — `pos_sale_items` reads without voided-sale filtering** in `cron/generate-briefings/route.ts:109-113` (product movers include items from voided sales; correct pattern is the inner-join used in `business-context.ts:119-124`). Also `cron/daily-briefing-submit:89` ("top seller" yesterday — same issue). `pos_sale_items.business_id` EXISTS (nullable, `types/database.types.ts:15655+`) — the TODO at `components/terminal/LivePulseRail.tsx:45` claiming it doesn't is stale; whether the column is fully populated is **NEEDS-DB-VERIFY**.

---

## 1. AI brain entry points

Model IDs resolve via `src/lib/aria/providers/anthropic.ts:13-17`: haiku=`claude-haiku-4-5-20251001`, sonnet=`claude-sonnet-4-5-20250929`, opus=`claude-opus-4-5-20251101` (matches RULE 8 ✓).

| Entry point | File (function) | Model | Tools | Tables read/written | Prompt source | aria_ai_calls logging |
|---|---|---|---|---|---|---|
| Main brain | `src/app/api/aria/ask/route.ts` `_POST` (~1700 lines) | routed haiku/sonnet/opus via model-router | full `ARIA_POS_TOOLS` (query_business_data, query_sales, web_search, generate_report, send_email_now, …) | reads pos_sales, pos_customers, pos_products, aria_conversations, businesses + tool-reachable tables; writes aria_conversations, aria_user_tasks | inline template lines 767–1245+ (IRON RULES 769-779, BREVITY ~1156, GROUNDING ~1184) | via `callAnthropicWithTools` insert (providers/anthropic.ts:244), agent_key=`ask_aria`, request_summary=first 100 chars (since PROMPT-TIGHTEN-1) |
| General/web path | same file ~479-493 | haiku | web_search, fetch_url only | — | `generalSystemPrompt` | agent_key=`ask_aria` |
| Verifier | same file ~1544-1560 | haiku | none | — | inline reviewer prompt | agent_key=`ask_aria_verifier` |
| Deliverables | `src/lib/aria/deliverables.ts` (`extractDeliverableIntent`, `generateDeliverable`) | haiku (intent), haiku (HTML gen) | none — direct supabaseAdmin fetches | pos_sales, pos_sale_items, pos_outlet_inventory, pos_customers, staff; writes aria_task_outputs | `INTENT_SYSTEM` const line 31 | logs deliverable calls (agent_key=`deliverable`) |
| Response validator | `src/lib/aria/response-validator.ts` `validateAndHeal` | haiku only | Check 4 only: query_business_data + compare_periods | writes aria_ai_calls (agent_key=`heal`) | inline heal prompts | logHeal → learning_signal `healed:*` / `guard_fired:ungrounded_numeric` |
| Council | `src/lib/aria/council.ts` `runAriaCouncil` | multi-brain; synthesis model dynamic (line 839 `synthesisModel`) | — | reads ctx from get-business-context; writes council outputs | inline (kpi_card/comparison_table examples lines 334, 414) | agent_key=`council_*` |
| Briefing (on-demand) | `src/app/api/aria/briefing/route.ts` | per file (Sonnet-class narrative) | none | reads aria_daily_briefings:128, activity_log, profit_leaks, pos_customers, **reviews** (:168 — NOT google_reviews; RULE 6 risk), pos_cash_sessions, pos_stock_takes, pos_shift_audits, market_price_scans | inline | yes |
| Daily-briefing (on-demand) | `src/app/api/aria/daily-briefing/route.ts` | per file | none | reads **daily_briefings**:120 (different table from above!), google_reviews, campaigns, competitor_alerts, staff_members, warehouse_*, bookings | inline | yes |
| Briefing batch submit | `src/app/api/cron/daily-briefing-submit/route.ts` | haiku via Anthropic **Batch API** (`submitBatch`) | none | reads pos_sales, pos_products, pos_sale_items, market_price_scans, pos_market_price_cache; writes aria_batch_jobs, cron_logs | `ARIA_SYSTEM_PROMPT` from `lib/aria-system-prompt` | batch — not per-call |
| Briefing batch poll | `src/app/api/cron/daily-briefing-poll/route.ts` | — (collects batch results) | — | writes **aria_daily_briefings**:54 | — | — |
| generate-briefings (UNSCHEDULED) | `src/app/api/cron/generate-briefings/route.ts` (425 lines) | per file | none | writes pos_daily_briefings:209,363 AND aria_daily_briefings:329 | inline | partial |
| aria-brain cron | `src/app/api/cron/aria-brain/route.ts` → `lib/aria/brain.ts ariaObserve` | none in route (observation collector) | — | reads pos_products, compliance_items; writes observations via ariaObserve | — | — |
| aria-intelligence cron | `src/app/api/crons/aria-intelligence/route.ts` (209 lines) | per scheduled-report runner | — | aria_competitor_watches, square/shopify/lightspeed_connections, staff_announcements, aria_scheduled_reports | — | — |
| Provider lib | `src/lib/aria/providers/anthropic.ts` (`callAnthropic` :~51, `callAnthropicWithTools` :150) | caller-specified | caller-specified | writes aria_ai_calls :101, :244 (request_summary param since PROMPT-TIGHTEN-1, only ask_aria call sites pass it) | caller | central logging point |
| Gemini provider | `src/lib/aria/providers/gemini.ts` + `src/lib/gemini.ts` (duplicate basename) | Gemini | — | — | caller | fallback path in agents.ts:133 |

**Distinct `agentKey:` values found (grep `agentKey:\s*'…'`):** `generic` (workforce-brain, inbox summary, customer aria-insight, loyalty aria-insight), `heal`, `conversation_summarizer`, `ask_aria`, `ask_aria_verifier`, `memory_extractor`, `document_vision`, `hypothesis_engine`, `long_doc_map`, `long_doc_reduce`, `ask_suggestions`, `intent_classifier`, `aria_intent_classifier`, `signal_engine_synth`, `hardware`, `review_reputation`, `marketing_ai_generate`. (Other keys in the `AgentKey` union — promo, pricing, inventory, compliance, rostering, etc. — are dispatched dynamically through `lib/aria/agents.ts runAgent` / `lib/aria/router.ts`.)
Additional agent_key values written by direct inserts (not via providers): `sql_guard` (aria-tools), `deliverable`, `council_*`, `competitive_brief`, `sale_insight`, `booking_analysis` and ~20 more one-off route-level inserts (grep `aria_ai_calls').insert` → 20+ files).

**LLM-calling files overall:** 80+ files match `messages.create|callAnthropic|claude-` (grep capped at 80). The big secondary families: `lib/agents/*` (bas, clv, council, flash-revenue, waste-elimination, reputation-defence, labour-optimisation… each backing a cron) and ~35 one-off `api/aria/*-insight`-style routes.

---

## 2. Cron inventory

vercel.json: **9 function configs** (RULE 4 "22 max" ✓ compliant) and **54 cron entries** — count verified by reading the full file. All schedules daily or less frequent ✓ (weekly: weekly-report Sun 22:00, aeo-weekly Sun 21:00, customer-acquisition Mon 21:00, inventory-financing Sun 19:00; monthly: supplier-negotiation 1st 20:00).

| # | Path | Schedule (UTC) | One-line purpose (from route read/name) |
|---|---|---|---|
| 1 | /api/cron/kiosk-token-rotate | 0 18 * * * | rotate kiosk access tokens |
| 2 | /api/cron/expire-checkout-carts | 0 18 * * * | expire stale checkout carts |
| 3 | /api/cron/parcel-insights | 0 6 * * * | parcel delivery insights (fixed from 0 */6 ✓) |
| 4 | /api/cron/nightly-sync | 0 2 * * * | integrations nightly sync |
| 5 | /api/cron/rfm-daily | 0 16 * * * | RFM customer scoring |
| 6 | /api/cron/daily-briefing-submit | 0 16 * * * | submit Haiku Batch for morning briefings (read in full — §1) |
| 7 | /api/cron/daily-briefing-poll | 0 3 * * * | poll batch → write aria_daily_briefings |
| 8 | /api/cron/publish-scheduled | 0 9 * * * | publish scheduled social posts |
| 9 | /api/cron/sync-engagement | 0 3 * * * | social engagement sync |
| 10 | /api/cron/aria-brain | 0 2 * * * | observation collector: low stock + overdue compliance → ariaObserve (read in full — 88 lines, no LLM) |
| 11 | /api/cron/sync-reviews | 0 6 * * * | Google reviews sync |
| 12 | /api/cron/loyalty-birthday | 0 9 * * * | birthday loyalty messages |
| 13 | /api/cron/loyalty-winback | 0 10 * * * | loyalty winback |
| 14 | /api/cron/notify-ready | 0 23 * * * | notify ready orders/outputs |
| 15 | /api/crons/aria-intelligence | 0 8 * * * | competitor watches + POS connection health + scheduled reports (read — 209 lines) |
| 16 | /api/cron/signal-engine | 0 3 * * * | sales signal detection (11 pos_sales reads, all voided-filtered ✓) |
| 17 | /api/cron/customer-scoring | 0 3 * * * | customer scoring |
| 18 | /api/cron/memory-extract | 0 16 * * * | conversation memory extraction |
| 19 | /api/cron/hypothesis-engine | 0 15 * * * | hypothesis generation |
| 20 | /api/cron/outcome-check | 0 17 * * * | action outcome verification |
| 21 | /api/cron/marketing-automations | 0 11 * * * | marketing automation runner |
| 22 | /api/cron/parcel-sync | 0 6 * * * | parcel tracking sync |
| 23 | /api/cron/leave-accrual | 0 1 * * * | staff leave accrual |
| 24 | /api/cron/seo-crawl | 0 7 * * * | SEO crawler |
| 25 | /api/cron/weekly-report | 0 22 * * 0 | weekly report PDF/email |
| 26 | /api/cron/price-schedules | 0 5 * * * | timed price schedule application |
| 27 | /api/cron/seo-keyword-check | 0 3 * * * | SEO keyword ranks |
| 28 | /api/cron/seo-verify-fixes | 0 2 * * * | verify applied SEO fixes |
| 29 | /api/cron/competitor-monitor | 0 22 * * * | competitor monitoring |
| 30 | /api/cron/loyalty-expiry | 0 4 * * * | loyalty points expiry |
| 31 | /api/cron/mark-overdue | 0 1 * * * | mark overdue invoices |
| 32 | /api/cron/timed-prices | 0 9 * * * | timed price toggles |
| 33 | /api/cron/xero-sync | 0 2 * * * | Xero sync |
| 34 | /api/cron/send-scheduled-campaigns | 0 12 * * * | send scheduled campaigns |
| 35 | /api/cron/booking-reminders | 0 13 * * * | booking reminders |
| 36 | /api/cron/market-price-refresh | 0 15 * * * | market price scans |
| 37 | /api/cron/send-scheduled-reports | 0 20 * * * | scheduled report emails |
| 38 | /api/cron/xero-auto-sync | 0 1 * * * | Xero auto sync |
| 39 | /api/cron/trial-warnings | 0 9 * * * | trial expiry warnings |
| 40 | /api/cron/council-session | 0 20 * * * | nightly council run |
| 41 | /api/cron/menu-engineering | 0 6 * * * | menu engineering agent |
| 42 | /api/cron/supplier-negotiation | 0 20 1 * * | monthly supplier negotiation agent |
| 43 | /api/cron/waste-prep-guide | 0 11 * * * | waste/prep guide |
| 44 | /api/cron/waste-noon-check | 0 2 * * * | midday waste check (02:00 UTC = ~noon AEST) |
| 45 | /api/cron/waste-reconcile | 0 12 * * * | waste reconciliation |
| 46 | /api/cron/labour-optimisation | 0 19 * * * | labour optimisation agent |
| 47 | /api/cron/bas-monitor | 0 22 * * * | BAS draft generation + reminders |
| 48 | /api/cron/reputation-requests | 0 8 * * * | review request sends |
| 49 | /api/cron/aeo-weekly | 0 21 * * 0 | AEO weekly |
| 50 | /api/cron/reconciliation | 0 20 * * * | reconciliation agent |
| 51 | /api/cron/customer-acquisition | 0 21 * * 1 | weekly acquisition agent |
| 52 | /api/cron/inventory-financing | 0 19 * * 0 | weekly inventory financing agent |
| 53 | /api/cron/aria-health-monitor | 0 5 * * * | counts rows in all 3 briefing tables + system health (lines 252-267 read) |
| 54 | /api/cron/invoices-recurring | 0 9 * * * | recurring invoice generation |

**Cron folders NOT in vercel.json (8):** `clv-outcomes`, `clv-weekly`, `flash-outcomes`, `flash-revenue`, `generate-briefings`, `memory-consolidate`, `reviews-weekly-digest`, `run-scheduled-reorders`. (`[task]` is a dynamic dispatcher, `_lib` is helpers.) Whether these are intentionally manual or dead is **NEEDS-FOUNDER-DECISION**.

Success-rate over 30 days requires `cron_logs` / aria_ai_calls SQL — **NEEDS-DB-VERIFY** (daily-briefing-submit writes cron_logs:113,154,162; many crons use `trackCron`/`withCronRetry` wrappers from `_lib`).

---

## 3. Data source divergences ← CRITICAL

All audited paths consistently use `pos_sales.total_amount` with `neq('status','voided')` ✓ (RULE 6 compliant). The divergences are in **time-window definitions**, not columns.

### Metric table

| Metric | File:line | Table | Filters | Window definition |
|---|---|---|---|---|
| Today's revenue | `api/aria/vitals/route.ts:22-30` (ask-aria KPI row) | pos_sales.total_amount | neq voided | `new Date(); setHours(0,0,0,0)` = **UTC midnight** |
| Today's revenue | `lib/aria/ask/business-context.ts:85,105` (main-brain ctx) | pos_sales.total_amount | neq voided | same UTC midnight |
| Today's revenue | `lib/aria-tools.ts:411` (query_sales 'today') | pos_sales | guarded neq voided (SQL-GUARD-1) | same UTC midnight |
| This week's revenue | `lib/aria/ask/business-context.ts:86,106` | pos_sales.total_amount | neq voided | **rolling**: `now − 7 days` (time-of-day anchored, not midnight) |
| This week's revenue | `lib/aria/get-business-context.ts:11,44-45` (council ctx) | pos_sales.total_amount | neq voided | **rolling**: `now − 7×86400000` |
| This week's revenue | `lib/aria/ask/facts-packet.ts:80-93` | pos_sales.total_amount | neq voided | **rolling**: `now − 7 days` (labelled "last 7 days" — honest ✓) |
| "Week so far" | `cron/daily-briefing-submit/route.ts:83,87,101` | pos_sales.total_amount | neq voided | **rolling** `now − 7 days` but prompt line 141 says "**Week so far: A$X**" — implies calendar-week-to-date. **MISLABELLED — HIGH** |
| Week (dashboards) | `lib/aria/deliverables.ts:354-359` fetchDashboardData | pos_sales.total_amount | neq voided | rolling 7d/30d |
| Yesterday | `cron/daily-briefing-submit:80-82` | pos_sales | neq voided | UTC-day boundaries via setHours on server TZ |
| Yesterday | `cron/generate-briefings:79-81,101-103` | pos_sales | neq voided | explicit `T00:00:00Z`/`T23:59:59Z` — **UTC day, hardcoded Z** |
| Same week last month | `lib/aria/ask/facts-packet.ts:66-79` | pos_sales.total_amount | neq voided | **`d-35 → d-28`** rolling |
| Same week last month | `lib/aria/get-business-context.ts:21-23,100-103` | pos_sales.total_amount | neq voided | **`d-35 → d-28`** rolling (identical definition) |
| 28–35d baseline | `cron/generate-briefings:85-86,104-107` | pos_sales.total_amount | neq voided | d-35 → d-28 (as a "baseline daily avg") |
| Last month (MTD) | `lib/aria/ask/facts-packet.ts:36-64` | pos_sales.total_amount | neq voided | calendar-month-aligned, N-day MTD both sides — **only calendar-aligned comparison in the codebase** |
| Top customers by spend | `lib/aria-tools.ts ENTITY_TABLES.customers:670-674` | **pos_customers.total_spent** (stored column) | — | all-time |
| Top customers by spend | `lib/aria/ask/business-context.ts:126-130` | pos_customers.total_spent | — | all-time (consistent ✓) |
| Top customers (deliverable) | `lib/aria/deliverables.ts fetchRankedData` | computed from sales rows | neq voided | timeframe_days param (default 30) — **diverges from stored total_spent when asked "best customers"** (deliverable = 30-day spend; tool/ctx = lifetime spend) |
| Order count today/week | `api/aria/vitals/route.ts:33` (`(sales??[]).length`), `business-context` same pattern | pos_sales row count | neq voided | same windows as revenue above |
| Avg basket | `lib/aria/deliverables.ts fetchDashboardData` (rev7/count) + ask-aria page KPI (from vitals) | pos_sales | neq voided | rolling 7d vs today — **two different windows feed "avg basket" on different surfaces** |

### Verbatim — the "same week last month" arithmetic (both implementations)

`src/lib/aria/ask/facts-packet.ts:66-79`:
```ts
case 'same_week_last_month':
  return {
    current:    { start: new Date(now - 7 * dayMs).toISOString(),  end: new Date(now).toISOString(),            label: 'last 7 days' },
    comparison: { start: new Date(now - 35 * dayMs).toISOString(), end: new Date(now - 28 * dayMs).toISOString(), label: 'same week last month (d-35 to d-28)' },
    same_length: true,
  }
```

`src/lib/aria/get-business-context.ts:21-23` + query at 100-103:
```ts
// "Same week last month" = the 7-day window ending 28 days ago (4 weeks back)
const d28 = new Date(now.getTime() - 28 * 86400000).toISOString()
const d35 = new Date(now.getTime() - 35 * 86400000).toISOString()
...
db.from('pos_sales').select('total_amount')
  .eq('business_id', businessId)
  .gte('created_at', d35).lt('created_at', d28).neq('status', 'voided'),
```

**Analysis:** both treat "last month" as exactly 28 days. Weekday alignment is preserved (28 = 4×7), but for a 30-day month the window lands 2 days later than the same calendar dates last month, 3 days for a 31-day month — **the off-by-2(-3)-day error the founder suspected.** The windows are also time-of-day anchored to the request moment, so two queries an hour apart compare slightly different windows. The two implementations agree with each other (no internal divergence), but both differ from `facts-packet`'s own `last_month` case, which IS calendar-aligned — so Aria gives calendar-aligned answers for "vs last month" and 28-day-rolling answers for "same week last month".

### Severity-HIGH divergence flags

1. **"Week so far" label vs rolling-7d window** — daily-briefing-submit:141 (HIGH).
2. **UTC midnight "today"** on all surfaces; `businesses.timezone` selected but unused (HIGH).
3. **"Top customers": stored lifetime `total_spent` (tool/context) vs computed 30-day spend (deliverable pipeline)** — same question, different pipeline, different answer (HIGH).
4. **28-day "month"** in both same-week-last-month implementations vs calendar-aligned `last_month` in the same file (HIGH).
5. `pos_sale_items` movers without voided join in both briefing crons (MED — items of voided sales counted).

---

## 4. UI surface mount map

**Single shared chain for ALL `/dashboard/*` pages** (verified by reading layout + shell):

```
src/app/dashboard/layout.tsx
└── BusinessProvider
    ├── AnnouncementBanner (conditional)
    ├── DashboardShell (components/dashboard/DashboardShell.tsx)
    │   ├── Sidebar ← components/dashboard/Sidebar.tsx (ONLY sidebar here; desktop :53 + mobile overlay :78)
    │   ├── Mobile top bar  (hidden when isAskAria)
    │   ├── Desktop top bar (SchedulePDFButton + Briefing; hidden when isAskAria)
    │   ├── AriaAwarenessBar (hidden when isAskAria)
    │   ├── <main> {children} + SetupGuide (only pathname === '/dashboard')
    │   └── AriaCommandBar (ALWAYS — including ask-aria)
    ├── DailyBriefingModal
    ├── AriaBrainPanel  🧠 bubble (returns null on /dashboard/ask-aria)
    ├── ApiErrorToaster / WarmupPinger / InstallPrompt
```

Root `src/app/layout.tsx:102` additionally mounts **AriaFloatingButton** globally (EXCLUDED list includes /dashboard/ask-aria), which renders **AriaFloatingPanel → AriaTalkingHead** when opened.

**Separate route group:** `src/app/(dashboard)/chat/layout.tsx` mounts `components/chat/Sidebar` — a second, independent dashboard-style surface NOT using DashboardShell.

**Every TalkingHead/avatar mount (grep `TalkingHead|AriaFloatingButton|VRM|GLB` — full result):**

| # | Mount | Where it shows | Guard |
|---|---|---|---|
| 1 | `app/dashboard/ask-aria/page.tsx:1012` | left-panel glass ring | the ONE intended avatar |
| 2 | `app/dashboard/ask-aria/page.tsx:1500` | fixed bottom-right float (`.aria-avatar-float`) | hidden ≥1024px via CSS (FIX-3); **still rendered in DOM on desktop** |
| 3 | `components/AriaFloatingPanel.tsx:205` (via AriaFloatingButton, root layout) | floating panel anywhere in product | EXCLUDED list incl. ask-aria |
| 4 | `components/TalkToAria.tsx:237` (via marketing `scene-data.tsx:47` scene 15) | public landing page only | n/a |
| — | `app/api/aria/avatar/route.ts:3` | serves the GLB asset (met4citizen brunette.glb) | not a mount |

**No fourth product-surface mount found** beyond the known three (+1 landing). ✓

API endpoints per page were not exhaustively traced (60+ pages); ask-aria page calls: `/api/aria/vitals` (:541), `/api/aria/ask`, `/api/aria/intelligence/schedules` (:403), deliverable endpoints.

---

## 5. Duplicate / dead code / broken links

**Duplicate basenames (full `find` result, deduped):**

| Basename | Path A | Path B | Verdict |
|---|---|---|---|
| BlockRenderer.tsx | components/**dashboard**/ (ask-aria + AriaBriefingCard) | components/**aria**/ (pos/ask page) | ACTIVE DIVERGENCE RISK (HIGH for block features) |
| Sidebar.tsx | components/**dashboard**/ (DashboardShell) | components/**chat**/ (`app/(dashboard)/chat/layout.tsx`) | both live, different surfaces |
| council.ts | lib/**aria**/council.ts (ask-aria council) | lib/**agents**/council.ts (cron council-session) | two council engines |
| gemini.ts | lib/aria/providers/gemini.ts | lib/gemini.ts | two Gemini clients |
| rate-limit.ts | lib/rate-limit.ts | lib/aria/rate-limit.ts | two limiters |
| retry.ts | lib/api/retry.ts (withCronRetry) | lib/reliability/retry.ts | two retry libs |
| ThemeProvider.tsx | components/ | components/pos/ | dashboard vs POS theming |
| ProductImage.tsx | components/pos/ | components/terminal/ | POS vs terminal |
| DeliveryAlertWidget.tsx | components/dashboard/ | components/warehouse/ | two delivery widgets |
| types.ts / index.ts / queries.ts / registry.ts / orchestrator.ts / business-data.ts / market-prices.ts / escpos.ts / audit.ts / browser.ts / web.ts | various | various | common-name collisions, not audited individually |

**Broken dashboard links:** all `/dashboard/<segment>` targets found in Link href / router.push (21 distinct: ask-aria, staff, warehouse, community, integrations, website-chat, social, settings, billing, autopilot, reorder, reels, import-data, customers, winback, variance, stocktake, share, profit-leaks, inventory, cash-up) **all exist** in `src/app/dashboard/`. `/dashboard/actions` no longer referenced (FIX-2 ✓). **No broken links found.**

**Unscheduled cron routes (dead-or-manual):** the 8 listed in §2.

**Unused imports in route.ts / briefing / deliverable files:** not verifiable by grep alone without a lint run; no obviously-dead imports spotted during reads (the two removed in FIX-2/GROUND-1 are comment-documented at route.ts:16-17). LOW priority.

**DEPRECATED/commented-out blocks:** none found in the files read (route.ts uses comment markers for removed imports only).

---

## 6. TODO/FIXME backlog

Full grep (`TODO|FIXME|XXX:|HACK|HOTFIX|TEMPORARY`, src/, case-sensitive + spot-checked case-insensitive):

| File:line | Text | Real backlog? |
|---|---|---|
| `components/terminal/LivePulseRail.tsx:45` | `// TODO: hot product needs pos_sales join (pos_sale_items has no business_id column) — fix in follow-up` | YES — but the premise is now FALSE: `pos_sale_items.business_id` exists in generated types (:15655+). Stale comment, feature still unbuilt. |
| `lib/aria-response-quality.ts:15` | regex testing for `[TODO]` placeholder in AI output | not backlog (detector) |
| `app/api/project/generate/route.ts:28` | "no placeholders, no TODOs" | prompt text, not backlog |
| `app/api/builder/route.ts:23` | "no TODOs" | prompt text, not backlog |

**One genuine TODO in the entire src tree.** Remarkably clean.

---

## 7. Known-bug verification

| Bug | Status | Evidence |
|---|---|---|
| ARTIFACT_INSTRUCTIONS injection removed from route.ts (FIX-2) | **VERIFIED FIXED** | route.ts:17 is now a comment (`// ARTIFACT_INSTRUCTIONS removed…`); no `${ARTIFACT_INSTRUCTIONS}` in prompt (grep). Export still in lib/aria-system-prompt.ts:12 (unused by ask). |
| Two "2 paragraphs narrative" rules after PROMPT-TIGHTEN-1 | **STILL PRESENT — BY DESIGN** | line 1067 ("non-negotiable") and 1153 ("even for simple queries") both intact; BREVITY (~1156) + GROUNDING (~1184) blocks suspend them conditionally. Append-only per RULE 0. The 1153 wording directly contradicts the BREVITY block two lines below it — model must resolve the conflict itself (MED risk). |
| pos_sale_items.line_total used where pos_sales.total_amount should be | **NO VIOLATION FOUND** | line_total only used for per-product aggregation (its canonical purpose, RULE 6): get-business-context:113-121, business-context:119-124, generate-briefings movers. Revenue totals all come from pos_sales.total_amount. |
| Every pos_sales read filters voided | **PARTIAL** | 138 reads / 60 files. All audited revenue paths filter ✓ (signal-engine 11/11, flash-revenue 8/8, parallel-tasks 4/4, inventory-financing 4/4, deliverables, contexts, facts-packet, briefing crons). `lib/pos/return-engine.ts` has 5 reads / 4 filter-hits — line 82 fetches a single sale WITH its status column for refund logic (legit), remaining unverified read is line 344/360 count queries — **NEEDS-CLOSER-READ** (LOW: returns flow, not revenue reporting). pos_sale_items movers lack the voided JOIN in 2 crons (§3 flag 5). |
| aria-sw.js caching | **CONFIRMED CAUSE** | does NOT cache `/api/*` (line 17) but IS cache-first for all other same-origin GETs (lines 26-33) including Next RSC payload fetches → stale client-side navigations until hard refresh. Cache name `aria-os-v1` never versioned per deploy. |
| /dashboard/actions vs /dashboard/autopilot | **VERIFIED FIXED** | zero references to /dashboard/actions remain; 3 references to /dashboard/autopilot. |
| Briefing cron "this week" date math | **QUOTED** | daily-briefing-submit:83 `const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString()` → prompt:141 labels it "Week so far". Rolling window, calendar label. See §3. |
| Second AriaTalkingHead at ask-aria page (was :1494, now :1500) | **PARTIAL (as designed by FIX-3)** | still in the JSX, hidden via `@media (min-width:1024px){.aria-avatar-float{display:none!important}}`. Still mounted/rendered into DOM on desktop (Three.js/VRM may still initialise — wasted GPU/CPU on every desktop ask-aria visit; `avatarMounted` gate may mitigate — **NEEDS-RUNTIME-VERIFY**). Visible on mobile by design (glass-ring avatar hidden there). |

---

## 8. Migration drift

`supabase/migrations/` contains **110 files**, dating 2026-04-24 → 2026-06-12. Names are self-describing (one-line summaries below for the most recent 25; the full list is `ls supabase/migrations/`). Whether each ran on live DB is **NEEDS-DB-VERIFY** (founder via Supabase API / `select * from supabase_migrations.schema_migrations`).

Recent 25: `20260603000005_waste_elimination`, `…06_supplier_negotiation`, `…07_bas_compliance`, `…08_reputation_defence`, `…09_reconciliation`, `…10_customer_acquisition`, `…11_inventory_financing`, `20260604000001_aria_influencer`, `…02_reels_addon`, `…03_social_reels_stories`, `…04_influencer_usage`, `…05_reels_billing`, `…06_reel_studio_editor`, `…07_reputation_aspect_scores`, `…08_cashflow_bas_column`, `…09_supplier_lead_time`, `…10_seo_tables`, `20260605000001_reel_v2v_jobs`, `…02_reel_publish_jobs`, `…03_pos_rosters_invoices`, `…04_aria_business_memory`, `20260611000001_wiring_health_checks`, `20260611_cx1_community_member_account_link`, `20260611_lrn1_outcome_columns`, `20260612000001_s22_winback_sequences`.

Naming inconsistency note: two formats coexist (`YYYYMMDDNNNNNN_name` vs `YYYYMMDD_tag_name` — e.g. `20260611_cx1_…`); mixed formats can affect migration ordering tools (LOW).

Two duplicate-purpose names worth a DB check: `20260507000002_receipt_templates.sql` AND `20260510000002_receipt_templates.sql`; `20260506000002_pos_gift_cards.sql`, `20260507000001_gift_cards_fix.sql`, `20260510000001_fix_gift_cards.sql` (3 gift-card passes).

---

## 9. Recommended next sprints (priority order)

1. **TZ-1 — Business-timezone day boundaries.** Introduce a single `dayBoundsFor(businessId)` helper using `businesses.timezone` (already selected, never used) and adopt it in vitals, business-context, aria-tools 'today', and both briefing crons. → Finding #1.
2. **WEEK-1 — One canonical week definition.** Define `thisWeek` (calendar Mon→now, business TZ) and `rolling7d` as named helpers; fix the "Week so far" label in daily-briefing-submit:141 to match whichever window it uses. → Finding #3.
3. **SWLM-1 — Calendar-aligned "same week last month".** Replace the 28-day assumption in facts-packet + get-business-context with weekday-aligned-but-month-aware windows (or relabel as "4 weeks ago" so Aria stops calling it "last month"). → Finding #2.
4. **SW-1 — Service-worker network-first for RSC.** In aria-sw.js, route `?_rsc=`/non-asset GETs network-first (or version the cache per deploy). Kills the hard-refresh class. → Finding #4.
5. **BRIEF-1 — Briefing single source of truth.** Pick ONE briefing table; make `api/aria/briefing` and `api/aria/daily-briefing` read the same one; decide generate-briefings' fate (delete or schedule); add the voided-join to both crons' pos_sale_items reads. → Findings #6, #7, #10.
6. **BLOCK-1 — Merge the two BlockRenderers.** Single component (or shared core) consumed by dashboard, briefing card, and pos/ask. → Finding #8.
7. **CRON-1 — Cron reconciliation.** Confirm the Vercel plan cron limit vs 54; delete or schedule the 8 orphan cron folders; add a cron_logs success-rate dashboard panel. → Findings #5, #6.
8. **CUST-1 — One "top customers" definition.** Deliverable pipeline's 30-day computed spend vs stored lifetime total_spent: pick per-question windows explicitly and label them in output. → §3 flag 3.
9. **PROMPT-CLEAN-1 — Resolve the 1153 contradiction.** Reword the "even for simple queries" bullet to "unless BREVITY (below) fires" — one-line append-compatible edit clearing the internal conflict. → §7 row 2.
10. **AVATAR-PERF-1 — Unmount (not just hide) the desktop float avatar.** Replace the CSS hide with a `useMediaQuery`-style conditional render so Three.js never initialises a hidden canvas on desktop ask-aria. → §7 row 8.

---

*Audit completed 2026-06-12. Read-only — no code changed. All file:line references current as of commit `fd7d1e8d`.*

---
---

# AUDIT-1-COMPLETE — Sections 3 + 9 (expanded, authoritative)

> Appended 2026-06-12 per AUDIT-1-COMPLETE. Supersedes the compact §3/§9 above where they conflict.
> New evidence found during this pass: `src/lib/date-au.ts` (a full AEST date library, near-unused) and
> `src/lib/aria/council.ts:742-745` (a calendar-Monday week definition that diverges from everything else).
> One CORRECTION to AUDIT-1: top-customers is NOT computed two ways — see Metric 4.

## Section 3 (expanded) — Data source divergence map

**Headline discovery:** `src/lib/date-au.ts` already implements everything TZ/WEEK sprints need — `nowAEST()`, `startOfDayAEST()`, `startOfWeekAEST()` (Monday start), `buildDateRange('today'|'week'|'last_week'|'month'…)` — and is imported by exactly **two** files: `app/api/pos/dead-stock/route.ts:7` and `app/api/pos/reports/[type]/route.ts:7`. Every AI-brain path uses ad-hoc server-TZ (UTC on Vercel) date math instead.

### Metric 1 — Today's revenue

| File:line | Function/agent | Table | Filters | Column | Window definition (literal) |
|---|---|---|---|---|---|
| `app/api/aria/vitals/route.ts:22-30` | GET (ask-aria KPI row) | pos_sales | `neq('status','voided')` | sum total_amount | `const todayStart = new Date(); todayStart.setHours(0,0,0,0)` → **server/UTC midnight** |
| `lib/aria/ask/business-context.ts:85,105` | buildAskAriaContext (main brain) | pos_sales | neq voided | sum total_amount | `todayStart.setHours(0,0,0,0)` — UTC midnight |
| `lib/aria-tools.ts:411` | getPeriodStart('today') → query_sales / get_summary | pos_sales | voided via callers + SQL-GUARD-1 | sum total_amount | `case 'today': { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }` — UTC midnight |
| `lib/aria/ask/files.ts:129` | periodToDate('today') (exports) | pos_sales | (export path) | rows | same UTC midnight |
| `lib/aria/live-monitor.ts:50-54` | todayStart() (live monitor) | pos_sales | — | sum | same UTC midnight |
| `app/api/aria/live-intelligence/route.ts:76` | live intelligence | pos_sales | — | sum | same UTC midnight |
| `app/api/pos/dashboard/route.ts:25`, `app/api/pos/daily-summary/route.ts:34`, `app/api/pos/revenue-comparison/route.ts:34-35` | POS surfaces | pos_sales | neq voided | sum total_amount | `setHours(0,0,0,0)` / `(23,59,59,999)` — UTC day |
| `app/api/aria/pos-chat/route.ts:117`, `lib/agents/council.ts:327`, `lib/agents/flash-revenue-agent.ts:561`, `lib/agents/labour-optimisation-agent.ts:474`, `lib/agents/waste-elimination-agent.ts:357,420` | agent crons | pos_sales | neq voided (verified §7) | sum total_amount | UTC midnight each |
| `app/api/pos/reports/[type]/route.ts:7` (via `lib/date-au.ts:39-40`) | POS reports 'today' | pos_sales | — | sum | `startOfDayAEST(now)` — **AEST midnight** |

**DIVERGENCE VERDICT: Diverges — HIGH.** 13+ paths agree on server/UTC midnight (≈10–11am AEST), but POS Reports uses true AEST midnight via date-au. The POS report for "today" and the ask-aria/vitals "today" cover windows offset by 10–11 hours; before ~10am AEST the UTC paths still include most of *yesterday evening's* AEST trade. `businesses.timezone` is selected (daily-briefing-submit:118) and never used anywhere.

### Metric 2 — This week's revenue

| File:line | Function/agent | Table | Filters | Column | "This week" definition (literal) |
|---|---|---|---|---|---|
| `lib/aria/ask/business-context.ts:86,106` | main brain ctx (`revenue_week_cents`) | pos_sales | neq voided | sum total_amount | `const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7)` — **rolling 7 days, anchored to request time-of-day** |
| `lib/aria/get-business-context.ts:11,44-45` | council/business ctx (`rev7`) | pos_sales | neq voided | sum total_amount | `const d7 = new Date(now.getTime() - 7*86400000).toISOString()` — rolling 7d |
| `lib/aria/ask/facts-packet.ts:80-93,134` | facts packet ('last 7 days' label) | pos_sales | neq voided | sum total_amount | `new Date(now - 7 * dayMs)` — rolling 7d, honestly labelled |
| `app/api/cron/daily-briefing-submit/route.ts:83,87,101` | morning briefing ("Week so far") | pos_sales | neq voided | sum total_amount | `const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString()` → prompt line 141: `Week so far: A$${ctx.weekRevenue}` — **rolling 7d labelled as calendar week-to-date** |
| `lib/aria/deliverables.ts:354-359` | fetchDashboardData (rev7) | pos_sales | neq voided | sum total_amount | `new Date(Date.now() - 7*86400000)` — rolling 7d |
| `lib/aria-tools.ts:412` | getPeriodStart('7d') | pos_sales | guarded | sum | rolling 7d |
| `lib/aria/ask/files.ts:130` | periodToDate('week') | pos_sales | export path | rows | `now - 7*86400_000` — rolling 7d |
| `lib/aria/council.ts:742-745` | runAriaCouncil → Gemini context-brain ("Week starting: …") | (context label; feeds `runContextBrain(bi, weekStart, …)` `lib/aria/context-brain.ts:49,60`) | — | — | `weekStart.setDate(now.getDate() - ((now.getDay()+6)%7)); weekStart.setHours(0,0,0,0)` — **calendar Monday, server/UTC TZ** |
| `lib/agents/clv-agent.ts:600`, `lib/agents/schedule-agent.ts:90` | CLV / schedule agents | pos_sales / rosters | per agent | per agent | `weekStart.setHours(0,0,0,0)` + Monday arithmetic — calendar week, server TZ |
| `app/api/pos/reports/[type]/route.ts` (via `lib/date-au.ts:15-22,49-50`) | POS reports 'week' | pos_sales | — | sum | `startOfWeekAEST()` — **calendar Monday, AEST** |

**DIVERGENCE VERDICT: Diverges THREE ways — HIGH.** (a) rolling-7-days (all main AI revenue paths), (b) calendar-Monday server-TZ (council's Gemini context + clv/schedule agents), (c) calendar-Monday AEST (POS reports). The same "how's this week?" question can produce three different windows depending on surface; and the briefing prompt mislabels (a) as week-to-date. This is the most likely mechanism behind the founder's "$722.50 vs $7" class of complaints when combined with Metric 1's UTC offset.

### Metric 3 — Same week last month (the $4,419 / $4,442 / $4,553 comparator)

Implementation A — `src/lib/aria/ask/facts-packet.ts:66-79` (verbatim):
```ts
case 'same_week_last_month':
  return {
    current:    { start: new Date(now - 7 * dayMs).toISOString(),  end: new Date(now).toISOString(),              label: 'last 7 days' },
    comparison: { start: new Date(now - 35 * dayMs).toISOString(), end: new Date(now - 28 * dayMs).toISOString(), label: 'same week last month (d-35 to d-28)' },
    same_length: true,
  }
```

Implementation B — `src/lib/aria/get-business-context.ts:21-23` + query `:100-103` (verbatim):
```ts
// "Same week last month" = the 7-day window ending 28 days ago (4 weeks back)
const d28 = new Date(now.getTime() - 28 * 86400000).toISOString()
const d35 = new Date(now.getTime() - 35 * 86400000).toISOString()
…
db.from('pos_sales').select('total_amount')
  .eq('business_id', businessId)
  .gte('created_at', d35).lt('created_at', d28).neq('status', 'voided'),
```

Implementation C — `src/app/api/cron/generate-briefings/route.ts:85-86,104-107` (unscheduled cron, used as "28-35 day baseline for daily average"): same `now − 35d → now − 28d` window.

| File:line | Window | Same as others? |
|---|---|---|
| facts-packet.ts:66-79 | `[now−35d, now−28d)` rolling, ms-precision anchored to request time | — |
| get-business-context.ts:21-23,100-103 | `[now−35d, now−28d)` rolling | **identical formula** ✓ |
| generate-briefings:85-86 | `[now−35d, now−28d]` (lte upper bound — 1ms overlap difference) | effectively identical |

**DIVERGENCE VERDICT: Consistent with each other — all three use d-35→d-28 — but ALL embed the same 28-day-month assumption (HIGH vs ground truth).** Weekday-aligned (28=4×7 ✓) but lands 2 days early vs the same calendar dates last month for 30-day months, 3 days for 31-day months. Also: windows are anchored to request *time-of-day*, so the comparator drifts within a day (a 9am query and a 5pm query compare different 168-hour windows — consistent with the founder seeing $4,419 / $4,442 / $4,553 for "the same" comparator on different occasions). Contrast: the `last_month` case in the SAME file (facts-packet.ts:36-64) IS calendar-aligned — Aria is calendar-correct for "vs last month" and 28-day-rolling for "same week last month".

### Metric 4 — Top customers by spend ⚠️ CORRECTION to AUDIT-1

| File:line | Function/agent | Table | Filters | Column | Window |
|---|---|---|---|---|---|
| `lib/aria-tools.ts:670-674` | query_business_data entity=customers | pos_customers | gt guard via SQL-GUARD-1 fallback | **stored `total_spent`** (defaultOrder) | lifetime |
| `lib/aria/ask/business-context.ts:126-130` | main brain ctx (`top_customers_alltime`) | pos_customers | — | stored `total_spent` desc | lifetime (honestly named) |
| `lib/aria/deliverables.ts:107-123` | fetchRankedData subject='customers' | pos_customers | `gt(spendCol, 0)` | **stored `CANONICAL_COLS.CUSTOMER_SPEND` (total_spent)** desc | lifetime — `timeframe_days` intent field is **IGNORED** for this subject |

**DIVERGENCE VERDICT: Consistent — all three read stored lifetime `pos_customers.total_spent`.** AUDIT-1 §3 flag 3 claimed the deliverable pipeline computes 30-day spend — that was WRONG; verified by reading deliverables.ts:107-123. The real (smaller, MED) issue: the deliverable intent classifier extracts `timeframe_days` (default 30, e.g. "top customers this week" → 7) but the customers branch ignores it and returns lifetime figures under a time-scoped title. Residual risk: `total_spent` is a denormalised stored column — whether it is kept in sync with pos_sales is **NEEDS-DB-VERIFY**.

### Metric 5 — Orders today

| File:line | Function/agent | Source | Filters | Counted as | Window |
|---|---|---|---|---|---|
| `app/api/aria/vitals/route.ts:33` | ask-aria KPI (`tx_count_today`) | pos_sales rows | neq voided | `(sales ?? []).length` | UTC midnight → now |
| `lib/aria/ask/business-context.ts` (today rows length) | main brain ctx | pos_sales rows | neq voided | length | UTC midnight |
| `app/api/pos/daily-summary/route.ts:34+`, `app/api/pos/dashboard/route.ts:25+` | POS surfaces | pos_sales | neq voided | count | UTC day |
| `lib/aria-tools.ts` get_summary / query_sales 'today' | tools | pos_sales | guarded | count | UTC midnight |

**DIVERGENCE VERDICT: Consistent definition (rows-after-UTC-midnight, voided excluded) — but inherits Metric 1's UTC-vs-AEST offset wholesale (HIGH only via TZ).**

### Metric 6 — Orders this week

| File:line | Function/agent | Source | Window |
|---|---|---|---|
| `lib/aria/deliverables.ts:354-359` | fetchDashboardData (`txn7Data.length`) | pos_sales rows, neq voided | rolling 7d |
| `lib/aria/ask/business-context.ts:106` | week rows length | pos_sales, neq voided | rolling 7d (time-of-day anchored) |
| `app/api/cron/daily-briefing-submit:87,100` | `yesterdayTransactions` + week revenue rows | pos_sales, neq voided | rolling 7d |
| council Gemini context (via council.ts:745) | — | — | calendar Monday server-TZ |

**DIVERGENCE VERDICT: Diverges — same 3-way split as Metric 2 (rolling-7d vs calendar-Mon). HIGH (inherited).**

### Metric 7 — Avg basket today

| File:line | Function/agent | Formula | Window |
|---|---|---|---|
| ask-aria KPI row (from `/api/aria/vitals` fields) | page-side `revenue_today / tx_count_today` | today's sum ÷ today's count | UTC today |
| `lib/aria/deliverables.ts` fetchDashboardData | `avg ticket` = rev7 ÷ txn7 | 7-day | rolling 7d |
| `lib/aria/context.ts:92` | council ctx `avg_ticket_last_28d` | 28-day avg | rolling 28d |
| `lib/aria-tools.ts` get_summary 'today' | sum ÷ count from same query | UTC today |
| `lib/aria/deliverables.ts:52,400` | single_answer avg_ticket intent | timeframe_days (default 7 per example) | rolling 7d |

**DIVERGENCE VERDICT: Diverges — HIGH for cross-surface trust.** Three windows (today / 7d / 28d) all surface to the owner as "average ticket/basket" depending on which surface answers. Each is internally correct; none label the window consistently.

### Cross-metric summary

| Theme | Verdict |
|---|---|
| Column choice | Consistent ✓ — pos_sales.total_amount everywhere; line_total only for per-product splits |
| Voided filter | Consistent ✓ on revenue paths (138 reads sampled §7); 2 briefing crons' pos_sale_items movers lack the join (MED) |
| Day boundary | **UTC everywhere except date-au-based POS reports (AEST)** — systemic, HIGH |
| Week definition | **3-way split: rolling-7d / calendar-Mon-UTC / calendar-Mon-AEST** — HIGH |
| "Last month" week | 28-day assumption ×3 implementations (mutually consistent, calendar-wrong) — HIGH |
| Window anchoring | rolling windows anchored to request time-of-day → same-day answer drift — MED |
| Top customers | Consistent ✓ (AUDIT-1 corrected); timeframe ignored in deliverable ranking — MED |

## Section 9 (expanded) — Recommended next sprints

1. **TZ-1 — Business-timezone day boundaries**
   - **Scope:** Create `lib/aria/time.ts` wrapping the existing `lib/date-au.ts` (already AEST-correct, near-unused) with a `businesses.timezone`-aware `dayBounds(businessId)`, and adopt it in the today/yesterday paths: vitals, business-context, aria-tools getPeriodStart, daily-briefing-submit, live-monitor.
   - **Addresses:** Finding #1 (and the TZ half of #3).
   - **Touches:** `lib/date-au.ts`, `lib/aria/ask/business-context.ts`, `app/api/aria/vitals/route.ts`, `lib/aria-tools.ts`, `app/api/cron/daily-briefing-submit/route.ts`, `lib/aria/live-monitor.ts`.
   - **Dependencies:** none. **Risk:** MED (every "today" number shifts once — founder should expect a one-time step-change).

2. **WEEK-1 — One canonical week definition**
   - **Scope:** Add `thisWeek()` (calendar Mon→now, business TZ — `startOfWeekAEST` already exists) and `rolling7d()` named helpers; route every Metric-2 row through one of them and fix the "Week so far" label (daily-briefing-submit:141) to match its window.
   - **Addresses:** Finding #3 + the council.ts:745 / clv / schedule calendar-Mon split discovered in this pass.
   - **Touches:** `lib/date-au.ts`, `lib/aria/ask/business-context.ts`, `lib/aria/get-business-context.ts`, `lib/aria/council.ts`, `app/api/cron/daily-briefing-submit/route.ts`.
   - **Dependencies:** requires TZ-1 first. **Risk:** MED.

3. **SWLM-1 — Calendar-aligned "same week last month"**
   - **Scope:** Replace the d-35→d-28 windows (facts-packet:66-79, get-business-context:21-23) with day-boundary-aligned windows (midnight-to-midnight, business TZ) and either month-aware alignment or an honest "4 weeks ago (d-35→d-28)" label in every prompt that cites it; also fixes the same-day drift (time-of-day anchoring).
   - **Addresses:** Finding #2 (+$4,419/$4,442/$4,553 drift explanation).
   - **Touches:** `lib/aria/ask/facts-packet.ts`, `lib/aria/get-business-context.ts`, `lib/aria/council.ts` (label strings).
   - **Dependencies:** requires TZ-1 first. **Risk:** LOW (two formulas + labels).

4. **SW-1 — Service-worker versioning + RSC cache fix**
   - **Scope:** In `public/aria-sw.js` make non-navigate same-origin GETs network-first (or bypass `?_rsc=` requests entirely) and version the cache name per deploy so old caches purge on activate.
   - **Addresses:** Finding #4 (founder hard-refresh).
   - **Touches:** `public/aria-sw.js`, `components/PWARegister.tsx`.
   - **Dependencies:** none. **Risk:** LOW (worst case = no offline shell).

5. **BRIEF-1 — Briefing single source of truth**
   - **Scope:** Pick ONE briefing table (`aria_daily_briefings` — already written by the live poll cron); point `api/aria/daily-briefing` (currently reads `daily_briefings`) and `api/aria/briefing` at it; decide generate-briefings' fate (delete or schedule); add the voided join to both crons' `pos_sale_items` movers.
   - **Addresses:** Findings #6, #7, #10.
   - **Touches:** `app/api/aria/daily-briefing/route.ts`, `app/api/aria/briefing/route.ts`, `app/api/cron/generate-briefings/route.ts`, `app/api/cron/daily-briefing-submit/route.ts`.
   - **Dependencies:** none (TZ-1 improves its numbers but isn't required). **Risk:** MED (UI reads must keep their shape).

6. **CRON-1 — Cron reconciliation**
   - **Scope:** Verify the Vercel plan cron limit against the 54 scheduled; schedule-or-delete the 8 orphan cron folders (`clv-*`, `flash-*`, `generate-briefings`, `memory-consolidate`, `reviews-weekly-digest`, `run-scheduled-reorders`); document the survivors in vercel.json comments-by-README.
   - **Addresses:** Findings #5, #6.
   - **Touches:** `vercel.json`, up to 8 folders under `src/app/api/cron/`.
   - **Dependencies:** BRIEF-1 should decide generate-briefings first. **Risk:** LOW-MED (deleting a manually-relied-on cron).

7. **TOPCUST-1 — Honest time-scoping for top-customers (rescoped after correction)**
   - **Scope:** All three paths already agree on lifetime `total_spent` (✓); make the deliverable ranking honour `timeframe_days` (compute from pos_sales when a window is requested) or retitle the output "all-time"; add a DB check that `pos_customers.total_spent` stays in sync with pos_sales.
   - **Addresses:** Finding (Metric 4 residual) — replaces AUDIT-1's incorrect flag 3.
   - **Touches:** `lib/aria/deliverables.ts` (customers branch), report verification SQL.
   - **Dependencies:** none. **Risk:** LOW.

8. **AVGBASKET-1 — Window-labelled average ticket**
   - **Scope:** Make every avg-ticket/basket surface state its window ("today", "7-day", "28-day") in the rendered label, and align the ask-aria KPI card + deliverable single_answer + council ctx on one default window.
   - **Addresses:** Metric 7 divergence (this pass).
   - **Touches:** `app/dashboard/ask-aria/page.tsx` (KPI label), `lib/aria/deliverables.ts`, `lib/aria/context.ts`.
   - **Dependencies:** TZ-1 for the "today" variant. **Risk:** LOW.

9. **PROMPT-CLEAN-1 — Resolve the 2-paragraphs/BREVITY contradiction**
   - **Scope:** One-line reword of route.ts:1153 ("even for simple queries" → "unless BREVITY (below) fires") so the prompt no longer contradicts itself two lines above the BREVITY block.
   - **Addresses:** §7 row 2 (MED model-confusion risk).
   - **Touches:** `src/app/api/aria/ask/route.ts` (1 line).
   - **Dependencies:** none. **Risk:** LOW.

10. **AVATAR-PERF-1 — Unmount the hidden desktop float avatar**
    - **Scope:** Replace the FIX-3 CSS hide of `.aria-avatar-float` with a matchMedia-conditional render so the second Three.js/VRM canvas never initialises on desktop ask-aria.
    - **Addresses:** §7 row 8 (wasted GPU on every desktop visit).
    - **Touches:** `app/dashboard/ask-aria/page.tsx`.
    - **Dependencies:** none. **Risk:** LOW (mobile behaviour unchanged).

11. **BLOCK-1 — Merge the two BlockRenderers**
    - **Scope:** Single shared block-rendering core consumed by `components/dashboard/BlockRenderer` users (ask-aria, AriaBriefingCard) and `components/aria/BlockRenderer` user (pos/ask), so new AskBlock types render everywhere.
    - **Addresses:** Finding #8.
    - **Touches:** `components/dashboard/BlockRenderer.tsx`, `components/aria/BlockRenderer.tsx`, 3 consumer files.
    - **Dependencies:** none. **Risk:** MED (visual regression surface ×2 pages).

12. **SYNC-CHECK-1 — Denormalised column drift audit (data hygiene)**
    - **Scope:** One verification script comparing stored aggregates (`pos_customers.total_spent`, `visit_count`) against recomputed pos_sales sums per business; report-only, feeds TOPCUST-1.
    - **Addresses:** Metric 4 NEEDS-DB-VERIFY.
    - **Touches:** one new script/route + report.
    - **Dependencies:** none. **Risk:** LOW (read-only).

**Priority rationale:** TZ-1 → WEEK-1 → SWLM-1 form a dependency chain that together eliminates every HIGH time-window divergence (findings #1-#3); SW-1 is independent and kills the founder-visible staleness bug; BRIEF-1/CRON-1 clean the briefing/cron sprawl that generates wrong numbers nightly; the rest are LOW-risk single-file cleanups.

---

*AUDIT-1-COMPLETE appended 2026-06-12. Read-only — no source code changed. References current as of commit `276984bd`.*
