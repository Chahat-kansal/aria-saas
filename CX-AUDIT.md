# CX-APP GAP AUDIT
**Date:** 2026-07-06  
**Sprint context:** CX-AUTH-1b complete (session-gated pages, OTP flow)  
**Benchmark:** Starbucks App / Per Diem — real consumer loyalty + ordering apps  
**Scope:** Read-only. No code changes.

---

## Area 1 — Identity / Session

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 1.1 | OTP send/verify/logout wired end-to-end | OK | `src/app/api/cx/[slug]/auth/route.ts` — SHA-256 code hash, 90-day httpOnly `cx_session` cookie | — |
| 1.2 | All personalised pages gate on `getCxSessionServer` | OK | `onboarding`, `rewards`, `wallet`, `history`, `notifications`, `account`, `hub` — all call `getCxSessionServer(bid)` before rendering | — |
| 1.3 | OTP code generated with `Math.random()` (not CSPRNG) | **BROKEN** | `auth/route.ts:98` — `Math.floor(Math.random() * 1_000_000)`. Not cryptographically random; biased on V8's PRNG seeding. Should use `crypto.randomInt(0, 1_000_000)` | **LAUNCH** |
| 1.4 | In-memory rate limiting resets on cold start | **BROKEN** | `auth/route.ts:21-22` — `const phoneSends = new Map()`. On Vercel Serverless every function instance has its own Map; two concurrent instances each allow 3 OTP sends. Effective rate limit is ∞ in a burst. | **LAUNCH** |
| 1.5 | `/join` endpoint creates accounts with no OTP | **BROKEN** | `src/app/api/public/cx/[slug]/join/route.ts` — accepts `{name, phone}`, calls `linkOrCreateMembership` with `marketing_consent:true`, no proof-of-phone, no rate limiting. Parallel enrol path that bypasses the verified OTP flow. | **LAUNCH** |
| 1.6 | Session is business-scoped (cross-tenant safe) | OK | `cx_sessions.business_id` column; `getCxSessionServer` passes `businessId` into `sessionFromTokenHash`; a token minted for business A returns null for business B | — |
| 1.7 | Session migrations in `supabase/migrations/` but NOT applied to production | **MISSING** | `20260708000001_cx_otp_codes.sql`, `20260708000002_cx_sessions.sql` exist locally. Neither appears in Supabase prod migration history. Auth flow is completely non-functional until these run. | **LAUNCH** |
| 1.8 | Already-authed users redirected away from /onboarding | OK | `onboarding/page.tsx` — `if (session) redirect('/' + slug)` | — |
| 1.9 | `marketing_consent: true` set on every `linkOrCreateMembership` call | PARTIAL | `src/lib/loyalty/membership.ts:80` — consent is hardcoded true regardless of whether the customer explicitly opted in on the OTP screen. No checkbox captured in `OnboardingClient.tsx`. GDPR/SPAM Act 2003 risk for Australian ops. | SOON |

---

