# ARIA-AUDIT-SWEEP-1 — Read-only reclassification of the open roadmap

Read-only sprint. No code changes, no commits, no migrations. Classifies real code-path + live-DB
state before ~120 sprints run against a roadmap that has repeatedly turned out to already be built.

**56 named roadmap items classified this sprint** (AG-W0..4, RESP-1..6/Batch-5 remainder, Tier-11
QQ..NN, DCC-1..16, TCA-1..8, CS-1..9), plus 7 supplementary findings from an earlier ad-hoc customer-
surface pass. The source document for DCC-1..16 and TCA-1..8 (`ARIA-MASTER-ROADMAP.md`) was missing
from the repo at sprint start — never once committed to git, on any branch — and was supplied
directly by the founder mid-sprint; this report reflects the completed pass against that doc.

---

## Headline result

| Class | Count |
|---|---|
| BUILT+WIRED | 15 |
| BUILT-COLD (built, never activated/used) | 3 |
| PARTIAL | 19 |
| UNBUILT | 15 |
| SUPERSEDED (solved a different way already) | 3 |
| UNKNOWN (naming drift, needs author clarification) | 1 |
| **Total** | **56** |

**18 of 56 need zero or near-zero new code** (15 BUILT+WIRED + 3 SUPERSEDED already achieve the
goal). **19 are PARTIAL** — most of the intelligence/UI already exists, real deltas are usually
small (a missing column, a missing UI panel over an existing API, an orchestration layer over
already-built pieces). Only **15 are genuinely UNBUILT** from scratch.

---

## ⚠️ AG-W0/W1/W2 — urgent, live finding (not just an audit line)

A public chat widget is **live right now** — one `widget_configs` row, `enabled=true`, Sip Café,
since 2026-04-29 (`business_id ff5055a0-c351-4ada-817a-1804961035f3`). The endpoint it calls
(`src/app/api/public/widget/chat/route.ts`) does **not** load margins/costs/bulk customer data — but:

1. **Live PII leak**: `recognise_members=true` on the live config (`route.ts:132-157`). Any
   anonymous visitor can type *any* email or phone number into the chat and get back that person's
   name, loyalty points, tier, and perks — no check the requester owns that identifier. This works
   against real Sip Café customer data today.
2. **Origin check is a no-op**: `allowed_domain=null` on the live config, so the domain-allowlist
   code (`route.ts:53-59`) never fires — the `chat_token` (visible in the public embed JS) works
   from any origin.
3. **Zombie duplicate endpoint**: a second, older widget-chat implementation
   (`src/app/api/widget/chat/route.ts`) is still deployed and reachable — wide-open CORS
   (`Access-Control-Allow-Origin: '*'`), raw `x-widget-key` header auth, and its data-fetch function
   (`buildWebsiteAssistantContext`, `src/lib/aria/website-assistant-data.ts:31`) queries
   **non-existent `pos_products` columns** (`price_cents`, `current_stock` instead of the real
   `price`/`stock_quantity`) — so it's likely silently broken as well as superseded. The live embed
   script (`src/app/api/public/widget/embed/[api_key]/route.ts:189`) only ever calls the newer
   `/api/public/widget/chat` — this one is dead code that's still a live attack surface.

**This exact audit was already planned and not yet run.** `ARIA-MASTER-ROADMAP.md` specifies "AG-W0
WIDGET-LIABILITY-AUDIT (READ-ONLY, do FIRST)... does it load OWNER context or PUBLIC-only data?
Grounded or free-generating? Logged? Rate-limited? Report SAFE/GAP/UNKNOWN" — and a follow-on gate
"AG-W-PERSONA (WIDGET-PERSONA-1 — HARD GATE before any public embed)" for exactly the
Customer-Aria-vs-Owner-Aria data-wall this finding is about. This section **is** that audit,
arriving independently at the same concern the roadmap itself flagged as the founder's "#1 concern."
The roadmap doc shows no "DONE" marker for AG-W0 or AG-W-PERSONA anywhere — matches this session's
live finding that the leak is real and unfixed today.

---

## AG-W1..W4

