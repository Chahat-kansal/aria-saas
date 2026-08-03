# BUG-HUNT-2 — Tier 1 Re-Score + Coverage Completion

Read-only investigation, matching BUG-HUNT-1's own discipline. **Nothing in this repo was
changed to produce this report.** Two parts: (A) re-examine BUG-HUNT-1's ~Tier 1 findings for
severity, not existence — every file re-read in full against the current live code; (B) finish
BUG-HUNT-1's explicitly-incomplete Part C — `api/dashboard`, `api/social`, `api/training` (0%
before this sprint) and the remaining ~65% of `api/aria`. All 227 files in scope were read in
full by 9 parallel passes using the identical "trust-client-identity" technique that found
BUG-HUNT-1's original 6 Tier 0 + 25 lower-tier items, cross-referenced against everything already
fixed (SECURITY-CRITICAL-1/2) so nothing closed is re-reported.

**Headline result: one new Tier 0 finding (`social/generate-video`) leaks a live third-party API
key to any authenticated user of any tenant — arguably the single most severe finding across both
BUG-HUNT-1 and BUG-HUNT-2 combined.** Four of BUG-HUNT-1's own Tier 1 items are re-ranked to Tier 0
below on re-reading the code; one is downgraded to Tier 3 after live RLS verification showed it
isn't actually exploitable. 24 new lower-tier findings came out of the coverage completion.

## Status check before anything else: is BUG-HUNT-1 itself still current?

Confirmed via git log: all 6 Tier 0 items (0.1-0.6) are fixed (`c4636b2e`, `40c16eb7`, `f86dc5f8`).
**None of the 9 Tier 1 files have been touched by any commit since BUG-HUNT-1's own report commit
(`dda64976`)** — every one of 1.1-1.9 is still fully open in the current codebase, confirmed by
re-reading each file in full (not assumed from the old report text).

---

## PART A — Tier 1 severity re-score (code-verified, not re-derived)

### 1.1 → RE-RANKED TIER 0 — `pos/mobile-session/[id]/submit/route.ts`
Re-reading surfaces a cleaner Tier-0 match than the original framing. Two issues, not one:
- **Line 15-16**: `supabase.from('mobile_inventory_sessions').select('*').eq('id', params.id).maybeSingle()`
  — no business filter. Any authenticated user reads ANY business's scanned session (product_id/
  cost/qty) by guessing/knowing `params.id`.
- **Line 78-83**: the final write, executed unconditionally regardless of everything above it —
  `.update({status:'completed', completed_at, submitted_by: user.email, notes}).eq('id', params.id)`
  — again zero business filter. This is a plain zero-check WRITE, identical in shape to
  already-fixed Tier 0.4 (`product-batches/decrement`: bid computed, never applied). An attacker
  can mark ANY other business's mobile inventory session "completed," stamped with their own
  email as `submitted_by`.
The bid-override mechanism the original write-up emphasized is real too (attacker can only pass a
`business_id` they own, so the `count`/`receive` write branches only affect their own inventory —
but the unscoped session READ above still leaks foreign scan data, and the `order` branch copies
that foreign product/cost data into the ATTACKER's OWN `purchase_order_drafts` row, a real
exfiltration-via-own-tenant-write). The unconditional final write is the cleaner, unambiguous
driver for the re-rank.

### 1.2 → RE-RANKED TIER 0 — `pos/mobile-session/route.ts:75-96` (PATCH)
Confirmed the cleanest possible Tier 0 match in this whole set: PATCH never calls `getBid`, never
checks business ownership at all — `.update(updates).eq('id', id)` where `id` is a raw
`searchParams` value, mutating `scanned_items`/`status`/`notes`. GET and POST in the *same file*
both correctly verify ownership first. This is a total omission on one handler, not a
partial/discarded check — arguably a cleaner case than several of the original Tier 0.1-0.6 items,
which at least had check logic present before being defeated.

### 1.3 → RE-RANKED TIER 0 — `pos/timed-prices/route.ts:90-113` (PATCH/DELETE)
Confirmed: PATCH doesn't even fetch `bid` (GET/POST in the same file do). The allowlisted patch
object (`timed_price`, `discount_pct`, `days_of_week`, `start_time`, `end_time`, `label`,
`is_active`, `category_id`) is applied via `.update(patch).eq('id', id)` with zero business check;
DELETE the same. `scheduled_price_changes` drives REAL, LIVE happy-hour pricing — this is the
exact bug class as already-Tier-0 0.5 (`future-prices`: unscoped price WRITE), arguably *worse*
since the price change here activates immediately within its scheduled window with no delay,
actively serving a wrong price at a real register the moment it's exploited.