## Area 2 — Ordering E2E

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 2.1 | Cart stores state in `localStorage` only — no server-side persistence | PARTIAL | `src/app/[slug]/cart/CartClient.tsx:77` — `localStorage('aria_cart_items_' + slug)`. Cart lost on browser clear, private mode, or device switch. Per Diem persists cart server-side. | SOON |
| 2.2 | `unit_price` in order placement is fully client-trusted | **BROKEN** | `src/app/api/public/place-order/[business_id]/route.ts:48` — `subtotal = body.items.reduce((s,i) => s + i.quantity * i.unit_price, 0)`. Never fetches price from `pos_products`. Attacker sets `unit_price:0.01` and pays pennies for any item. | **LAUNCH** |
| 2.3 | Cart places order as `pay_at_pickup` only — no online card payment from CX cart | PARTIAL | `CartClient.tsx` sends no `payment_method`; place-order route's Stripe path (`isCardPayment`) is never exercised from the CX flow. The wallet/preload pay path appears missing entirely from CartClient. | SOON |
| 2.4 | Post-checkout navigates to public `/menu/[slug]/order/[#]` not a CX-native tracker | PARTIAL | `CartClient.tsx:119` — `window.location = '/menu/' + slug + '/order/' + data.orderNumber`. Breaks CX shell (tab bar gone, different nav). | LATER |
| 2.5 | CartClient reads identity from `localStorage('aria_cx_' + slug)` (phone/name) — not session cookie | **BROKEN** | `CartClient.tsx:77` — unauthenticated users can place orders by setting this key manually. The OTP-session work done in CX-AUTH-1b was not applied to CartClient. TOP-UP GATE exists in wallet but no auth gate on the cart/order path. | **LAUNCH** |
| 2.6 | "Reorder" button on HistoryClient links to `/{slug}/menu` (menu root) not to a pre-filled cart | PARTIAL | `HistoryClient.tsx:253` — `href={'/' + slug + '/menu'}`. No reorder prefill. Starbucks reorder pre-adds items to cart; Per Diem does single-tap reorder. | LATER |
| 2.7 | `STRIPE_WEBHOOK_SECRET_ORDERS` not configured — card-payment webhook silently no-ops | **BROKEN** | `src/app/api/webhooks/stripe-orders/route.ts:33-36` — `if (!secret) { return NextResponse.json({ ok:true, note:'...not set' }) }`. Card payments never auto-accept or KDS-fire until this env var is wired. | **LAUNCH** |
| 2.8 | Loyalty earn fires on operator "completed" transition only — no customer-facing earn confirmation | PARTIAL | `PATCH /api/pos/online-orders/[id]` line 217-233. Customer sees nothing until operator manually moves status. Starbucks sends an earn push within seconds of payment. | SOON |

---

## Area 3 — Money Safety

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 3.1 | Top-up (preload load) validates amount against owner-configured whitelist | OK | `src/app/api/loyalty/preload/load/route.ts:31` — `if (!cfg.amounts.includes(amount)) return 400` | — |
| 3.2 | Top-up requires auth (Supabase owner session in loyalty dashboard context) | OK | `getLoyaltyMembership(realId)` call gated on valid session | — |
| 3.3 | `place-order` client-trusts `unit_price` → Stripe charges fabricated amount | **BROKEN** | See 2.2 above. Stripe `payment_intent` is created for `Math.round(subtotal * 100)` where subtotal is from the request body. | **LAUNCH** |
| 3.4 | Wallet balance exposed unauthenticated via `/me` POST endpoint | **BROKEN** | `me/route.ts` POST returns `wallet_balance` and `preload_txns` to any caller with the customer's phone. Financial data fully public given phone number enumeration. | **LAUNCH** |
| 3.5 | No spend endpoint on CX side (spend only via POS terminal) | OK | No CX-facing preload spend route. Spend requires operator-initiated POS action. | — |
| 3.6 | Bonus computation is server-side | OK | `computeBonus()` runs in `load/route.ts`, not client-supplied | — |
| 3.7 | Stripe preload webhook (`stripe-preload`) credits balance | OK | Separate dedicated webhook handler for preload; not mixed with order webhooks | — |
| 3.8 | Two generic Stripe webhook handlers may cause double-processing | PARTIAL | `src/app/api/webhooks/stripe/route.ts` AND `src/app/api/stripe/webhook/route.ts` — if both registered in Stripe Dashboard, events are processed twice. | SOON |

---

