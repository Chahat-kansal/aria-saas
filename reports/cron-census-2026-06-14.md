# Cron ↔ vercel.json function-config census — 2026-06-14
**Read-only documentation. No code/config change.** Reconciles every cron route on disk against the
`vercel.json` `crons[]` schedule list and the `functions` config globs.

## Totals
- Cron route directories on disk: **64** (`/api/cron/*` ×63 usable + `/api/crons/aria-intelligence`). Excludes `_lib` (shared helpers) and `[task]` (dynamic, not a cron).
- Scheduled in `vercel.json crons[]`: **55**.
- Function-config globs in `vercel.json functions`: **9** (≤22 ✓). Every cron is covered by `src/app/api/cron/**/*.ts` (maxDuration 300) or `src/app/api/crons/**/*.ts`.
- **Orphan routes (on disk, NOT scheduled): 8.** Orphan schedules (scheduled, no route): **0**.
- Sub-daily schedules (violate CLAUDE.md RULE 4): **0** — all are daily / weekly / monthly.

## Scheduled crons (55) — path · schedule · route exists · fn-config · inferred purpose
| path | schedule | route on disk | fn-config | purpose (inferred) |
|---|---|---|---|---|
| /api/cron/kiosk-token-rotate | 0 18 * * * | Y | Y | rotate kiosk access tokens |
| /api/cron/expire-checkout-carts | 0 18 * * * | Y | Y | expire abandoned checkout carts |
| /api/cron/parcel-insights | 0 6 * * * | Y | Y | parcel delivery insights (was `0 */6` — now daily ✓) |
| /api/cron/nightly-sync | 0 2 * * * | Y | Y | nightly data sync |
| /api/cron/rfm-daily | 0 16 * * * | Y | Y | RFM customer scoring |
| /api/cron/daily-briefing-submit | 0 16 * * * | Y | Y | submit daily briefing generation jobs |
| /api/cron/daily-briefing-poll | 0 3 * * * | Y | Y | poll/collect briefing results |
| /api/cron/publish-scheduled | 0 9 * * * | Y | Y | publish scheduled social posts |
| /api/cron/sync-engagement | 0 3 * * * | Y | Y | sync social engagement metrics |
| /api/cron/aria-brain | 0 2 * * * | Y | Y | nightly business-brain compute |
| /api/cron/sync-reviews | 0 6 * * * | Y | Y | sync google/business reviews |
| /api/cron/loyalty-birthday | 0 9 * * * | Y | Y | loyalty birthday rewards |
| /api/cron/loyalty-winback | 0 10 * * * | Y | Y | loyalty win-back offers |
| /api/cron/notify-ready | 0 23 * * * | Y | Y | order-ready notifications |
| /api/crons/aria-intelligence | 0 8 * * * | Y | Y | daily aria intelligence pass |
| /api/cron/signal-engine | 0 3 * * * | Y | Y | compute aria_signal_cache signals |
| /api/cron/customer-scoring | 0 3 * * * | Y | Y | customer segment/RFM scoring |
| /api/cron/memory-extract | 0 16 * * * | Y | Y | extract conversation memories |
| /api/cron/hypothesis-engine | 0 15 * * * | Y | Y | generate aria_hypotheses nightly |
| /api/cron/outcome-check | 0 17 * * * | Y | Y | verdict outcomes + hypothesis closure (I4) |
| /api/cron/marketing-automations | 0 11 * * * | Y | Y | run marketing automations |
| /api/cron/parcel-sync | 0 6 * * * | Y | Y | sync parcel tracking statuses |
| /api/cron/leave-accrual | 0 1 * * * | Y | Y | staff leave accrual |
| /api/cron/seo-crawl | 0 7 * * * | Y | Y | SEO site crawl |
| /api/cron/weekly-report | 0 22 * * 0 | Y | Y | weekly report (Sun) |
| /api/cron/price-schedules | 0 5 * * * | Y | Y | apply scheduled price changes |
| /api/cron/seo-keyword-check | 0 3 * * * | Y | Y | SEO keyword rank check |
| /api/cron/seo-verify-fixes | 0 2 * * * | Y | Y | verify applied SEO fixes |
| /api/cron/competitor-monitor | 0 22 * * * | Y | Y | competitor price/listing monitor |
| /api/cron/loyalty-expiry | 0 4 * * * | Y | Y | expire loyalty points |
| /api/cron/mark-overdue | 0 1 * * * | Y | Y | mark overdue invoices |
| /api/cron/timed-prices | 0 9 * * * | Y | Y | timed price activations |
| /api/cron/xero-sync | 0 2 * * * | Y | Y | Xero accounting sync |
| /api/cron/send-scheduled-campaigns | 0 12 * * * | Y | Y | send scheduled marketing campaigns |
| /api/cron/booking-reminders | 0 13 * * * | Y | Y | booking reminder messages |
| /api/cron/market-price-refresh | 0 15 * * * | Y | Y | refresh market price comparisons |
| /api/cron/send-scheduled-reports | 0 20 * * * | Y | Y | email scheduled reports |
| /api/cron/xero-auto-sync | 0 1 * * * | Y | Y | auto Xero sync |
| /api/cron/trial-warnings | 0 9 * * * | Y | Y | trial-expiry warning emails |
| /api/cron/council-session | 0 20 * * * | Y | Y | nightly multi-agent council session |
| /api/cron/menu-engineering | 0 6 * * * | Y | Y | menu engineering analysis |
| /api/cron/supplier-negotiation | 0 20 1 * * | Y | Y | monthly supplier negotiation (1st) |
| /api/cron/waste-prep-guide | 0 11 * * * | Y | Y | waste prep guidance |
| /api/cron/waste-noon-check | 0 2 * * * | Y | Y | waste noon check |
| /api/cron/waste-reconcile | 0 12 * * * | Y | Y | waste reconciliation |
| /api/cron/labour-optimisation | 0 19 * * * | Y | Y | labour/roster optimisation |
| /api/cron/bas-monitor | 0 22 * * * | Y | Y | BAS/tax monitoring |
| /api/cron/reputation-requests | 0 8 * * * | Y | Y | reputation/review requests |
| /api/cron/aeo-weekly | 0 21 * * 0 | Y | Y | weekly AEO pass (Sun) |
| /api/cron/reconciliation | 0 20 * * * | Y | Y | financial reconciliation |
| /api/cron/customer-acquisition | 0 21 * * 1 | Y | Y | weekly customer acquisition (Mon) |
| /api/cron/inventory-financing | 0 19 * * 0 | Y | Y | weekly inventory financing (Sun) |
| /api/cron/aria-health-monitor | 0 5 * * * | Y | Y | aria wiring-health monitor |
| /api/cron/invoices-recurring | 0 9 * * * | Y | Y | generate recurring invoices |
| /api/cron/pattern-memory | 0 3 * * 1 | Y | Y | weekly data-pattern detection (Mon, I3) ⚠️ see note |

