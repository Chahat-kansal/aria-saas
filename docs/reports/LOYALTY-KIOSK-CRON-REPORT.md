# LOYALTY-REGRESSION-1 + KIOSK-INBOX-1 — Investigation & Fix Report

**Date:** 2026-07-14 | **Commits:** Part A `96d631b2`, Part B *(this commit)* | **Method:** live
production data (Sip Café, `ff5055a0-c351-4ada-817a-1804961035f3`) + full code trace via 4
parallel independent research passes + direct SQL verification for every claim.

---

## PART A — Loyalty regression (P0)

### Root cause, stated plainly

Commit `44da08f7` ("ORD-EARN-ON-PICKUP", 2026-07-06 20:29 AEST) correctly fixed a real
double-fire race by moving the `earnOnSale()` call from order-placement/webhook time to a single
PATCH-to-completed handler in `online-orders/[id]/route.ts`. Its own commit message claims
"one change applies everywhere" — that was false. A **second, independent** live code path — the
KDS "delivered" bump in `kds/[id]/route.ts` (live since commit `77ed31ef`, 2026-07-03, unrelated
to and unchanged by `44da08f7`) — also drives `pos_online_orders.status → 'completed'` via a raw
`supabaseAdmin` update, and never called `earnOnSale`. Any online order completed from the kitchen
screen rather than the separate "Online Orders" queue's "Mark picked up" button silently earned
zero loyalty points, with no error surfaced anywhere.

**Confirmed via `git log -p` on the exact breaking commit** and via live data: sale `a2e9af32`
(2026-07-06 09:58 UTC) completed 31 minutes *before* `44da08f7` landed and ran the old, still-working
code path. Sales `9e5f0299` (2026-07-12) and `916644c1` (2026-07-14) both ran under the new regime,
both completed via the KDS bypass, both earned zero.

### Ruled out: the P0-5 duplication finding

No documentation of "P0-5" exists anywhere in this repo (checked `SECURITY-AUTHZ-AUDIT.md`,
`AUDIT_STATE.md`, `WIRING_AUDIT.md`). More directly: the online-order `pos_sales` row is created by
a **third, standalone insert** inside `public/place-order/[business_id]/route.ts` — it never goes
through `pos/sale` or `pos/sales` at all. Confirmed unrelated; a distinct regression from `44da08f7`,
not a symptom of the terminal-endpoint duplication.

### Fix

Added the same `earnOnSale()` call to the KDS "delivered" sync block in `kds/[id]/route.ts`,
mirroring the existing correct pattern in `online-orders/[id]/route.ts`. Safe even if both
completion paths ever fire for the same sale — `earnOnSale` is idempotent (SELECT-first + the
`pos_loyalty_txn_earn_per_sale` unique index catches any race).

### Backfill (migration `20260714000003`, applied + verified live)

Writes the 2 missing `pos_loyalty_transactions` rows (7 pts / 20 pts, `points_per_dollar=1`
confirmed for Sip) **and** replicates `earnOnSale`'s full downstream effect on `pos_customers`
(`points_balance`/`loyalty_points`/`total_spent`/`visit_count`/`last_visit`) — a bare ledger-only
insert would have left the customer's balance silently under-reporting by 27 points forever.
Idempotent via `NOT EXISTS` per `sale_id`.

**Verified live, before → after** (customer `dc69d5e2`):

| | Before | After |
|---|---|---|
| `points_balance` | 73 | **100** |
| `total_spent` | $73.00 | **$100.00** |
| `visit_count` | 5 | **7** |
| `last_visit` | 2026-07-06 | **2026-07-14** |

### Platform-wide scan

Scanned all businesses with `program_enabled=true`, restricted to sales *after* each business's
own first-ever loyalty transaction (a naive unscoped scan initially and incorrectly flagged ~80
false positives — dine-in/takeaway sales from 2026-06-01–05 for Sip that predate the loyalty
program having any working transaction history at all, i.e. before it was actually turned on; this
was caught and excluded before being reported as real). **Confirmed: the 2 named Sip sales are the
only affected sales anywhere on the platform.** No further backfill needed.