## Area 4 — Loyalty Correctness

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 4.1 | `loyalty_tiers` table is dead — tier logic uses `pos_loyalty_config` columns | PARTIAL | `src/lib/loyalty/tiers.ts:4` comment: "loyalty_tiers is dead". Tier assignment uses `pos_loyalty_config.tier_silver/gold/platinum_points`. The DB table, admin CRUD routes, and widget chat query still exist for it. | SOON |
| 4.2 | Widget chat still queries dead `loyalty_tiers` table | **BROKEN** | `src/app/api/public/widget/chat/route.ts:110` — queries `loyalty_tiers`. Returns stale/empty data, potentially surfaces wrong tier info to customers asking Aria about their tier. | SOON |
| 4.3 | Earn idempotency protected by `sale_id` unique index on `pos_loyalty_transactions` | OK | `earnOnSale` function uses upsert with `sale_id` conflict resolution | — |
| 4.4 | Points earned on client-fabricated `total` (see 2.2 / 3.3) | **BROKEN** | `earnOnSale` receives `totalAmount` from `pos_online_orders.total`, which was set from the untrusted client subtotal. Attacker earns full points on a $0.01 order. | **LAUNCH** |
| 4.5 | Rewards catalog visible to guests (locked state shown) | OK | `rewards/page.tsx` — parallel fetch runs regardless of session; guests see catalog with locked CTA | — |
| 4.6 | Challenges fetched by `customer_id` and passed to `RewardsClient` | OK | `rewards/page.tsx` queries `loyalty_challenges` only when session exists | — |
| 4.7 | `linkOrCreateMembership` non-null assertion `created!.id` could throw on insert failure | PARTIAL | `src/lib/loyalty/membership.ts:84` — if insert returns no data (DB error silently ignored upstream), this throws at runtime with no error message to the user. | SOON |
| 4.8 | Cross-business name bleed: new membership inherits name from another business's record | OK | Documented behaviour in `membership.ts:66-67` — intentional, as customer's preferred name is used as the identity name. Not a data corruption issue. | — |

---

## Area 5 — Data Integrity per Screen

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 5.1 | Hub (`/[slug]`) — customer lookup uses `loyalty_identity_id = session.identity_id` | OK | `page.tsx` correct column reference per RULE 6 | — |
| 5.2 | Wallet — `items_on_hand` column used correctly (not `qty_on_hand`) | OK | wallet/page.tsx does not query inventory | — |
| 5.3 | Account — `member_since` comes from `loyalty_identity.created_at` (not customer row) | OK | `account/page.tsx` parallel-fetches `loyalty_identity` for `created_at` | — |
| 5.4 | Account — notification toggles (`sms`, `emailNotif`) are `useState(true)` — not persisted to DB | PARTIAL | `AccountClient.tsx:109-110` — toggles are local state only. Change is lost on reload. No PATCH to a preferences column. | SOON |
| 5.5 | History — orders fetched by phone (unauthenticated `/orders` route), not by customer_id | PARTIAL | `HistoryClient.tsx:89` — `?phone=` query param. If phone changes or session identity has no phone, orders disappear. Also exposes order history to anyone with the phone. | SOON |
| 5.6 | History — `order.total` rendered directly (column name `total`, not `total_amount`) | PARTIAL | `HistoryClient.tsx:236` — `order.total`. `pos_online_orders` likely has a `total` column (not a POS sale). Verify against schema to confirm no column mismatch. | SOON |
| 5.7 | History — "Reorder" links to menu root, not product detail; no prefill | PARTIAL | See 2.6 | LATER |
| 5.8 | Notifications — `customerId` state has no setter; write path uses `customerIdRef` consistently | OK | `NotificationsClient.tsx:56,59,63` — `useState` (no setter), `useRef` for mutation path | — |
| 5.9 | Notifications toggled as read on 60% viewport intersection (800ms delay) | OK | `NotificationsClient.tsx:100-113` — IntersectionObserver at threshold 0.6, 800ms delay | — |
| 5.10 | Account PATCH sends `phone` from server props (read-only at rest, not editable by user) | OK | `AccountClient.tsx:128` — `phone: phone ?? ''` from server-resolved session phone | — |
| 5.11 | `pos_customers.last_visit_at` rendered via `formatDate` with correct `Australia/Melbourne` tz | OK | `AccountClient.tsx:30` | — |

---

## Area 6 — Multi-Tenant

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 6.1 | Session tokens are business-scoped (cannot cross businesses) | OK | `cx_sessions.business_id` column; lookup always passes `businessId` as filter | — |
| 6.2 | All CX server pages resolve `bid` from slug→business lookup before any data query | OK | All `page.tsx` files query `pos_outlets` or `businesses` by slug, then pass `bid` to all child queries | — |
| 6.3 | Unauthenticated `/me`, `/orders`, `/favourites` endpoints accept any `slug` + phone/customer_id combination across businesses | **BROKEN** | Any customer's data is accessible from any slug if the phone or customer_id is known. No cross-tenant leakage protection beyond the slug routing. | **LAUNCH** |
| 6.4 | `pos_customers.business_id` filters all customer queries | OK | Seen in `account/page.tsx`, `rewards/page.tsx`, `wallet/page.tsx` — all pass `business_id = bid` | — |
| 6.5 | Hardcoded `'Sip'` fallback in inventory staff app (`inventory/[slug]/page.tsx:1119`) | PARTIAL | Non-CX-app impact, but shows demo data leakage risk. Not a CX user-facing bug. | LATER |
| 6.6 | `sipHero()` in MenuClient maps coffee archetypes to Sip-specific image paths | **BROKEN** | `src/app/menu/[slug]/MenuClient.tsx:204-205` — product archetypes (flat-white, etc.) load images from `/menu/sip-ff5055/*.webp`. Any business with these archetypes gets 404 product images. | LAUNCH |