| ID | Class | Evidence | Delta |
|---|---|---|---|
| AG-W1 (public endpoint) | **SUPERSEDED (structural duplicate risk)** | `src/app/api/public/widget/chat/route.ts` is live — but AG-W1's own spec says to create NEW tables `chat_widget_conversations`/`chat_widget_messages`. **Neither exists** (checked live via `information_schema.tables`: only `widget_configs`/`widget_conversations` do). The live widget is a pre-existing, independently-built system on different tables, not "AG-W1 as specced". | If AG-W1 runs per its literal spec, it builds a **second, parallel** public-widget system next to the one already live — the exact "getBid built twice" waste pattern named in the audit brief. Real work = re-point the spec at the existing system + fix its privacy issues above, not build anew. |
| AG-W2 (embeddable widget) | BUILT+WIRED | `src/app/api/public/widget/embed/[api_key]/route.ts`, live | Same existing (non-AG-W1-shaped) system backs it — same duplicate-risk note |
| AG-W3 (WhatsApp agent channel) | UNBUILT — confirmed by the roadmap doc itself | `src/lib/whatsapp.ts` + `src/app/api/loyalty/whatsapp/route.ts` (LOY-WHATSAPP) is a differently-scoped feature: outbound loyalty-template sends only, no inbound-to-AI-reply. Roadmap's own log: "AG-W3 WhatsApp CHANNEL (post-launch reach upgrade, needs Meta)" — genuinely gated on external Meta Business verification (weeks), not a build gap. | Real build (once Meta-gated): inbound WhatsApp → I7-brain reply |
| AG-W4 (SMS agent channel) | UNBUILT — confirmed by the roadmap doc itself | `src/app/api/webhooks/clicksend-inbound/route.ts` is STOP/START compliance-keyword-only (`:56`, any other message ignored, no AI reply). Roadmap's own log: "AG-W4 SMS CHANNEL (optional)... build only if SMS demand is real." | Real build: route non-keyword inbound SMS to the same I7-brain reply path as W3 |

---

## CS-1..9 (exact spec from `ARIA-MASTER-ROADMAP.md`, Addendum "CUSTOMER-FACING SURFACE LAYER")