### 1.4 → mechanism = Tier 0, impact lower — `pos/production-plan/route.ts:162-171` (PATCH)
Confirmed: no `getBid`, no business_id anywhere in the handler, `supabaseAdmin` (RLS bypass)
`.update({actual_qty, notes, updated_at}).eq('id', body.id)`. Mechanically identical to 1.2/1.3/
already-fixed Tier 0.4 — an exact zero-check WRITE via an RLS-bypassing admin client. But the data
touched (an internal bake-plan's quantity/notes) is not money, PII, or pricing — the original
Tier 1 placement is defensible on *impact* even though the *mechanism* matches Tier 0 exactly.
Recommend fixing this alongside 1.1/1.2/1.3/1.5 regardless of label — it's the identical one-line
fix (add `getBid` + `.eq('business_id', bid)`) and there's no reason to defer it just because its
own severity label stays lower.

### 1.5 → RE-RANKED TIER 0 — `pos/products/generate-image/route.ts:76-82,235-242`
Confirmed: `businessId` IS correctly verified against the caller. But the final write —
`sb.from('pos_products').update({image_url, image_thumb_url, image_source:'ai', updated_at}).eq('id', body.productId)`
(`sb` = service-role admin client) — has no business_id filter, and `productId` is a wholly
separate client field never cross-checked against the verified `businessId`. This is a structural
match to already-Tier-0 0.5 (verified primary id, unverified secondary id used in the actual
write) — same vulnerability shape, different consequence (product-image vandalism instead of
price sabotage).

### 1.6 → KEEP TIER 1, flagged top-of-tier — `aria/customer-intel/route.ts:36`
Confirmed: `bid` correctly scopes the sales-history query; `pos_customers.select('*').eq('id', customer_id).maybeSingle()`
has no business filter. Pure READ, no WRITE anywhere in this route — correctly Tier 1 per
definition ("cross-tenant READ of clearly sensitive data... PII"), does not share the Tier 0 WRITE
shape. Understated in the original one-liner though: `select('*')` returns the *entire* customer
row (not just name/loyalty/visits), which is then both returned verbatim in the JSON response and
sent as prompt content to Anthropic's API — a third-party data exposure stacked on top of the
direct cross-tenant leak. Recommend fixing this first among the Tier 1s that stay Tier 1.

### 1.7 → KEEP TIER 1, mechanism/impact tension flagged — `aria/competitor-watches/route.ts:61-70,147-158`
Confirmed: GET/POST use `business_id` from client/query with zero check via `supabaseAdmin`; DELETE
in the same file correctly checks. GET's auto-seed branch performs a real WRITE (insert) for the
guessed `business_id` AND triggers real external API calls (Google Places, Gemini) that ALSO write
into `competitor_price_cache` for that unchecked id — a zero-cost-to-attacker way to burn a
victim's shared Gemini rate-limit budget and pollute their real competitor-tracking feature.
Mechanism matches Tier 0's zero-check-WRITE prong; the written data itself (a competitor name
list) has no money/PII value on its own, so Tier 1 (resource-exhaustion + pollution, not data
theft) is the right call — but name the actual risk driver explicitly rather than under-weighting
it as "just" a low-value data write.