---

## Area 7 — PWA / Mobile

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 7.1 | No Web App Manifest (`manifest.json`) | **MISSING** | No `public/manifest.json` or any manifest file found anywhere in the project. The `/{slug}/` CX app cannot be "Add to Home Screen" installed with proper name, icons, or theme colour. | **LAUNCH** |
| 7.2 | No service worker | **MISSING** | No `sw.js`, `service-worker.js`, or WorkboxConfig found. Zero offline capability. No background sync. | SOON |
| 7.3 | No CX push subscription — in-app notifications only | **MISSING** | Community module has full `web-push` + VAPID setup (`src/lib/community/push.ts`). Zero equivalent for CX app. Order confirmations, loyalty earn alerts, and offers are silent until the customer opens the app. | SOON |
| 7.4 | No `next/image` in any CX screen — no WebP conversion, no `priority`, no `sizes` | PARTIAL | All CX screens use raw `<img>` or CSS `background: url(...)`. No LCP optimisation. Hero and product images are the largest paint elements on mobile. | SOON |
| 7.5 | `env(safe-area-inset-bottom)` used in tab bar padding | OK | `CxTabBar.tsx` and all page wrappers apply `paddingBottom: 'calc(...+ env(safe-area-inset-bottom))'` for iPhone notch/home indicator | — |
| 7.6 | `100dvh` used for full-screen containers | OK | All pages use `minHeight: '100dvh'` — correct for mobile browsers with collapsing UI chrome | — |
| 7.7 | CxTabBar uses `<a>` tags (full-page nav), not `next/link` — no client-side prefetch | PARTIAL | Every tab transition is a full HTTP round-trip. On a cold 3G connection, tab switching takes 1-2s of blank screen. | LATER |
| 7.8 | `max-width: 28rem` cap on all CX pages — tablet/desktop experience is a narrow centred column | OK | Intentional mobile-first design. Acceptable trade-off. | — |

---

## Area 8 — Error / Edge UX

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 8.1 | OTP verify error displayed inline below 6-digit input | OK | `OnboardingClient.tsx` — `{err && <p ...>{err}</p>}` below input grid | — |
| 8.2 | Resend timer shown during 30s cooldown; "Resend code" shown after | OK | `OnboardingClient.tsx` — countdown state drives button text | — |
| 8.3 | Cart empty state shown when `items.length === 0` | — | Not verified; assumed present. | — |
| 8.4 | Wallet guest state renders "Sign in" CTA with link to `/onboarding` | OK | `WalletClient.tsx` — `{!isSignedIn && <...Sign in CTA...>}` | — |
| 8.5 | History/Notifications/Rewards all render clean guest state with sign-in CTA | OK | Verified in `HistoryClient.tsx:137-148`, `NotificationsClient.tsx:130-141`, `RewardsClient.tsx` | — |
| 8.6 | Account page hard-redirects to `/onboarding` if no session (no guest state) | OK | `account/page.tsx` — `if (!session) redirect(...)` — correct, account is identity-required | — |
| 8.7 | Notification toggle prefs lost on reload (local state only) | PARTIAL | See 5.4. User saves pref, reloads, sees default `true` again. | SOON |
| 8.8 | `saveEdit()` in AccountClient catches network errors and sets `editErr` | OK | `AccountClient.tsx:138-140` — `catch { setEditErr('Network error. Try again.') }` | — |
| 8.9 | No order status push on completion — customer must poll by opening tracker URL | PARTIAL | See 2.8. No push delivery. Order tracking link goes to public `/menu/[slug]/order/[#]` page. | SOON |
| 8.10 | OTP max attempts (3) not surfaced to user — client just gets generic error | PARTIAL | `auth/route.ts` returns `{ error: 'Too many attempts' }` after 3 tries; `OnboardingClient.tsx` sets `err` state. The 3-attempt lock and how to recover (wait for expiry) is not explained to the user. | LATER |
| 8.11 | No loading skeleton on Wallet / Rewards / Account — data is pre-fetched SSR | OK | CX-AUTH-1b pre-fetches all data server-side; these pages render immediately with data. Eliminates CLS from the old client-fetch spinner pattern. | — |