| ID | Class | Evidence | Delta |
|---|---|---|---|
| CS-1 Link-in-bio homepage | PARTIAL | `src/app/[slug]/page.tsx` + `HubClient.tsx:245-254` — logo/name/bio/products render; `HubLinks` only emits cards for loyalty/booking/community/review/website. No hours, no map/location, no call button, no dedicated Menu/Order card. | Add hours/address/map + call + explicit Menu/Order cards to `HubLinks` — most of the front door already exists |
| CS-2 Digital receipt/order-status | PARTIAL | `src/app/receipt/[sale_id]/page.tsx` (token-gated per SECURITY-P1) shows sale/items/totals/payment status. No loyalty-points-earned line, no "rate us" CTA into CS-3. | Add a points-earned line + a CTA into the (currently unbuilt) CS-3 funnel |
| CS-3 Review/feedback funnel | UNBUILT | No `/feedback/` route anywhere. `google_review_link`/`yelp_url` only feed a single external link in `HubLinks` and an internal review-response agent — no happy/unhappy split funnel. | — |
| CS-4 Gift card purchase page | UNBUILT | `src/app/api/gift-cards/route.ts` requires owner auth (merchant-only issuance) — confirmed no Stripe checkout logic anywhere under `api/gift-cards/*`, no `/gift/[slug]` route. The merchant-issued flow (found in an earlier pass) is a **separate, different** surface from this public self-purchase page. | — |
| CS-5 Online ordering/click-collect | BUILT-COLD (= WIRE-6, roadmap's own reconciliation — not separate work) | `src/app/store/[slug]/page.tsx` posts to `place-order/[business_id]/route.ts:41`, which requires a `cx_session` cookie the storefront never establishes. Live: 0 of 20 total `pos_online_orders` have `source='storefront'`. | Wire the CX sign-in flow into `/store/[slug]` before checkout, or drop the session-gate for guest checkout |
| CS-6 Store credit/house accounts | PARTIAL (POS-side only) | `src/app/api/pos/store-credits/route.ts` — merchant/POS-authed redemption only, idempotent (WIRE-5). Zero matches for store-credit balance/history in `src/app/[slug]/wallet/page.tsx`, the one customer-facing balance surface. | Expose `pos_store_credits` balance/history on a customer account surface — currently invisible to the customer |
| CS-7 Customer account portal | PARTIAL | `src/app/[slug]/account/page.tsx` = profile only; order history/balance/rewards live on separate tabs (`history`, `wallet`, `rewards`) tied together by `CxTabBar.tsx`, not one unified page. Reorder ("usual") exists in `HubClient.tsx:103-156`. Gift-card balance absent from the whole tab set. | LOY-WALLET-1's tab set already covers most of CS-7's vision via composition; still missing gift-card balance integration |
| CS-8 Subscriptions/memberships | UNBUILT | No `/subscribe/` route; the only subscriptions table (`business_subscriptions`) is Aria's own SaaS billing, not a customer-facing product. No PayTo references anywhere. | — |
| CS-9 Catering/large-order request | UNBUILT | No `/catering/` route, no DB table, no related code beyond unrelated dine-in/pickup labels. | — |

**Supplementary findings** (from an earlier ad-hoc pass using the task brief's own hint text before
the precise CS-1..9 spec was available — kept since they're real and don't map 1:1 onto CS-1..9):

| Surface | Class | Evidence |
|---|---|---|
| `/menu/[slug]` (the actual product menu, distinct from CS-1's link-in-bio) | BUILT+WIRED | Sip Café slug `sip-ff5055`, 74 active products, 17 real `pos_online_orders` (`source=web`) since 2026-05-22 |
| `/menu/[slug]` checkout | PARTIAL | Same session-cookie gap as CS-5/WIRE-6 |
| Merchant-issued gift cards (distinct from CS-4's public purchase page) | BUILT-COLD | Full issue/redeem/dashboard-CRUD flow exists; `pos_gift_cards`/`gift_card_transactions`/`gift_card_settings` all 0 rows — never used by a real business |
| CX loyalty hub (`/[slug]/*`) | BUILT+WIRED | The real session-establishing flow; 5 live `cx_sessions`; this is what makes the 17 real `/menu` orders possible |

**Merge candidate**: CS-1 + CS-2's remaining deltas + the `/menu`/`/store` checkout-session fix are
all small, additive UI/wiring changes on already-built pages — plausibly one combined "customer
front-door" commit, matching the ~1 estimate. CS-3/CS-4/CS-8/CS-9 are each genuinely new surfaces,
not mergeable with the above.

---

## BATCH 16 — DASHBOARD COMMAND-CENTRE (DCC-1..16)

Live dashboard entry (`src/app/dashboard/page.tsx`) delegates to `RetailDashboard.tsx` for Sip's
industry, which composes `MorningCommandCentre.tsx` + `PendingActionsCard.tsx` + `AriaBriefingCard`
+ `ProWidgets.tsx`. **Far more of this batch has already landed under other names than the roadmap
implies** — but DCC-1's actual core mechanic (a summed dollar value) is missing at the schema level.

| ID | Class | Evidence | Delta |
|---|---|---|---|
| DCC-1 Today's Money Found hero | UNBUILT | `aria_actions`/`aria_autopilot_actions` schemas (checked live) have **no dollar-value column** at all — nothing to sum. No "$X found today" hero exists anywhere. | Add `estimated_value_cents` + populate at creation, then sum |
| DCC-2 Autopilot Action Inbox | BUILT+WIRED | `MorningCommandCentre.tsx:516-559` ("Today's AI Decisions") + `PendingActionsCard.tsx` — approve/dismiss, risk badge, auto-approve countdown, live against real rows (Sip: 60 pending, 25 executed, 253 auto-rejected) | — |
| DCC-3 Business Health Score | PARTIAL | `MorningCommandCentre.tsx:482-491` — single overall score + explain-on-click; no per-category (sales/stock/staff/cashflow/marketing/reviews) breakdown | Decompose the score server-side into the 6 named buckets |
| DCC-4 What Changed Since Yesterday | PARTIAL | `RetailDashboard.tsx` Live Now (deltas, top sellers) + weather widget; no explicit anomaly surfacing on the dashboard (ANOMALY-1 sources exist only in cron/reconciliation code) | Surface those anomaly sources as dashboard alert cards |
| DCC-5 Competitor Activity cards | BUILT-COLD | `CompetitorWatch` component + `competitor_alerts` table wired into the dashboard — **0 rows for Sip** | Run/schedule whatever agent populates `competitor_alerts` |
| DCC-6 Live Store Pulse strip | PARTIAL | Revenue/txns/avg-basket/low-stock/staff-on all live-wired; no "register open" state or "next rush" prediction | Add those two fields |
| DCC-7 Fridge/Store Map | UNBUILT | No fridge/zone/map component anywhere in the repo | — |
| DCC-8 Profit Leak Radar | PARTIAL | `ProfitLeaks` component + `profit_leaks` table (3 live rows) + `/api/aria/profit-analysis` — a list with a $/mo total, not a heatmap, not broken into the 6 named leak categories | Categorize existing rows + heatmap layout |
| DCC-9 Premium Empty States | PARTIAL | Most empty states already sell the feature (`EmptyState` w/ `linkHref`/`linkLabel` throughout); some plain ones remain (e.g. `CompetitorWatch`'s "No alerts yet") | Audit + fix the remaining plain ones |
| DCC-10 Demo/Sample Store Mode | UNBUILT | Zero matches for `isDemo`/`DEMO_MODE`/`sample_store` anywhere — confirmed genuinely open, matching the roadmap's own "highest value" flag on this item | — |
| DCC-11 "Why This Matters" line | BUILT+WIRED | `MorningCommandCentre.tsx:530-543` — reason + expected-impact/risk-if-ignored on every action card, plus "Ask Why" | — |
| DCC-12 AI Activity Timeline | BUILT+WIRED | `RetailDashboard.tsx` "Activity today" via `/api/aria/activity-narrative`; `activity_log` has 118 live rows for Sip | — |
| DCC-13 Connected Systems value panel | BUILT+WIRED | `dashboard/integrations/page.tsx` — full Square/Shopify/Lightspeed/Kounta/CSV status + Xero sync/preview/history | Value-prop copy thinner than specced, but functionally complete |
| DCC-14 Promo Studio output pack | PARTIAL | Every ingredient exists separately (`quick-promo-suggest`, `tickets/generate`, `reels/ideas`+`captions`, `winback-send`) but no single "one promo → full pack" orchestrator | Build the orchestration layer calling all of the above from one submit |
| DCC-15 POS "Aria Suggests" panel | BUILT-COLD/PARTIAL | Two implementations exist: the terminal actually renders a hardcoded static 3-category card (`AriaInlineCard.tsx`); a far richer real one (`/api/pos/cart-intelligence/route.ts` — age-verify, promo-qualify, margin-floor, real purchase-history upsell) exists but is **never called from the terminal** | Swap the terminal's data source to `cart-intelligence`; loyalty-due signal still missing from both |
| DCC-16 Agent Audit Log | PARTIAL | `dashboard/settings/audit-log/page.tsx` is a generic security log (login/export), not AI-decision-specific. Backend exists (`/api/aria/actions/[id]/outcome`) but no page joins `aria_ai_calls`+`aria_actions`+outcomes | New page joining those three sources — `dashboard/agents/page.tsx` is the closest UI precedent |

`INV-COMMAND-CENTER` (referenced in the roadmap as an existing precedent to reuse): **zero matches
anywhere in the repo** — mis-named or aspirational, not something to actually reuse.

**Merge-group correction**: the roadmap estimated ~5 combined commits for this batch; the actual
count is **8**, because the touched tables/files don't cluster that tightly — (1) DCC-2+11 already
share a file, (2) DCC-1 needs its own migration despite touching the same area, (3) DCC-4+6+13
(live-intelligence + pulse + integrations copy), (4) DCC-5 (cron/backfill only), (5) DCC-3+8 (two
different tables), (6) DCC-15 (isolated terminal-file swap), (7) DCC-16 (new isolated page), (8)
DCC-7/9/10/14 are each large enough (new map feature, systemic empty-states pass, full demo-data
seed, new orchestration pipeline) to warrant their own sprints.

---

## BATCH 26 — TOAST-STYLE CHAT ACTIONS (TCA-1..8)

**Core discovery**: a real, purpose-built chat-action pipeline exists (`src/lib/aria/ask/
action-planner.ts` + `action-executor.ts`, reached from `ask/route.ts`) — separate from the
DCC-2 autopilot-inbox path. It plans an action, stages it as `pending_action`, and only executes on
a later message matching `isConfirmation()`, with a kill-switch, role-gate, and mass-mutation
backstop. **Every write path traced funnels through this one chokepoint — no chat-triggered action
executes without a confirm step, anywhere.** That's the single most important finding in this batch:
the safety design the roadmap called non-negotiable is actually intact.

| ID | Class | Evidence | Delta |
|---|---|---|---|
| TCA-1 Insight→button conversion | PARTIAL | No 6-button insight-card UI found anywhere (the exact button labels are absent repo-wide). `PendingActionsCard.tsx` only renders generic Approve/Dismiss for the separate autopilot-inbox path. | Build the button row calling the existing `action-executor.ts` action types |
| TCA-2 86/mark-out-of-stock | UNBUILT | `mark_products` only supports `field: is_active|age_restricted` — no out-of-stock/online-availability field exists on `pos_products` at all | — |
| TCA-3 Adjust-stock-from-chat | PARTIAL | `adjust_stock` fully wired (writes `pos_outlet_inventory` + `pos_stock_adjustments` audit row, atomic RPCs) — but reason is hardcoded, and the "large adjustment" gate is a typed confirm + numeric clamp, not a manager PIN | Thread a real reason string through; add PIN entry for mass adjustments |
| TCA-4 Update price/name/desc | PARTIAL | Price/promo actions exist and apply **instantly** on confirm — no "publish-when-ready" draft state as specced. No name/description edit action type exists at all | — |
| TCA-5 Activate-upsell | UNBUILT | No upsell/co-purchase action type or conversion-tracking code anywhere | — |
| TCA-6 Pause online orders | UNBUILT (capability exists, not chat-wired) | A manual `online_ordering_enabled` toggle exists as a settings-page control — not reachable from the Aria action layer | — |
| TCA-7 Avatar command surface | PARTIAL — real gap found | `AriaFloatingPanel.tsx` correctly routes mic→Web Speech API→the same real `ask` pipeline as chat (not a shortcut) — but it never sends/stores `conversation_id`, so a voice-planned action's confirm turn can never be matched back to its `pending_action` row. The action can be *proposed* but never *confirmed* through this surface. **Fails closed, not open** — not a safety regression, but voice commands are currently functionally inert for anything that writes. | Add `conversation_id` state + a confirm card to `AriaFloatingPanel.tsx`, mirroring the full chat page's already-correct handling |
| TCA-8 Done-Actions report | BUILT-COLD | `src/app/api/aria/ask/audit/route.ts` reads real `aria_action_log` data (before/after, triggered_by, outcome, rollback) — zero frontend callers anywhere | One dashboard page consuming this existing endpoint |

---

## RESP-1..6 + Batch 5 remainder (WIRE-DB-3, LOGGING-AUDIT-4, CACHE-EPOCH-2, COMMAND-PORT-1,
MEMORY-DEDUPE-1, MONITOR-1, STOCKTAKE-DEDUPE)

| ID | Class | Evidence | Delta |
|---|---|---|---|
| LOGGING-AUDIT-4 | PARTIAL | `logAICallSafe` used by 11 files; 55 files still do raw `.from('aria_ai_calls').insert(` — the 3 `providers/*.ts` files + `ai-router.ts`/`model-router.ts` are the highest-fanout offenders | Point those 5 files at `logAICallSafe`; rest is long tail |
| CACHE-EPOCH-2 | SUPERSEDED | `council.ts` `getDataEpoch()` (keyed on latest sale) + cache key = `questionHash+dataEpoch` + 5-min TTL backstop — a stronger practical guarantee than the SHA-keyed bust originally specced | — |
| COMMAND-PORT-1 | UNBUILT | `AriaCommandBar.tsx` → `/api/aria/command` is a standalone, simpler implementation, confirmed not sharing BREVITY/GROUNDING/RICH-1 logic with `/ask`'s pipeline | Port the guard logic in |
| MEMORY-DEDUPE-1 | UNBUILT (currently benign) | No `content_hash` column or unique constraint on `aria_business_memory`; Sip's 88 active rows have zero exact duplicates today | Add hash column + unique index + compaction cron |
| MONITOR-1 | **BUILT+WIRED** | `src/app/api/cron/aria-health-monitor/route.ts` — shipped as its own dedicated sprint (commit `9802d797`), calls `sendAlert()` for AI failure-rate thresholds, wiring health, budget/renewal/quota | None — already done |
| WIRE-DB-3 | UNKNOWN — naming drift | No commit named this; ROADMAP.md's actual "DB wiring 1/2/3" is a different, still-unbuilt item | Needs author clarification |
| STOCKTAKE-DEDUPE | UNBUILT | `pos/stock-takes/route.ts` has no dedup check; no unique index on `(business_id, outlet_id, date)` | Add the check + index |

**Merge candidate**: MEMORY-DEDUPE-1 + STOCKTAKE-DEDUPE — same hash/uniqueness-guard pattern,
different tables, one shared helper.

---

## Tier-11 infra (letters QQ/RR/TT/UU/VV/WW/XX/YY/NN — investigated by domain)

**All three blocks the roadmap called "fully unbuilt" turn out to already exist** — built as
general POS/finance depth work or under differently-named sprints since.

| Domain | Class | Evidence | Delta |
|---|---|---|---|
| Warehouse procurement (PP) | BUILT+WIRED | `pos/purchase-orders` + `warehouse/purchase-orders/{create,send,receive}`; 3 real PO rows | — |
| Warehouse supplier returns (QQ) | BUILT+WIRED | `warehouse/returns/route.ts` — genuinely distinct from POS-register returns | `warehouse_returns` = 0 rows, untested in prod |
| Warehouse supplier performance (RR) | BUILT+WIRED | `suppliers/scorecard/route.ts` — live-computed off real PO data | Dead sibling table, superseded by on-the-fly computation |
| P&L (LL) | BUILT+WIRED | `finance/overview/route.ts` + `reconciliation-agent.ts`'s `generateMonthlyPL()` | — |
| BAS prep (MM) | BUILT+WIRED | `bas-agent.ts`, `compliance/bas`, `pos/bas-export`, 4 real `bas_drafts` rows | — |
| Bank reconciliation (NN) | PARTIAL | 65 real `daily_reconciliations` rows, but approximates `bank_deposits_total = pos_card_total` instead of matching real bank transactions — `bank_accounts`/`bank_transactions`/`basiq_connections` all 0 rows | Wire real Basiq transaction fetch+match |
| Cash-flow forecast (OO) | BUILT+WIRED | `cash_flow_forecasts`, 11 real rows | — |
| Multi-outlet | BUILT+WIRED | `pos_outlets`, 3 live rows, pervasively scoped after CANON-MIGRATE 1-4 | — |
| Deliveries | PARTIAL | `pos_parcel_tracking` real + synced; no 3rd-party (DoorDash/Uber-style) integration | 3rd-party connect flow |
| Workforce | BUILT+WIRED | 134 real `pos_timesheets` rows; fully wired staff-shifts/leave | — |
| Reporting | BUILT+WIRED | Full `reports/{weekly-*}` route set | — |
| PII encryption (VV) | **SUPERSEDED = SEC-4** | Confirmed the same item, shipped 2026-06-15 (AES-256-GCM `*_enc` columns present); plaintext columns retained deliberately, null-out is a follow-up | Null legacy plaintext once all reads use `*_enc` |

TT vs SS could not be resolved to specific features (original letter spec not found) — no evidence
of accidental duplicate builds within what was investigated.

---

## Merge candidates (final list, corrected against actual file/table overlap)

1. **CS**: front-door commit — CS-1 + CS-2 deltas + the shared `/menu`/`/store` checkout-session fix.
2. **RESP**: MEMORY-DEDUPE-1 + STOCKTAKE-DEDUPE — one shared dedup helper.
3. **RESP**: LOGGING-AUDIT-4's remaining delta (5 highest-fanout files) as its own single commit.
4. **DCC**: 8 groups (corrected from the roadmap's own ~5 estimate — see BATCH 16 section above).
5. **TCA**: no strong merge candidate found — each item touches a distinct `ActionType`/UI surface;
   TCA-7's `conversation_id` fix is small enough to ship with whichever TCA item ships first.

---

## Total remaining (real, open or partial work, across the full sprint)

- **AG-W**: 2 UNBUILT (W3/W4, W3 externally gated on Meta) + urgent bugfix on already-shipped code
  (the AG-W0 privacy leak — a fix, not a new sprint) + a "don't duplicate" flag on AG-W1's literal spec.
- **CS-1..9**: 4 PARTIAL (mergeable toward 1 front-door commit) + 4 UNBUILT (feedback funnel, gift
  purchase page, subscriptions, catering) + 1 BUILT-COLD (online ordering — needs the session fix).
- **RESP/Batch 5**: 5 real items → mergeable to ~3 commits (1 unclear pending clarification).
- **Tier-11**: 2 PARTIAL (bank reconciliation, deliveries) + 1 cleanup (dead table).
- **DCC-1..16**: 8 merge-groups; the two most valuable (DCC-1 money-hero, DCC-10 demo-mode) are both
  clean UNBUILT with no legacy to reconcile — genuinely the best next work in this whole audit.
- **TCA-1..8**: 5 real items (2 UNBUILT are net-new action types; TCA-7's gap is the cheapest fix in
  the batch — small, isolated, and it's what makes the flagship avatar-command idea actually work).

**Estimated real remaining work across the whole sprint: ~24 sprints** (down from the ~56 named
items audited, of which 18 needed nothing and 19 more need only a small delta on top of real,
already-built intelligence). The single highest-leverage items found: **AG-W0's live PII leak**
(fix, not build — protects real customer data today) and **TCA-7's `conversation_id` gap** (a few
lines that unlock the entire avatar-command surface once TCA-1..6 land).