### 1.8 → DOWNGRADED TIER 3 (live-verified NOT exploitable) — `pos/customers/route.ts:178` (PATCH)
Confirmed the code gap exactly as described: `.update({...body, ...consentPatch,
...encryptCustomerPII(body, bid)}).eq('id', id).eq('business_id', bid)` has no field allowlist —
nothing in the *application code* stops `body.business_id` from being spread into the SET clause.
**Live-verified via `pg_policies` before finalizing this tier** (matching BUG-HUNT-1's own
discipline of checking RLS before flagging): `pos_customers` carries exactly one policy,
`biz_customers`, `cmd: ALL`, `qual: business_id IN (SELECT id FROM businesses WHERE user_id =
auth.uid())`, **`with_check: NULL`**. Per Postgres RLS semantics, an `ALL` policy with no explicit
`WITH CHECK` uses the `USING` expression (`qual`) for both read-visibility AND the post-write
check — meaning an UPDATE that sets `business_id` to a value the caller doesn't own gets its
*resulting* row checked against that same `qual` and is rejected by RLS before it commits. This
route uses `createServerSupabaseClient()` (anon key + user session, NOT `supabaseAdmin`), so RLS
is fully in effect here. **The cross-tenant row-injection this code gap looks like it should allow
is blocked at the database level.**
VERDICT: real code-level gap (no allowlist — worth closing as defense-in-depth, since relying on
RLS alone to cover an app-level mistake is exactly the pattern RULE 7 warns against), but not
currently exploitable. Tier 3, not Tier 0 — this is the one item in this re-score where deeper
checking *lowered* the severity rather than raising it.

### 1.9 → RE-RANKED TIER 0 — `pos/price-points/route.ts:15-34` (GET)
Confirmed exactly as described, and this may be the single most severe *re-ranked* item: `let
query = supabase.from('pos_price_points').select('*').order('quantity'); if (product_id) ...; if
(outlet_id) ...` — PATCH/DELETE in the same file correctly verify product ownership via a join;
GET has no business scoping and doesn't require either param. Omitting both returns **every
tenant's** quantity-break pricing AND `cost`/`margin_percent` in one call — a one-shot,
platform-wide financial-data dump requiring zero enumeration/guessing of any id at all. This is
Tier 0's second prong ("a chain that reaches real money/financial-data exfiltration across
tenants") in its most direct possible form — not a chain, a single unparameterized GET.

### Part A summary table
| Item | Original | Re-scored | Driver |
|---|---|---|---|
| 1.1 mobile-session/submit | Tier 1 | **Tier 0** | unconditional zero-check session-completion WRITE |
| 1.2 mobile-session PATCH | Tier 1 | **Tier 0** | total omission, no mitigating factor |
| 1.3 timed-prices PATCH/DELETE | Tier 1 | **Tier 0** | live price manipulation, same class as fixed 0.5 |
| 1.4 production-plan PATCH | Tier 1 | Tier 1 (mechanism flagged) | zero-check WRITE, but low-stakes data |
| 1.5 products/generate-image | Tier 1 | **Tier 0** | structural match to fixed 0.5 |
| 1.6 customer-intel | Tier 1 | Tier 1 (confirmed, top-of-tier) | correct bucket, understated in original |
| 1.7 competitor-watches | Tier 1 | Tier 1 (confirmed) | zero-check WRITE but low-value data |
| 1.8 pos/customers PATCH | Tier 1 | **Tier 3** (downgraded) | live RLS blocks the actual exploit |
| 1.9 price-points GET | Tier 1 | **Tier 0** | one-shot platform-wide financial-data dump |

---

## PART B — Coverage completion (227 files, all read in full)

`api/dashboard` (8 files), `api/social` (42 files — the task's own "~5" estimate was stale;
audited the real, current count), `api/training` (7 files), and the remaining `api/aria` files
not already covered by BUG-HUNT-1 or re-scored in Part A above. Findings below, ranked by real
risk within each tier.

## NEW TIER 0 — CRITICAL

### B.0.1 — `social/generate-video`: leaks the platform's live third-party API key to any authenticated user, plus fully unchecked cross-tenant writes
**`src/app/api/social/generate-video/route.ts:53-66,86,121-182,218-221`**

Two independent critical issues in the same route:
1. **The raw `HIGGSFIELD_API_KEY` is returned in the JSON response** (`hf_key: rawKey`, ~line
   151-161) to any logged-in user of any tenant, no admin check. Any authenticated business owner
   on the platform — including a trial signup — can extract this shared key and use it directly
   against Higgsfield's API outside the platform entirely, billed to the platform's own account,
   with no per-tenant quota or attribution.
2. **`business_id` is required but never checked against the authenticated user** anywhere in
   POST/PATCH/GET (no `businesses` ownership query at all), and `post_id` is used unchecked in
   `supabaseAdmin` writes to `social_posts.video_url`/`fal_request_id` and `reel_usage_log` — the
   admin client bypasses RLS, so there is no database-level backstop either. An attacker can
   inject fabricated video URLs/usage-log rows into another business's real posts and billing
   ledger by guessing/enumerating `post_id`.