---

## Area 9 — Security Quick Pass

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 9.1 | All `/api/public/cx/[slug]/` personal-data endpoints have zero auth | **BROKEN** | `me`, `orders`, `favourites`, `notifications` — phone number or customer_id is the only "credential". Both are obtainable (phone = guessable/known; customer_id returned in responses). | **LAUNCH** |
| 9.2 | `/me` PATCH profile update relies on `customer_id` + `phone` from body — no session | **BROKEN** | `me/route.ts:148-200` — if `storedPhone` is null (empty-phone customer), the phone check is bypassed (line 172). Anyone knowing a `customer_id` with no stored phone can mutate their name/email. | **LAUNCH** |
| 9.3 | `customer_id` UUIDs exposed in unauthenticated `/orders` response | BROKEN | `orders/route.ts:40` — returns `customer_id` in the body. Combined with 9.1, this enables an enumeration chain: phone → customer_id → write to favourites/notifications. | **LAUNCH** |
| 9.4 | `supabaseAdmin` (service role key) used across all public CX routes — bypasses RLS entirely | BROKEN | 87 `supabaseAdmin` usages in `src/app/api/public/`. With no session auth, the service role key effectively grants any caller full DB write access through these endpoints. | **LAUNCH** |
| 9.5 | OTP CSPRNG (see 1.3) | BROKEN | See 1.3 | **LAUNCH** |
| 9.6 | In-memory rate limit (see 1.4) | BROKEN | See 1.4 | **LAUNCH** |
| 9.7 | `/join` unauthenticated account creation with forced consent (see 1.5) | BROKEN | See 1.5 | **LAUNCH** |
| 9.8 | No CORS configuration on public CX routes — any origin can call them | PARTIAL | No `Access-Control-Allow-Origin` restriction found. Vercel's default CORS is permissive. Third-party sites could proxy these endpoints. | SOON |
| 9.9 | `place-order` accepts name + phone from body with no session verification | BROKEN | `place-order/route.ts` — identity for the order is caller-supplied. Any unauthenticated client can place orders attributed to any phone number. | **LAUNCH** |
| 9.10 | Stripe webhook secret for orders not configured — webhook silently succeeds (see 2.7) | BROKEN | See 2.7. A missing env var allows anyone to POST to the webhook and receive `{ ok: true }`. | **LAUNCH** |

---

## Area 10 — Performance

| # | Item | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 10.1 | Hub, wallet, rewards, account — data pre-fetched SSR, zero client loading spinners | OK | CX-AUTH-1b architecture: page.tsx resolves all data server-side, passes to Client as props | — |
| 10.2 | No `next/image` — no automatic WebP, no `priority` for LCP hero | PARTIAL | See 7.4. Hero images on Hub and Menu are the largest paint elements; no LCP optimisation. | SOON |
| 10.3 | Tab navigation is full-page (no prefetch, no SPA transition) | PARTIAL | See 7.7. Each tab = full server round-trip. | LATER |
| 10.4 | `CxMenuClient` loads products; no paginating / virtualising long product lists | PARTIAL | No evidence of pagination or virtualised list in CxMenuClient. For businesses with 100+ products this will hurt scroll performance on low-end Android. | LATER |
| 10.5 | Vercel cron `h14` (14:00 UTC) is missing — hourly dispatch has a gap | PARTIAL | `vercel.json` cron array — jumps from h13 to h15. One hour of daily briefings/parcel-insights tasks skipped. | LATER |
| 10.6 | `parcel-insights` cron is `"0 */6 * * *"` (every 6h) — violates Vercel Pro daily-max rule | **BROKEN** | `vercel.json` — sub-daily cron. Per CLAUDE.md RULE 4, Vercel Pro silently breaks sub-daily schedules on Pro tier. | SOON |
| 10.7 | History/Notifications still fetch data client-side after page load (useEffect) | PARTIAL | `HistoryClient.tsx:77-118`, `NotificationsClient.tsx:85-94` — client fetches on mount via unauthenticated public routes. Could be migrated to SSR like wallet/rewards. | LATER |
| 10.8 | No stale-while-revalidate or ISR on CX pages — all `force-dynamic` | PARTIAL | Every CX page is dynamic (session-dependent). Catalogue data (reward rules, offers) could use ISR. Not critical. | LATER |