---

## PART B — Customer inbox

### The real data pipeline (not `aria_notifications`)

`/api/dashboard/inbox/route.ts` queries a view, **`customer_interactions_v`**
(`supabase/migrations/20260528000004_customer_interactions_view.sql`,
`20260528000008_inbox_view_scan_and_go.sql`), which `UNION ALL`s 7 real tables:
`instore_conversations` (kiosk chat), `marketplace_chats`, `instore_demand_signals`,
`community_message_reports`, `community_blocked_visitors`,
`aria_autopilot_actions WHERE category='kiosk_help_request'`, `pos_self_checkout_carts`. Neither
`aria_notifications` (1 row platform-wide, correctly never referenced) nor `cx_notifications`
(confirmed customer-facing, correctly ruled out per the addendum) has anything to do with this page.

**Live verification for Sip:** the view returns 18 real rows — 6 kiosk chats, 12 demand signals.
Everything else is legitimately 0 (no marketplace/community/scan-and-go activity for this
business), not a bug.

### Why it hangs on "Loading" — could not reproduce, stated honestly

Read `page.tsx` in full: `loading` only gates the item-list panel; it resolves to `false`
unconditionally on every path (success, fetch error, non-JSON response) in `load()`'s `try`/`catch`.
The detail panel has its own independent `detailLoading` state. The "Aria's weekly read" summary
card fetches separately and never blocks the main list. `getBid()` resolves correctly for Sip's
owner session. **Given correct auth, the live query returns 18 real rows for Sip, not zero** — this
directly contradicts the "stuck on Loading, empty list" premise.

**I could not find a code or data cause for a genuine infinite hang.** The most likely explanation,
stated as a hypothesis rather than a confirmed cause: a session/auth artifact at test time (not
authenticated as the Sip owner in that browser session) rather than a data-pipeline defect. If this
recurs, checking the actual `/api/dashboard/inbox` response status/body in the Network tab will
immediately show whether it's auth-related or something else — recommend that as the next step if
reproduced again, rather than guessing further from static analysis.

### Kiosk message write path — genuine gap, fixed

**Kiosk chat and demand signals were already fully wired** (`public/instore/chat/route.ts` inserts
into both on every kiosk turn) — "kiosk messages" in that sense already land in the inbox and did
before this sprint.

**"Talk to staff" was not.** The inbox's read side for `category='kiosk_help_request'` has existed
since 2026-05-28 with **zero write path** — no kiosk UI button, no API endpoint. The original spec
(`prompts/81-kiosk-improvements.md`, Improvement 4) called for exactly this feature and it was never
built. This is the actual "kiosk inbox" gap the sprint is named after.