This is the single most severe finding across BUG-HUNT-1 and BUG-HUNT-2 combined — API-key
exfiltration has essentially unbounded blast radius (unlimited off-platform resource theft billed
to the platform), independent of and worse than any single cross-tenant row-level bug found so
far.

---

## NEW TIER 1 — HIGH

### B.1.1 — `aria/influencer/generate`: missing admin gate lets any tenant harvest another business's real revenue and reviews
**`src/app/api/aria/influencer/generate/route.ts:85-121`**

Only checks `if (!user)` — no `isAdminEmail()` gate, unlike the sibling admin surface for the same
feature (`api/admin/influencer/approve/route.ts` correctly requires `isAdminEmail`). Any
authenticated business-owner (of any tenant) can POST `{business_id: '<any-other-business-uuid>'}`
and the route pulls that business's real weekly revenue (`pos_sales.total_amount` sum), top
product, and latest 5-star review content (including reviewer name) via `supabaseAdmin` with zero
ownership check, feeds it into an AI-generated Instagram caption, and persists/returns it. A
competitor can harvest another business's real revenue and review content this way.

### B.1.2 — `aria/roster/notify` + `aria/roster` PATCH: cross-tenant staff PII leak that culminates in a real, unsolicited SMS
**`src/app/api/aria/roster/notify/route.ts:45-51`** (leak), **`src/app/api/aria/roster/route.ts:265`** (enabling gap)