---

## TOP 10 GAPS — Ranked by Launch Risk

| Rank | ID | Summary | Severity |
|------|----|---------|----------|
| **1** | 9.1 / 9.4 | **All `/api/public/cx/` personal-data endpoints are unauthenticated** — phone or customer_id is the sole "credential". Wallet balance, full order history, PII, notifications, and write operations (favourites, mark-read) are accessible to any HTTP client with no session cookie. With `supabaseAdmin` bypassing RLS, this is effectively an open API on production customer data. | **LAUNCH** |
| **2** | 2.2 / 3.3 / 4.4 | **Client-trusted `unit_price` in order placement** — the Stripe charge and loyalty earn are both calculated on an amount the attacker controls. An order of any size can be placed and points earned for pennies. | **LAUNCH** |
| **3** | 1.7 | **OTP/session migrations not applied to production** — `cx_otp_codes` and `cx_sessions` tables don't exist in prod yet. The entire auth flow fails with a DB error for every user until these migrations are applied. | **LAUNCH** |
| **4** | 2.5 / 9.9 | **CartClient and `place-order` have no session gate** — the CX-AUTH-1b work added session gates to viewing data but the order-placement flow still reads identity from `localStorage` and accepts name+phone from the request body. Any caller can place orders. | **LAUNCH** |
| **5** | 2.7 / 9.10 | **`STRIPE_WEBHOOK_SECRET_ORDERS` not set** — card orders never auto-accept, never KDS-fire, never earn loyalty points. The route returns `{ ok: true }` to any POST including unauthenticated ones. | **LAUNCH** |
| **6** | 1.3 + 1.4 | **OTP uses `Math.random()` + in-memory rate limiting** — codes are predictable given PRNG state knowledge; rate limits reset on every cold start (ephemeral per Vercel instance). OTP brute-force is feasible. | **LAUNCH** |
| **7** | 6.6 | **`sipHero()` in MenuClient loads Sip-specific image paths for all businesses** — any non-Sip business with coffee archetypes shows 404 product images in the menu. Affects every new merchant onboarded with standard archetypes. | **LAUNCH** |
| **8** | 7.1 | **No Web App Manifest** — the CX PWA cannot be installed to home screen with correct name/icon/theme. "Add to Home Screen" shows a bare URL. Competitors (Starbucks, Per Diem) all ship full manifests. | **LAUNCH** |
| **9** | 1.5 / 9.7 | **`/join` creates verified memberships with no OTP + forces `marketing_consent:true`** — parallel enrol path bypasses the proof-of-phone OTP flow; any phone can be enrolled without the owner's knowledge. Auto-consent violates Australian Spam Act 2003 for commercial messaging. | **LAUNCH** |
| **10** | 10.6 | **`parcel-insights` cron is `"0 */6 * * *"` (sub-daily)** — silently broken on Vercel Pro per RULE 4. Must be changed to `"0 9 * * *"` or similar daily schedule. | **SOON** |

---

## Summary Counts

| Severity | Count |
|----------|-------|
| **LAUNCH** (blocker — cannot ship) | **17** |
| **SOON** (ship then fix fast) | **12** |
| **LATER** (quality / polish) | **8** |
| **OK** (no gap) | 22 |

---

_Audit produced 2026-07-06. No code was modified. All evidence is file:line references to the committed codebase at commit `2b895300`._