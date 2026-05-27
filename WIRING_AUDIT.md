# Aria OS — System Wiring Audit
Generated: 2026-05-27

## Summary
- Total dashboard pages checked: **52**
- Fully wired (page → API → DB): **49**
- Pages that talk to Supabase directly (no `/api` layer): **3** — see *Direct-DB Pages*
- Broken wiring: **0** — every API path referenced by a page resolves to a real route file
- Total API route files: **738**
- Unique `/api/*` paths referenced by pages: **172**
- Cron entries in `vercel.json`: **30** (all route files exist)

## ✅ Fully Wired Pages
All 49 of the following have at least one `/api/*` fetch that resolves to a real route file, and those routes hit real Supabase tables. (Dynamic segments like `/api/seo/issues/${id}` and `/api/social/generate-image|video|voiceover` were treated as resolved when a sibling `[param]` route or matching sibling exists.)

aria, ask-aria, audit-checks, autopilot, billing, bookings, cash-flow, cash-up, churn, competitors, compliance, custom-features, customer-tabs, customers, daily-briefing, delivery, import-data, integrations, intelligence, inventory, invoices, locations, loyalty, marketing, missed-demand, orders, parcel-tracking, pos, profit-leaks, quote-builder, receipt-scan, recipes, reorder, reviews, seo, settings, shift-reports, slow-day, social, social-calendar, staff, stocktake, studio, supplier-import, suppliers, timed-prices, variance, weekly-reports, winback.

## ⚠️ Partial / Direct-DB Pages (no `/api` layer)
These 3 pages don't fetch from `/api/*` but they are not broken — they query Supabase directly via the browser client or server component:

| Page | Mechanism | Notes |
|------|-----------|-------|
| `price-tickets` | Server component → `supabaseAdmin` → `PriceTicketApp` client | Loads products + ticket templates at request time. Wired. |
| `support` | Client `supabase` browser client | Selects/inserts on `support_tickets` directly via RLS. Wired. |
| `website-chat` | Client `supabase` browser client | Reads/writes widget config + chat via RLS. Wired. |

*No fix required* — these are valid Next.js patterns. Flagging them only because the audit asks about the `/api` layer specifically.

## ❌ Broken / Disconnected
**None found.** Every `/api/...` URL constructed in a dashboard page resolves to a real route file (after accounting for `[id]` and other dynamic segments).

Three suspicious URL prefixes were checked manually and confirmed valid:
- `/api/seo/issues/${id}` → `src/app/api/seo/issues/[id]/route.ts` ✓
- `/api/social/generate-{image|video|voiceover}` → three sibling routes ✓
- `integrations/` partial — produced by a parameterised URL builder, never an unresolved literal ✓

## API Routes With No DB Table
The audit's "known tables" list (46 entries) is a curated subset, not the live schema. A blind diff of routes' `.from('…')` calls against that list reports **249** "unknown" table references — but inspection shows these are real tables created in this conversation's earlier prompts (e.g. `loyalty_tiers`, `feature_roadmap`, `bank_accounts`, `competitor_snapshots`, `audit_item_photos`, `xero_sync_queue`, `scheduled_price_changes`, `aria_hypotheses`, `intelligence_events`, `social_inbox`, `social_content_library`, `pos_outlet_stock`, `recipe_waste_log`, etc.) plus the full POS surface area (`pos_modifier_groups`, `pos_kds_tickets`, `pos_inventory`, `pos_purchase_order_items`, `pos_outlets`, `pos_oauth_integrations`, …).

**Action**: no broken table references detected. The audit's known-tables list is stale relative to the live schema — refresh that list from `information_schema` before relying on this section.

## Orphaned API Routes
87 route files exist that are not referenced anywhere else in `src/` by string search. The vast majority are intentional endpoints called by:
- External providers (webhooks): `webhooks/stripe`, `webhooks/stripe-image-credits`, `webhooks/nps-response`, `twilio/webhook`, `social/callback/facebook`, `social/callback/google`, `integrations/{facebook,google,instagram}/callback`, `integrations/instagram/deauthorize`, `integrations/instagram/data-deletion`
- Public URLs hit by anonymous visitors: `public/bookings/[business_id]`, `public/loyalty/[business_id]/enrol`, `public/menu/[business_id]/descriptions`, `public/order/[id]/status`, `quotes/[id]/{view,accept}`, `invoices/track/[id]`, `widget/{chat,config}`, `og/default`
- Healthchecks / probes: `health`, `health/stripe`, `ping`, `sentry-test`
- POS dynamic operations called only from the terminal page (which I did not full-read; many `pos/sales/[id]/{void,refund,reopen,reprint,split}`, `pos/sale-items/[id]/{comp,move}`, `pos/splits/[id]/...`, `pos/tables/[id]/{seat,clear}`, `pos/kds/tickets/[id]/{bump,recall,refire}`, `pos/orders/[id]/lines/[lineId]`, `pos/transfers/[id]/...`, `pos/promotions/[id]/usage`)
- Cron handler: `crons/aria-intelligence` (note: under `crons/` not `cron/`) — registered in vercel.json
- Auth: `auth/signout`