`roster/route.ts` PATCH accepts the entire client-supplied `shifts` array with no validation that
any `staff_id` inside it belongs to the caller's own business. `roster/notify` then resolves
`staffIds` straight out of that stored `shifts` JSON and queries `supabaseAdmin.from('pos_users')`
and `staff_members` (selecting `phone, mobile, personal_email, work_email`) via `.in('id',
staffIds)` with **no business_id filter on either query**. Chaining the two: an attacker injects a
foreign business's real `staff_members.id` into their own roster's shifts, then calls notify to
(a) read that stranger's phone/email cross-tenant with zero ownership check, and (b) **actually
send them a real SMS** ("Your roster for week of...") via `sendSMS` — a genuine unauthorized
external action against a real person's real phone number, not just a data leak. Both files must
be fixed together (matches BUG-HUNT-1's own "both halves need fixing" pattern from 0.4).

### B.1.3 — `aria/studio/influencer-video`: unchecked `business_id` write burns a shared AI-generation budget against any tenant
**`src/app/api/aria/studio/influencer-video/route.ts:146-159`**

`body.business_id` is used directly in a `supabaseAdmin.from('aria_studio_assets').insert(...)`
with zero ownership check — not even fetched/compared against the caller's business. Any
authenticated user can inject an attacker-chosen AI-generated video/prompt into another tenant's
studio asset library (which that tenant's own `GET /api/aria/studio` reads back scoped by their
own bid) and burn the shared Google Veo generation budget targeting a victim business at will.

### B.1.4 — `social/media` DELETE: zero-check delete of any business's media-library row
**`src/app/api/social/media/route.ts:106-108`** (DELETE), companion **`:22`** (GET override)

DELETE takes `id` from the query string and calls `supabaseAdmin.from('business_media').delete().eq('id', id)`
with no ownership check at all — any authenticated user can delete another business's media-library
row (photos, AI-generated descriptions) by guessing/enumerating its UUID. GET in the same file lets
a client-supplied `business_id` override the session-derived one, adding a companion cross-tenant
read of the same library.

### B.1.5 — `social/generate-image`: unchecked `post_id`/`business_id` write via admin client
**`src/app/api/social/generate-image/route.ts:171,220-225`**

`post_id` is used directly in `supabaseAdmin.from('social_posts').update({image_url,
image_credit}).eq('id', post_id)` with no check that it (or the also-accepted but never-verified
`business_id`) belongs to the caller — `supabaseAdmin` bypasses RLS, so no database backstop
exists. An attacker can overwrite the generated image/credit on any other business's post by
guessing/enumerating its UUID.

---

## NEW TIER 2 — MEDIUM

- **`aria/activity-narrative`** (`route.ts:111-112`) — client `business_id` used with zero
  ownership check (unlike this file's own documented fallback pattern), reading `activity_log`,
  `pos_sales`, `stock_movements`, `reviews` for AI narrative generation. Confirmed via tracked
  migrations: `pos_sales`/`stock_movements` DO have RLS scoping to `auth.uid()`; `activity_log` and
  `reviews` have **no RLS policy at all** in any tracked migration — a guessed `business_id` pulls
  another tenant's activity feed and review ratings with no backstop.
- **`aria/business-health-quick`** (`route.ts:54-56`) — same client-`business_id`-override pattern
  as the already-documented `price-intelligence`/`pos-insight`, but this specific file wasn't on
  that list — leaks another tenant's stock levels, customer-lapse rates, staff visa-expiry counts,
  and weekly revenue trend in one call.
- **`aria/competitive-brief`** (`route.ts:21-41`) — unscoped `business_id` from `searchParams`
  reads another tenant's competitor-pricing snapshots and internal alert text.
- **`aria/competitor-prices/auto-adjust` PATCH** (`route.ts:53-61`) — confirms and upgrades
  BUG-HUNT-1's own "unconfirmed, worth a second look" note: the check is fully absent, not
  RLS-backed. `action_id` fetched with zero business filter; the resulting price WRITE to
  `pos_products` is scoped only by the fetched row's `product_id`, also unchecked. Narrower than
  Tier 0/1 since exploiting it requires the target action to already be owner-approved.
- **`aria/compliance` PATCH** (`route.ts:130-138`) — the only handler in the file with zero
  business check (GET/POST correctly derive `bid`); toggles another business's compliance
  checklist item by guessing its id.
- **`aria/generate-quote` PATCH** (`route.ts:191-196`) — same mass-assignment shape as the
  already-documented `pos/customers` PATCH, applied to `quotes` — WHERE is correctly scoped, but no
  field allowlist means `business_id` could be included in the spread. (Not live-verified against
  RLS in this pass, unlike 1.8 above — worth the same check before a fix sprint prioritizes it.)
- **`aria/influencer/publish`** (`route.ts:20-42`) — same missing-`isAdminEmail()` gap as B.1.1, but
  narrower: the target `post_id` must already be owner-approved, so this only lets a non-admin
  trigger an already-approved publish action, not harvest new cross-tenant data.
- **`aria/pos-suggestions`** (`route.ts:23,56-61`) — client `business_id` override with zero
  ownership check (same shape as `price-intelligence`/`pos-insight`, different file), reading
  product pricing/stock/track_stock; compounded by an unscoped cross-tenant `pos_sale_items` read
  (lines 28-44, keyed by client `cart_item_ids`) feeding the co-purchase engine before the final
  business-scoped read.
- **`aria/supplier-ai-suggestions`** (`route.ts:22` GET, `:39-54` PATCH) — two issues: GET has the
  classic override pattern (`searchParams.get('business_id') ?? getBid(...)`), returning another
  tenant's supplier reorder suggestions; PATCH never derives or checks `bid`/ownership at all,
  letting any user flip `accepted` on another business's suggestion row by guessing its id.
- **`aria/winback-sequence`** (`route.ts:63,101-114`) — unlike its sibling `winback-send` in the
  same folder, never verifies client-supplied `customer_ids` belong to the verified `business_id`
  before building `campaign_sends` rows. Full severity depends on how the (unaudited in this pass)
  downstream send-processing worker resolves contact info from `customer_id` — flagged as a
  genuine gap, with the exact follow-up trace named for whoever picks this up.
- **`social/token-status`** (`route.ts:8-17`) — never checks client `business_id` belongs to the
  caller, returning any business's connected-platform list, token expiry dates, and linked account
  names to any authenticated user.

---

## NEW TIER 3 — LOW

- **`aria/ask/route.ts`** escalate branch (`:2267`) — `aria_conversations.update({has_escalated:
  true}).eq('id', conversationId)` scoped only by the client id, unlike every other write to this
  table in the same file (which either include a business filter or reuse an already-verified id).
  Boolean flag only, no data exfiltration.
- **`aria/badge-counts`** (`route.ts:54-55`) — same unguarded-`business_id` pattern as
  activity-narrative, but only aggregate counts are exposed (e.g. "5 reviews awaiting reply"), not
  row-level records.
- **`aria/recipe-scale`** (`route.ts:14-17,52-58`) — unverified client `business_id` reaches only an
  `aria_ai_calls` telemetry insert (cost-ledger pollution), no sensitive read/financial write
  reachable since `ingredients` are entirely client-supplied.
- **`aria/test-tools`** — unlike its sibling `test/route.ts` (already gated behind `isAdminEmail`
  per the already-fixed SECURITY-P1 C-07), this route only requires *any* authenticated user, and
  exposes `OPENAI_API_KEY_PREFIX`/`GEMINI_API_KEY_PREFIX` plus triggers real paid OpenAI/Gemini
  test calls on every hit. Same issue class as C-07, just never given the same fix.
- **`social/reels-addon`** GET (`route.ts:13-21`) — checks login only, not ownership; leaks any
  business's reels-addon enabled flag/acceptance timestamp (POST in the same file is correct).
- **`social/video-status`** (`route.ts:48-57`) — `job_id` passed straight to Runway/Replicate with
  no ownership check; anyone who learns/guesses another business's `job_id` can poll its status and
  retrieve the completed video URL.
- **Six `social/*` items, live-RLS-verified as NOT currently exploitable, flagged for
  defense-in-depth only** (methodology matches this report's own 1.8 downgrade): `callback/tiktok`
  and `connect/tiktok` (state/business_id trusted with no app-level check, but `social_connections`'
  RLS `WITH CHECK` blocks the write), `google/callback` and `google/connect` (same shape, same
  confirmed RLS backstop — `google/callback` also has no session-auth check at all and swallows the
  upsert error silently, a RULE 7 gap worth closing independent of RLS), `social/inbox` PATCH and
  `social/library` DELETE (both missing the ownership check their sibling handlers in the same file
  have, both confirmed blocked by their tables' RLS `WITH CHECK`).

---

## Coverage — read this before assuming exhaustiveness

- **Part A**: all 9 Tier 1 files re-read in full against current code (not re-derived from the old
  report text). One live RLS check performed (`pos_customers`) where a code-level gap's real
  exploitability depended on it.
- **Part B**: all 227 files across `api/dashboard` (8), `api/social` (42 — the actual current
  count, not the task's stale ~5 estimate), `api/training` (7), and every remaining `api/aria` file
  not already covered by BUG-HUNT-1 or re-scored above, read in full by 9 parallel passes. Live RLS
  verification performed for every `api/social` finding riding on the RLS-scoped (non-admin)
  client, matching BUG-HUNT-1's own discipline — six findings were downgraded to Tier 3 on that
  basis rather than over-reported.
- `api/training` (7 files) is fully clean — consistently uses `getBid()` plus explicit nested
  ownership helpers (`ownsCourse()`, `ownsQuizLesson()`), the most consistently-defended surface
  audited in either sprint.
- `api/dashboard` (8 files) is fully clean.
- Not independently re-verified in this pass: whether `aria/generate-quote` PATCH's mass-assignment
  gap is RLS-backstopped the way `pos/customers` PATCH (1.8) was confirmed to be — flagged
  explicitly above as the one open question a fix sprint should resolve before deciding whether it's
  a real Tier 2 or a Tier 3 like 1.8.
- Not traced in this pass: `aria/winback-sequence`'s downstream `campaign_sends` processing
  worker — its real severity depends on whether that worker re-verifies `customer_id` ownership,
  named explicitly as the next step for whoever picks this finding up.

## Cross-references confirmed, not re-reported

All 6 original Tier 0 items (0.1-0.6): confirmed fixed via `c4636b2e`, `40c16eb7`, `f86dc5f8`. All
9 original Tier 1 items: re-examined above, not re-reported as new. Original Tier 2/3 items
(`price-intelligence`, `pos-insight`, `product-insights`, `splits/reassign-item`,
`splits/ai-suggest`, `expiry-alerts`, `split-groups/members`, `pos/migrate` GET, Basiq callback,
`outlet-tax-overrides`, `aria/outcomes`, `competitor-opportunities`, `menu-optimisation`,
`social-listening`, `loyalty/referrals`, `laybys`/`sales/draft`, `transfers/transition`,
`competitor-prices/auto-adjust` — this last one now upgraded from "unconfirmed" to confirmed-Tier-2
above, not duplicated): skipped throughout Part B per the exclusion list given to every audit pass.