## Orphan routes — exist on disk but NOT in `crons[]` (8)
These have no Vercel schedule. They are likely triggered manually, by another cron/job, or are dormant.
| route | likely trigger / status |
|---|---|
| /api/cron/clv-outcomes | CLV agent outcome check — probably invoked by clv-weekly or manually |
| /api/cron/clv-weekly | CLV weekly pass — **unscheduled; candidate to schedule or is dormant** |
| /api/cron/flash-outcomes | flash-revenue outcome check — paired with flash-revenue |
| /api/cron/flash-revenue | flash-revenue agent — **unscheduled; candidate to schedule or is dormant** |
| /api/cron/generate-briefings | briefing generation — may be superseded by daily-briefing-submit/poll |
| /api/cron/memory-consolidate | memory consolidation — **unscheduled; candidate to schedule** |
| /api/cron/reviews-weekly-digest | weekly review digest — **unscheduled; candidate to schedule (weekly)** |
| /api/cron/run-scheduled-reorders | scheduled reorder runner — may be invoked by another path |

## Notes / flags (no action taken — census only)
- **0 orphan schedules**: every scheduled path resolves to a route on disk. ✓
- **0 sub-daily schedules**: all daily/weekly/monthly — RULE 4 compliant. ✓
- **Function configs = 9 (≤22)** ✓. All crons matched by the `cron/**` + `crons/**` globs (maxDuration 300, memory 1024 for `cron/**`).
- **55 crons** total. (Confirm against the active Vercel plan's cron limit before adding more.)
- ⚠️ `pattern-memory` is scheduled and wired but, per `db-wiring-audit-2026-06-14.md`, its insert currently fails (kind CHECK + missing `source` column) — scheduling is correct; the route body is the issue (out of scope for this census).
- **TO FIX WHEN BACK:** decide whether the 8 orphan routes should be scheduled (e.g. `reviews-weekly-digest`, `memory-consolidate`, `clv-weekly`, `flash-revenue`) or removed if dead. Census does not change them.