**Likely genuine orphans worth investigating:**
- `aria/insights/[id]/{approve,dismiss}` — no caller found (intelligence page uses `intelligence-events` instead)
- `aria/pos-end-of-day/email` — no caller
- `customers/import/square` — referenced via dynamic builder?  worth verifying
- `customers/[id]/{aria-insight,summarise,winback}` — possibly hit from customer detail page; verify
- `dashboard/stats`, `dashboard/widget-config` — no caller
- `execute` — no caller (very generic name)
- `research` — no caller
- `staff/reports/attendance`, `staff/swap/[id]`, `staff/payroll/[id]/export`, `staff/members/[id]/pay-rates` — likely staff page sub-fetches; verify
- `marketing/campaigns/[id]/{analytics,send}` — likely campaign detail page; verify
- `social/posts/[id]/publish` — verify
- `warehouse/pick-lists/[id]/complete` — verify
- `integrations/lightspeed/import-products` — verify
- `pos/permissions/outlet-overlay` — verify

Full orphan list (87 entries) lives in `/tmp/orphan_routes.txt` during this audit run; reproduce with:
`find src/app/api -name route.ts | sed 's|src/app/api/||;s|/route.ts||' | comm -23 - <(grep -rohE "['\"\\\`]/api/[A-Za-z0-9_/-]+" src | sed "s|['\"\\\`]||g;s|^/api/||" | sort -u)`

## Cron Jobs Status
All 30 vercel.json cron entries map to a real route file. Quick summary (table-touch count from grep):

| Path | Schedule | tables_used |
|------|----------|-------------|
| api/cron/nightly-sync | 0 2 * * * | 13 |
| api/cron/rfm-daily | 0 16 * * * | 3 |
| api/cron/daily-briefing-submit | 0 16 * * * | 10 |
| api/cron/daily-briefing-poll | 0 3 * * * | 8 |
| api/cron/publish-scheduled | 0 9 * * * | 1 |
| api/cron/sync-engagement | 0 3 * * * | 3 |
| api/cron/aria-brain | 0 2 * * * | 3 |
| api/cron/sync-reviews | 0 6 * * * | 3 |
| api/cron/loyalty-birthday | 0 9 * * * | 3 |
| api/cron/loyalty-winback | 0 10 * * * | 3 |
| api/cron/notify-ready | 0 23 * * * | 1 |
| api/crons/aria-intelligence | 0 * * * * | 8 |
| api/cron/signal-engine | 0 3 * * * | 5 |
| api/cron/customer-scoring | 0 3 * * * | 5 |
| api/cron/memory-extract | 0 16 * * * | 8 |
| api/cron/hypothesis-engine | 0 15 * * * | 5 |
| api/cron/outcome-check | 0 17 * * * | 4 |
| api/cron/marketing-automations | 0 */2 * * * | 14 |
| api/cron/parcel-sync | 0 6 * * * | 3 |
| api/cron/leave-accrual | 0 1 * * * | 6 |
| api/cron/seo-crawl | 0 7 * * * | 9 |
| api/cron/weekly-report | 0 22 * * 0 | 1 |
| api/cron/price-schedules | 0 * * * * | 8 |
| api/cron/seo-keyword-check | 0 3 * * * | 5 |
| api/cron/competitor-monitor | 0 22 * * * | 6 |
| api/cron/loyalty-expiry | 0 4 * * * | 6 |
| api/cron/timed-prices | 0 * * * * | 4 |
| api/cron/xero-sync | 0 2 * * * | 4 |
| api/cron/send-scheduled-campaigns | (per vercel.json) | 10 |
| api/cron/booking-reminders | (per vercel.json) | 8 |

Notes:
- One cron lives under `/api/crons/` (plural) while the rest are under `/api/cron/` — verify on Vercel that both prefixes are registered (they are in vercel.json).
- `0 */2 * * *` for `marketing-automations` is **sub-daily** — confirm this is intentional given the project's "no sub-daily crons" rule. Same for `0 * * * *` entries: `aria-intelligence`, `price-schedules`, `timed-prices`. (timed-prices was downgraded from `*/15` to hourly in commit `cbabddd` per the rule.)

## Recommendations
Numbered by impact:

1. **Refresh the "known tables" list** before re-running this audit — it's the only thing that produced false negatives. Pull from `select table_name from information_schema.tables where table_schema='public'` and commit to `docs/known-tables.txt` so future audits diff against truth.
2. **Verify hourly crons against project rule.** `aria-intelligence`, `price-schedules`, `timed-prices` all run hourly. Project rule says "no sub-daily crons" — confirm this scope means "no <hourly" (then OK) or "no <daily" (then move to daily).
3. **Audit the 16 suspicious orphans** listed above. Many likely are wired via a dynamic URL builder that string-grep misses (template literals constructed across lines). Spot-check one or two from each category before assuming all are reachable.
4. **Replace direct-DB pages with `/api` routes** if you want consistent RLS, observability, and rate limiting: `support` and `website-chat` currently issue Supabase calls from the browser bundle. Server routes give you `withErrorCapture` and CSRF posture.
5. **Standardise on `/api/cron/` only** — the lone `/api/crons/aria-intelligence` path is easy to lose track of; consider renaming or aliasing.
6. **Add a CI lint step** that re-runs this audit on every PR and fails if a page references an unresolved `/api/...` path. Cheap insurance against regressions.

— end of report —