**Fixed:** built the missing piece per the original spec —
`src/app/api/public/instore/help/route.ts` (new route: kiosk-session-gated, rate-limited 1/5min per
business+IP, inserts the `aria_autopilot_actions` row the inbox already reads, alerts the owner via
SMS — mirrors the identical existing pattern in `public/widget/chat/route.ts`'s booking-alert flow)
+ a "Talk to staff →" ghost button in `KioskClient.tsx` that calls it and shows the customer a
confirmation, matching the spec's exact copy.

### "Feedback" tab — genuinely no backend, not fixed here

Confirmed via the view's own header comment and a live `information_schema` check:
`instore_recommendation_feedback` does not exist as a table anywhere. No view branch, no `detail()`
case for `source='feedback'` either. This is not a wiring bug — it needs a new table + a kiosk
thumbs-up/down UI + a view branch + a detail case, i.e. a small new feature, not a connection fix.
**Not built in this sprint** — flagged for its own scope rather than rushed in alongside a P0 fix
and a different feature build. The tab fails gracefully today (shows "Nothing here yet", not an
error), so nothing is currently broken by leaving it unbuilt.

### The "9+" badge — unrelated, confirmed not mocked

The badge lives on `AriaBrainPanel` (a *different* floating button from any inbox-related UI),
sourced from `/api/aria/pending-insights` → the `aria_actions` table (distinct from
`aria_autopilot_actions`), filtered `status='pending'`. These are AI-generated business
recommendations (pricing/ops/marketing suggestions), not customer messages. Real, live query — not
mocked — but has nothing to do with the customer inbox.

---

## PART C — Verify only, no code changes

| Job / metric | Verdict | One-line reason |
|---|---|---|
| **customer-scoring** `recommendations_created` | Legitimately quiet | `at_risk=4/51` (7.8%, needs ≥5 or >15%) and `hibernating=7` (needs ≥10) — both just under threshold |
| **marketing-automations** `birthday_sent` | Legitimately quiet | Only 2/51 Sip customers have `marketing_consent=true`; neither has a birthday matching today |
| **marketing-automations** `review_requests_queued` | Legitimately quiet, but hard-blocked | A qualifying sale did occur, but `businesses.google_business_url IS NULL` for Sip — will stay 0 forever until set. **Founder action item, not a bug.** |
| **hypothesis-engine** | **Looks broken** | Anthropic fails on every run (credit balance exhausted since ≥2026-06-27) → correctly fails over to Gemini → Gemini *does* generate real content, but the 2048-token output cap truncates the JSON array mid-stream, so it fails to parse **100% of the time**. Genuinely-generated hypotheses are silently discarded daily. |
| **outcome-check**: `outcomes_checked`, `autopilot_backfilled`, `hypotheses_closed` | Legitimately quiet (3 of 4 sub-metrics) | Each gated on upstream data that's correctly near-empty for a young test business (1 outcome row 1 day from due, 0 approved-status actions, 0 accepted hypotheses — downstream of the hypothesis-engine bug above) |
| **outcome-check**: `autopilot_resolved` | **Looks broken** | Filters `outcome = 'pending'` (exact string), but the column defaults to `NULL` and **zero rows in the entire 165-row table, platform-wide**, hold the literal string `'pending'` — this sub-metric is structurally guaranteed to return 0 forever regardless of real activity |
| **cost_events** (COST-LEDGER-1) | Legitimately quiet | Now 2 rows (grew from 1 during this session), both `sms`/`clicksend`, and both timestamps match `sms_send_log` sent-rows within 0.3s — proof the chokepoint fires correctly on real sends. 0 email/Stripe rows because 0 emails sent and 0 Stripe charges occurred since ship — not a broken logger. |
| **pos_kds_tickets** | **Looks broken** | Same fragile shape as the loyalty bug: KDS ticket creation is a detached, fire-and-forget second call (`/api/pos/kds/auto-fire`) after the primary `/api/pos/sale` insert, not part of the sale-completion transaction. 34+ sales have completed since 2026-07-02 with zero new tickets — the call is still wired (unchanged in git history) but something inside it is failing silently (fire-and-forget `.catch(() => {})` on the terminal, response body never read). Exact failing line not pinned without live reproduction — **needs its own investigation**, not fixed here per Part C's report-only scope. |

**Bonus finding (not asked, surfaced during the cron investigation, not fixed):**
`hypothesis-engine`/`outcome-check`'s business filter is `.in('subscription_status', ['active',
'trialing'])` — but live values are `'active'`/`'trial'` (no "-ing"). 3 of the platform's 4
businesses have `subscription_status='trial'` and are silently excluded from both crons entirely.
Doesn't affect Sip (status is `'active'`, correctly matched) but is a real gap worth its own ticket.

---

## Commit / build verification

- Part A (`96d631b2`): tsc 0, build 0. Migration applied + verified live via direct query
  (`pos_customers` before/after values above) per RULE 10.
- Part B (this commit): tsc 0, build 0. No new tables — reuses the existing
  `aria_autopilot_actions` table the inbox already reads from.
- Part C: no code changes, per its own rule.
- `vercel.json` unchanged.
