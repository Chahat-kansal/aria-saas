# ARIA-WIDE AUTHZ AUDIT — SECURITY-AUTHZ-AUDIT.md
**Date:** 2026-07-06 | **Scope:** ALL `src/app/api/**` + public pages | **Method:** Static code analysis + pattern tracing (no live calls) | **Author:** aria-cso

---

## SUMMARY COUNTS

| Severity   | Count | Quick description |
|------------|-------|-------------------|
| CRITICAL   | 14    | Unauthed money/PII mutations, fake payment bypass, zero-gate AI cost attack, HMAC forge |
| HIGH       | 17    | IDOR, unauthed financial writes, stored XSS, PIN brute-force, mass assignment |
| MEDIUM     | 14    | Non-CSPRNG OTPs, fail-open rate limiter, unverified webhook MACs, weak CSP |
| LOW        | 7     | Fetch-before-check, missing UPDATE scope, excessive TTLs |
| SAFE       | 120+  | Correctly gated owner/CX/cron/Stripe routes |

---

## CLASSIFICATION BY DIMENSION

### A — Auth Source Per Route (dominant patterns)

| Pattern | Description | Count | Risk |
|---------|-------------|-------|------|
| `getUser()` + `getBid()` | Supabase JWT → session user → `user_active_business` / `businesses.user_id` | ~250 routes | LOW — safe pattern |
| `getCxSession()` cookie | SHA-256 token hash → `cx_sessions` table → `loyalty_identity_id` | 7 CX routes | LOW — correct |
| `verifyCronAuth()` Bearer | `Authorization: Bearer CRON_SECRET` | 88 `cron/` routes | LOW |
| Stripe `constructEvent` | Webhook signature with per-endpoint secret | 4 Stripe webhooks | LOW |
| `api_key` DB validation | Widget embed `api_key` looked up in `widget_configs` | 2 widget routes | LOW |
| Kiosk cookie `ariakiosk_${bid}` | Business-scoped session for in-store terminals | 4 instore/scan routes | LOW |
| `x-portal-token` raw OTP | 6-digit OTP stored plaintext in `portal_token` col | 2 staff-portal routes | **CRITICAL** |
| **NONE — unauthenticated** | Fully public, service-role client | 28 routes | VARIES (see E, G) |

**Key gap:** Auth logic (`getBid`/`getBusinessId`) is copy-pasted across ~250 route files. No shared `getAuthenticatedBusiness(req)` helper. A future discrepancy in one copy silently opens auth bypass.

---

### B — Tenant Scoping

| Model | Description | Routes | Risk |
|-------|-------------|--------|------|
| Session-derived | `business_id` fetched from `user_active_business` / `businesses.user_id` | ~240 | LOW |
| Client-trusted + verified | `business_id` from request, then `.eq('user_id', user.id)` check | ~15 | LOW |
| Client-trusted **unverified** | `business_id` from body/path, passed to `supabaseAdmin` with no ownership check | 6 | **CRITICAL/HIGH** |
| Path slug → resolve | `slug` → `resolveBusinessId()` (safe, server-resolves) | ~20 | LOW |
| No `business_id` needed | Admin panel or global operations | 16 admin routes | LOW |

**CRITICAL unverified cases:**
- `public/loyalty/[business_id]/balance` — phone+PII lookup for any business
- `public/instore/loyalty` — customer create/read for any business
- `loyalty/earn` — customer points read for any `customer_id` (no `business_id` scope)
- `aria/auto-review` — PII read + SMS send for any business's customer
- `pos/display-suggestions` — customer PII for any `customer_id`
- `crons/aria-intelligence` — sweeps ALL businesses unauthenticated when `CRON_SECRET` unset

---

### C — Identity Params Accepted From Client + Ownership Verification

| Route | Param | Ownership check? | Risk |
|-------|-------|-----------------|------|
| `public/cx/[slug]/me` | `body.phone`, `body.customer_id` | Dead param — session-derived ✓ | SAFE |
| `public/cx/[slug]/orders` | `?phone=` | Dead param — session-derived ✓ | SAFE |
| `public/cx/[slug]/favourites` | `body.customer_id`, `?customer_id=` | Dead params — session-derived ✓ | SAFE |
| `public/cx/[slug]/notifications` | `body.customer_id` | Dead param — session-derived ✓ | SAFE |
| `public/place-order/[business_id]` | `body.customer_name/phone/email/unit_price` | Dead params — session+server-priced ✓ | SAFE |
| `loyalty/earn` | `body.customer_id` | **NO** — supabaseAdmin query with no `business_id` filter | **HIGH** |
| `aria/auto-review` | `body.customer_id`, `body.sale_id` | **NO** — no `.eq('business_id', bid)` | **CRITICAL** |
| `pos/display-suggestions` | `body.customer_id` | **NO** — no `business_id` scope | **HIGH** |
| `staff-portal/verify` | `body.email` + OTP | Raw OTP returned as token | **CRITICAL** |
| `invoices/public/[id]` | `params.id` | UUID only, no secondary token | **HIGH** |
| `quotes/[id]/accept` | `params.id`, `body.name` | UUID only, no `acceptance_token` | **HIGH** |

---

### D — supabaseAdmin Usages With Client Input (RLS Bypass Inventory)

Service-role client (`supabaseAdmin`) bypasses ALL Row-Level Security. Every usage is an application-enforced auth boundary.

| File | Auth? | Client-supplied IDs? | Risk |
|------|-------|---------------------|------|
| `public/receipt/[sale_id]/route.ts` | **NONE** | `sale_id` from path | **CRITICAL** |
| `public/loyalty/[business_id]/balance/route.ts` | **NONE** | `business_id` + `phone` | **CRITICAL** |
| `public/instore/loyalty/route.ts` | **NONE** | `business_id` + `email` | **CRITICAL** |
| `public/menu/[business_id]/descriptions/route.ts` | **NONE** | `business_id` from path | **CRITICAL** |
| `loyalty/earn/route.ts` | Session (user) | `customer_id` — no `business_id` filter | **HIGH** |
| `aria/auto-review/route.ts` | Session (user) | `customer_id`, `sale_id` — no `business_id` | **CRITICAL** |
| `pos/display-suggestions/route.ts` | Session (user) | `customer_id` — no `business_id` | **HIGH** |
| `invoices/public/[id]/route.ts` | **NONE** (UUID gate) | `id` from path | **HIGH** |
| `invoices/public/[id]/paid/route.ts` | **NONE** | `id` from path | **HIGH** |
| `quotes/[id]/accept/route.ts` | **NONE** (UUID gate) | `id` from path | **HIGH** |
| `public/bookings/[business_id]/route.ts` POST | **NONE** | `business_id` from path | **HIGH** |
| `public/instore/recipe/route.ts` | **NONE** | `business_id` from body | **MEDIUM** |
| `public/order/[id]/status/route.ts` | **NONE** (anon key) | `id` from path | **MEDIUM** |
| `customers/[id]/summarise/route.ts` | Session ✓ | `id` fetched before ownership check | LOW |
| `customers/[id]/ai-summary/route.ts` | Session ✓ | same fetch-before-check | LOW |
| All `public/cx/*` routes | `getCxSession()` ✓ | identity from session | SAFE |
| All `cron/*` routes | `verifyCronAuth()` ✓ | server-side only | SAFE |
| All `pos/*` routes (except above) | `getUser()` + `getBid()` ✓ | session-derived | SAFE |

---

### E — Unauthenticated / Weakly-Authed Mutations

| Route | Method | Mutation | Auth | Risk |
|-------|--------|----------|------|------|
| `public/menu/[business_id]/descriptions` | POST | Writes AI descriptions to `pos_products` for any business | **NONE** | **CRITICAL** |
| `invoices/public/[id]/paid` | POST | Sets `invoices.status = 'pending_payment_confirm'` | **NONE** (UUID only) | **HIGH** |
| `quotes/[id]/accept` | POST | Sets `quotes.status = 'accepted'`, fires emails | **NONE** (UUID only) | **HIGH** |
| `quotes/[id]/view` | POST | Increments `quotes.view_count`, changes status | **NONE** | MEDIUM |
| `public/bookings/[business_id]` | POST | Creates bookings, sends confirmation email | **NONE** | **HIGH** |
| `webhooks/nps-response` | POST | Inserts NPS scores for any customer by phone | **NONE** (no Twilio sig) | **HIGH** |
| `public/cx/[slug]/join` | POST | Creates `loyalty_identity` + `pos_customers` | **NONE** (by design) | MEDIUM |
| `public/instore/loyalty` | POST | Creates `pos_customers` for any `business_id` | **NONE** | **CRITICAL** |
| `aria/artifact-parse-failure` | POST | Writes to `aria_ai_calls` log | **NONE** | HIGH |
| `pos/staff` (owner-authed) | POST/PATCH | Full body spread — role/PIN tampering possible | Session ✓ but mass-assign | **CRITICAL** |
| `staff/route.ts` (owner-authed) | POST | Full body spread — `portal_enabled`, `right_to_work_verified` | Session ✓ but mass-assign | **HIGH** |

---

### F — Webhook & Cron Protection

| Route | Protection | Issue |
|-------|-----------|-------|
| `webhooks/stripe` | `constructEvent(STRIPE_WEBHOOK_SECRET)` ✓ | SAFE |
| `webhooks/stripe-orders` | `constructEvent(STRIPE_WEBHOOK_SECRET_ORDERS)` | **CRITICAL** — returns HTTP 200 skipping sig verify when env var absent |
| `webhooks/stripe-preload` | `constructEvent(STRIPE_WEBHOOK_SECRET_PRELOAD)` | Returns 503 when unset ✓ |
| `webhooks/stripe-image-credits` | `constructEvent(STRIPE_WEBHOOK_SECRET_IMAGE_CREDITS)` | TOCTOU race on balance update |
| `webhooks/nps-response` | **NONE** — no Twilio HMAC verification | **HIGH** |
| `webhooks/clicksend-inbound` | `CLICKSEND_INBOUND_SECRET` or `CRON_SECRET` ✓ | SAFE |
| `webhooks/email-unsubscribe` | HMAC-signed `verifyUnsubToken` ✓ | SAFE |
| `cron/*` (88 routes) | `verifyCronAuth()` Bearer CRON_SECRET ✓ | SAFE |
| `crons/aria-intelligence` | `if (cronSecret && ...)` — fails **open** when CRON_SECRET unset | **CRITICAL** |
| `billing/[action]` (webhook path) | Stripe sig ✓ but uses session client (not supabaseAdmin) | MEDIUM — DB writes silently fail RLS |

---

### G — Public-By-Design Routes (Confirmed Zero PII, Zero Mutations)

These are intentionally public and correctly scoped:

| Route | Data returned | Confirmed safe |
|-------|--------------|----------------|
| `public/cx/[slug]/offers` | Active loyalty offers (no PII) | ✓ |
| `public/cx/[slug]/reward-rules` | Loyalty tier rules | ✓ |
| `public/menu/[business_id]` GET | Product catalogue (no customer data) | ✓ |
| `public/store/[slug]` GET | Store settings + catalogue | ✓ |
| `public/business/[business_id]` GET | Business name/address (anon key, RLS) | ✓ |
| `public/order-track/[orderNumber]` GET | Status, pickup_time only — no PII | ✓ |
| `public/widget/embed/[api_key]` | JS embed script (see XSS finding) | ⚠ HIGH (XSS) |
| `public/widget/chat` | AI chat (see rate limit finding) | ⚠ CRITICAL (no rate limit) |
| `community/feed` | Published post content | ✓ |
| `ping` | Health check | ✓ |
| `og/default` | OG image generation | ✓ |
| `loyalty/[business_id]` GET | Loyalty config (not customer data) | ✓ |

---

## CRITICAL FINDINGS — Full Detail

### C-01 · `public/receipt/[sale_id]` — Unauth PII dump for any sale UUID
**File:** `src/app/api/public/receipt/[sale_id]/route.ts`
**Auth:** NONE. Uses `supabaseAdmin`.
**Impact:** Returns `pos_customers(name, email, phone)`, all `pos_sale_items`, `pos_sale_payments`, and `businesses(name, abn, phone, email, address)` for any UUID. Cross-tenant, no rate limit.
**Fix pattern:** Require CX session cookie **or** add HMAC receipt token column and validate it alongside the UUID (same as `invoices.signature_token` pattern).

### C-02 · `public/loyalty/[business_id]/balance` — Unauth phone→PII enumeration
**File:** `src/app/api/public/loyalty/[business_id]/balance/route.ts`
**Auth:** NONE.
**Impact:** Returns `name, points_balance, visit_count, total_spent` for any phone+business_id. Full financial profile of any customer on the platform.
**Fix pattern:** Gate behind `cx_session` cookie (same as `/me` endpoint) OR remove `name`/`total_spent` and only return points for an active session.

### C-03 · `public/instore/loyalty` — Unauth PII read + phantom customer injection
**File:** `src/app/api/public/instore/loyalty/route.ts`
**Auth:** NONE. `business_id` from POST body.
**Impact:** (1) Any caller can look up customer records by email for any business. (2) If no customer found, creates a `pos_customers` row with caller-supplied `business_id` — phantom account injection into any business's DB.
**Fix pattern:** Gate behind `ariakiosk_${bid}` cookie (same as `instore/chat`). Derive `business_id` from the kiosk session, never from the body.

### C-04 · `public/menu/[business_id]/descriptions` — Unauth AI mutation on any business
**File:** `src/app/api/public/menu/[business_id]/descriptions/route.ts`
**Auth:** NONE.
**Impact:** Any unauthenticated caller can trigger Anthropic Claude calls and write AI-generated descriptions to `pos_products` for any business. Costs API tokens, mutates production data.
**Fix pattern:** Require owner Supabase auth + `getBid()` ownership check. This is an owner-facing operation, not a public one.

### C-05 · `webhooks/stripe-orders` — Silent 200 bypass when secret unset
**File:** `src/app/api/webhooks/stripe-orders/route.ts` lines 33–37
**Auth:** `constructEvent` skipped when `STRIPE_WEBHOOK_SECRET_ORDERS` is absent.
**Impact:** When the env var is not set, endpoint returns HTTP 200 for ANY POST body. An attacker can fabricate `payment_intent.succeeded` with `metadata.kind="online_order"` to mark orders paid, accept them, and fire to KDS — zero payment charged.
**Fix pattern:** Replace the `if (!secret) { return NextResponse.json({ ok: true }) }` guard with `return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })`. Never return 200 when the secret is absent.

### C-06 · `crons/aria-intelligence` — Open when `CRON_SECRET` unset
**File:** `src/app/api/crons/aria-intelligence/route.ts` lines 17–19
**Auth:** `if (cronSecret && authHeader !== ...)` — short-circuits when `cronSecret = ''`.
**Impact:** When `CRON_SECRET` is absent, the entire endpoint runs without auth: competitor syncs, Square/Shopify/Lightspeed delta imports, workforce insights, scheduled email sends.
**Fix pattern:** Replace the inline check with `const denied = await verifyCronAuth(req); if (denied) return denied;` from `src/lib/auth/cron.ts` which fails closed unconditionally.

### C-07 · `aria/test` — Leaks Anthropic API key prefix publicly
**File:** `src/app/api/aria/test/route.ts`
**Auth:** NONE.
**Impact:** Returns `{ has_anthropic_key: true, key_preview: "sk-ant-api03-..." }` — discloses key format and prefix. Combined with the validity boolean, confirms live credentials.
**Fix pattern:** Delete this endpoint entirely. If a health-check is needed, gate it behind `isAdminEmail` auth.

### C-08 · `staff-portal` — Raw 6-digit OTP is the bearer token, no verify rate limit
**Files:** `src/app/api/staff-portal/verify/route.ts:33`, `src/app/api/staff-portal/shifts/route.ts`, `src/app/api/staff-portal/leave/route.ts`
**Auth:** `/verify` accepts email + 6-digit OTP, returns the OTP itself as the session token. Downstream routes accept `x-portal-token` = raw OTP with no brute-force protection.
**Impact:** 10^6 space brute-forceable against `/shifts` or `/leave` with no throttle, 24-hour window. Success exposes schedule, leave balance, allows leave submission.
**Fix pattern:** On verify success: generate a cryptographically random 32-byte token, store its SHA-256 hash in a new `staff_portal_sessions` table with `expires_at = now() + 4h`. Return the raw token to client. Add rate limiting (5 attempts / 15 min) to `/verify` via Upstash. Retire the plaintext `portal_token` column.

### C-09 · `loyalty/earn` — Authenticated IDOR: any customer's points readable cross-tenant
**File:** `src/app/api/loyalty/earn/route.ts`
**Auth:** `getUser()` ✓ — caller is authenticated. But:
**Impact:** `supabaseAdmin.from('pos_customers').select(...).eq('id', customer_id)` — no `.eq('business_id', bid)`. Any authenticated user from Business A can read any customer's `loyalty_points` + `points_balance` by UUID.
**Fix pattern:** Add `.eq('business_id', bid)` where `bid` is derived from `getUser()` session, same as the adjacent `loyalty/redeem` route does correctly.

### C-10 · `aria/auto-review` — Cross-tenant PII read + unauthorized SMS send
**File:** `src/app/api/aria/auto-review/route.ts` lines 33, 36
**Auth:** `getUser()` ✓ — caller authenticated.
**Impact:** Two supabaseAdmin queries on `pos_customers` and `pos_sales` with NO `.eq('business_id', bid)` filter. Business A owner can pass any UUID to read customer `name, phone, email` from Business B, then the route sends SMS to that phone number on behalf of A. Two-in-one: cross-tenant PII exfiltration + unauthorized SMS.
**Fix pattern:** Add `.eq('business_id', bid)` to both queries (lines 33 and 36). Two-line fix.

### C-11 · `public/widget/chat` — Zero rate limiting on AI endpoint; api_key in public embed
**File:** `src/app/api/public/widget/chat/route.ts`
**Auth:** `api_key` from body validated against DB. But the api_key is embedded in the public JS script at `src/app/api/public/widget/embed/[api_key]/route.ts:37` (`var API_KEY = '${apiKey}'`) served with `Access-Control-Allow-Origin: *`.
**Impact:** An attacker fetches the public embed URL, extracts `API_KEY`, then hammers `/widget/chat` with unlimited Claude `claude-haiku-4-5-20251001` calls. No rate limiting exists anywhere in the route.
**Fix pattern:** Add per-api_key + per-IP rate limiting using `checkRateLimit` from `src/lib/rate-limit.ts`. Set a per-api_key daily message cap and per-IP cap (e.g. 20 messages/hour/IP). Consider rotating api_keys to non-extractable server-side values that are exchanged for short-lived session tokens on the client.

### C-12 · `src/lib/inventory/staff-session.ts` — Hardcoded fallback HMAC secret
**File:** `src/lib/inventory/staff-session.ts:15`
**Auth:** `process.env.INV_STAFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only-secret'`
**Impact:** In any environment where both env vars are absent (dev, staging, preview builds), any attacker can forge a valid HMAC-signed `aria_inv_staff` cookie and authenticate as any staff member in any business for the inventory PWA.
**Fix pattern:** Throw at startup if `INV_STAFF_SECRET` is unset. Remove the service role key fallback (it conflates two secrets with different purposes). Remove the hardcoded string entirely.

### C-13 · `pos/staff` POST/PATCH — Mass assignment enables role escalation + PIN tampering
**File:** `src/app/api/pos/staff/route.ts` lines 31, 46
**Auth:** `getUser()` + `getBid()` ✓ — owner authenticated.
**Impact:** `insert({ ...body })` and `update(body)` spread the entire request body. Owner can set any DB column, including `role`, `pin` (credential tampering on colleagues), `is_active`, `commission_rate`. A temporarily compromised owner account can permanently escalate all staff.
**Fix pattern:** Allowlist the accepted fields explicitly: `{ name, role, pin, is_active, phone, email, hourly_rate, commission_rate, start_date, department, ... }`. Never spread `body` directly into DB operations.

### C-14 · `public/widget/embed/[api_key]` — Stored XSS via bot_name injected into JS
**File:** `src/app/api/public/widget/embed/[api_key]/route.ts` lines 27–109
**Auth:** `api_key` validated — but a malicious tenant or compromised account can set a crafted `bot_name`.
**Impact:** Only single-quotes escaped; backslash-escape bypass possible. `bot_name` also injected via `innerHTML` at line ~100. Any third-party site embedding the widget will execute injected script under their origin. Served with `Cache-Control: public, s-maxage=3600` — attack persists in CDN cache.
**Fix pattern:** Use `JSON.stringify()` for all JS string interpolation (properly escapes `\`, `'`, `"`, newlines). Sanitize `bot_name`/`greeting` with an HTML entity encoder before `innerHTML` injection, or use `textContent` instead.

---

## HIGH FINDINGS

### H-01 · `health/stripe` — Reveals Stripe env var config publicly
`src/app/api/health/stripe/route.ts` — No auth. Returns which `STRIPE_*` env vars are set. Assists attackers in identifying unset secrets (ref: C-05).
**Fix:** Delete or gate behind `isAdminEmail`.

### H-02 · `aria/artifact-parse-failure` — Unauth write to AI call log
`src/app/api/aria/artifact-parse-failure/route.ts` — No auth. Any caller writes arbitrary strings to `aria_ai_calls`. Log injection / storage abuse.
**Fix:** Gate behind owner session auth.

### H-03 · `public/bookings/[business_id]` POST — Unauth booking creation, email pumping
`src/app/api/public/bookings/[business_id]/route.ts` — No auth on POST, no rate limit. Creates bookings for any business, sends Resend email confirmations to any `customer_email`.
**Fix:** Add per-IP rate limiting (e.g. 5 bookings/15min) and optional reCAPTCHA. This route is by-design public but needs throttling.

### H-04 · `public/instore/recipe` — Unauth AI call + product enumeration
`src/app/api/public/instore/recipe/route.ts` — No auth. Triggers paid Claude haiku calls, returns full active product catalog with names/prices/stock.
**Fix:** Gate behind `ariakiosk_${bid}` session cookie, same as `instore/chat`.

### H-05 · `public/order/[id]/status` — Returns `customer_name` + `notes` without auth
`src/app/api/public/order/[id]/status/route.ts` — Anon key (RLS-dependent). Returns `customer_name` and `notes`. Older redundant endpoint; the correct `/order-track/[orderNumber]` returns status only.
**Fix:** Remove this endpoint (redundant with `/order-track/`) or remove `customer_name` and `notes` from the select.

### H-06 · `invoices/public/[id]` — Unauth PII (name, email, address, financials)
`src/app/api/invoices/public/[id]/route.ts` — UUID-only gate. Returns `bill_to_name`, `bill_to_email`, `bill_to_address`, full financial totals.
**Fix:** Add a secondary `view_token` column (random 32-byte hex, included in emailed link). Require it alongside UUID. The existing `/sign` endpoint already uses `signature_token` — same pattern.

### H-07 · `invoices/public/[id]/paid` — Unauth write flips invoice status
`src/app/api/invoices/public/[id]/paid/route.ts` — No auth, no token check. Sets `status = 'pending_payment_confirm'` on any invoice by UUID.
**Fix:** Require the same `payment_token` or `signature_token` used on `/sign`. UUID alone must not authorise financial state transitions.

### H-08 · `quotes/[id]/accept` — Unauth binding quote acceptance, triggers emails
`src/app/api/quotes/[id]/accept/route.ts` — UUID-only gate. Accepts any quote as any name, sets status `accepted`, emails owner + customer confirmation.
**Fix:** Add `acceptance_token` column to `quotes` table. Include it in emailed acceptance link URL. Verify it server-side alongside UUID.

### H-09 · `pos/price-lists` PATCH/DELETE — Cross-tenant mutation, no `business_id` filter
`src/app/api/pos/price-lists/route.ts` lines 85, 97–98 — Authenticated, but `.update(body).eq('id', id)` and `.delete().eq('id', id)` have no `.eq('business_id', bid)` guard. Any owner can modify/delete another business's price lists by UUID.
**Fix:** Add `.eq('business_id', bid)` to both PATCH and DELETE query chains.

### H-10 · `pos/price-points` PATCH/DELETE — Same cross-tenant mutation
`src/app/api/pos/price-points/route.ts` lines 72, 86 — Same pattern as H-09.
**Fix:** Add `.eq('business_id', bid)` to both PATCH and DELETE.

### H-11 · `inventory/app/[slug]/login` — No rate limit on PIN brute-force
`src/app/api/inventory/app/[slug]/login/route.ts` — No rate limiting. PINs are 4–6 numeric digits stored and compared in plaintext. Unlimited guesses allowed.
**Fix:** Add Upstash-backed rate limit: 5 failed attempts/15min per `staff_id`. Hash PINs with bcrypt before storage.

### H-12 · `webhooks/nps-response` — No Twilio signature verification
`src/app/api/webhooks/nps-response/route.ts` — Any caller can POST `Body=7&From=+61400000000` to inject fraudulent NPS scores for any customer. No MAC check, no rate limit.
**Fix:** Validate `X-Twilio-Signature` header using `twilio.validateRequest()` before processing.

### H-13 · `webhooks/stripe-image-credits` — TOCTOU race on `paid_credits` balance
`src/app/api/webhooks/stripe-image-credits/route.ts` lines 34–43 — Read-then-write on `paid_credits` is not atomic. Concurrent Stripe retries can cause double-credit-loss (both reads see same initial value).
**Fix:** Replace with single SQL `UPDATE pos_image_credits SET paid_credits = paid_credits + $1 WHERE business_id = $2` or a SECURITY DEFINER RPC matching the `loyalty_preload_load` pattern.

### H-14 · `staff/route.ts` POST — Mass assignment on `staff_members`
`src/app/api/staff/route.ts` line 55 — `insert({ ...body })` allows setting `portal_enabled`, `right_to_work_verified`, `visa_type`, etc.
`src/app/api/staff/[id]/route.ts` PATCH lines 58–63 — strips `id/business_id/created_at` but spreads rest.
**Fix:** Allowlist accepted fields explicitly. `portal_enabled` and `right_to_work_verified` should never come from client body.

### H-15 · `pos/display-suggestions` — Cross-tenant customer PII read
`src/app/api/pos/display-suggestions/route.ts` line 30 — `supabaseAdmin.from('pos_customers').select('id,name,loyalty_points,...').eq('id', body.customer_id)` — no `business_id` scope. Any authenticated owner can read another business's customer.
**Fix:** Add `.eq('business_id', bid)` where `bid` is from `getUser()` session.

### H-16 · `cx/[slug]/auth` — In-memory rate limiting resets on cold start
`src/app/api/cx/[slug]/auth/route.ts` lines 21–22 — `phoneSends` and `ipSends` Maps in module scope. Resets on every Vercel cold start. Effective rate limit = nominal × N_instances.
**Fix:** Replace with Upstash `checkRateLimit` from `src/lib/rate-limit.ts`, same approach used by `loyalty/auth` (which correctly uses Upstash).

### H-17 · Multiple `pos/*` routes — Mass assignment spread to DB
Routes: `pos/categories`, `pos/suppliers`, `pos/outlets`, `pos/settings`, `pos/sale-keys`, `pos/promotions`, `pos/online`, `pos/price-lists` POST — all use `insert({ ...body })` or `update(body)` without field allowlisting.
**Impact:** Clients can set internal columns (`deleted_at`, `is_active`, system flags) and bypass application-level state machines.
**Fix:** Explicitly pick fields for each route's insert/update payload.

---

## MEDIUM FINDINGS

| ID | File | Issue | Fix |
|----|------|-------|-----|
| M-01 | `src/lib/rate-limit.ts:33-34` | Upstash fails **open** when env vars absent — all AI + public rate limits silently disabled on deployments without Upstash | Fail closed: return `{ ok: false, remaining: 0, reset: Date.now() + 60000 }` when limiter is null, or throw at startup |
| M-02 | `cx/[slug]/auth/route.ts` + `staff-portal/auth/route.ts` | `Math.random()` used for OTP generation — not a CSPRNG | Replace with `crypto.randomInt(100000, 999999)` |
| M-03 | `staff-portal/auth/route.ts` | OTP stored plaintext in `staff_members.portal_token`; DB read exposes all active session tokens | Hash with SHA-256 before storage (same as `cx_otp_codes.code_hash`) |
| M-04 | `.gitignore` | Only excludes `.env` and `.env.local`; a `.env.production` file would be committed silently | Add `*.env*` wildcard or explicitly list all variants |
| M-05 | No API route checks `email_confirmed_at` | Unconfirmed owner accounts can call all `/api/pos/*`, `/api/aria/*` routes if Supabase project doesn't enforce email confirmation | Add middleware-level or per-route check: `if (!user.email_confirmed_at) return 403` |
| M-06 | `social/data-deletion/route.ts` | Facebook `signed_request` MAC not verified before deleting `social_connections` rows | Implement FB signed_request MAC verification before processing deletion |
| M-07 | `public/cx/[slug]/join` | No rate limiting — unlimited `loyalty_identity` + `pos_customers` rows creatable for any business | Add per-IP rate limit (5/hour) using Upstash |
| M-08 | `public/loyalty/[business_id]/enrol` | Rate limit is per-IP only (10/60s), not per-phone — phone numbers can be enrolled from multiple IPs | Add per-phone rate limit alongside per-IP |
| M-09 | `public/scan-and-go/cart` GET | No `business_id` scope on `pos_self_checkout_carts` query; 8-char token is short | Add `.eq('business_id', bid)` from resolved slug |
| M-10 | `billing/[action]` webhook path | Uses `createServerSupabaseClient()` (session cookie) not `supabaseAdmin` — in webhook context no session cookie exists; DB writes silently fail RLS | Use `supabaseAdmin` for webhook DB mutations, same as all other Stripe webhooks |
| M-11 | `public/instore/chat` + `public/instore/scan-and-go` | No AI call rate limiting beyond kiosk session cookie | Add per-bid call budget / hourly cap |
| M-12 | `src/app/[slug]/page.tsx`, `src/app/menu/[slug]/page.tsx` | `JSON.stringify(jsonLd)` in `dangerouslySetInnerHTML` — a business name containing `</script>` executes as JS | Use `JSON.stringify().replace(/<\//g, '<\\/')` to escape closing script tags |
| M-13 | Widget chat `memberContext` construction | `cust.name` from `pos_customers` (user-set via `/join`) injected into AI system prompt without sanitization — indirect prompt injection vector | Strip/truncate `cust.name` to alphanumeric before system prompt interpolation |
| M-14 | Auth `getBid` logic duplicated in ~250 files | Future discrepancy in one copy opens auth bypass; no shared helper means no single audit point | Extract to `src/lib/auth/get-bid.ts` shared helper; systematic replace over time |

---

## LOW FINDINGS

| ID | File | Issue | Fix |
|----|------|-------|-----|
| L-01 | `customers/[id]/summarise/route.ts` | `select('*')` via supabaseAdmin before ownership check; if ownership logic has a bug, PII is already loaded | Reorder: verify ownership first, or include user_id join in the initial query |
| L-02 | `customers/[id]/ai-summary/route.ts` | Same fetch-before-check pattern | Same fix |
| L-03 | `loyalty/redeem/route.ts` | Final `UPDATE` on `pos_customers` uses only `.eq('id', customer_id)`, missing `.eq('business_id', bid)` — safe due to prior checks but TOCTOU window | Add `.eq('business_id', bid)` to the update |
| L-04 | `staff-portal/auth.ts` | OTP TTL = 24 hours (line 33) — excessive for a one-time code | Reduce to 15–30 minutes |
| L-05 | `next.config.mjs` | CSP has `'unsafe-inline' + 'unsafe-eval'` in `script-src` — renders XSS policy completely ineffective | Adopt nonce-based CSP; eliminate eval; track toward removing unsafe-inline |
| L-06 | `next.config.mjs` | `frame-src 'self' blob: data: https: http:` — any external origin can be framed inside the app | Restrict to explicit origins |
| L-07 | `src/middleware.ts` | Matcher covers only ~15 explicit paths; `/api/pos/*`, `/api/aria/*` not covered — middleware-level guards don't apply there | Per-route auth is the primary protection; add middleware coverage for defence-in-depth |

---

## RANKED FIX PLAN (Grouped by Shared Pattern)

### GROUP 1 — "Return 200 on unset secret" silent bypasses (C-05, C-06)
**Blast radius:** Fake order payments, unauthenticated cron sweeps across ALL businesses
**Fix:** Two files, two changes.
1. `webhooks/stripe-orders/route.ts:35` — change `return NextResponse.json({ ok: true })` → `return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })`
2. `crons/aria-intelligence/route.ts:17` — replace inline `if` with `const denied = await verifyCronAuth(req); if (denied) return denied;`

### GROUP 2 — Missing `.eq('business_id', bid)` on supabaseAdmin queries (C-09, C-10, H-09, H-10, H-15)
**Blast radius:** Cross-tenant data read + mutation across loyalty, price lists, price points, customers, suggestions
**Shared fix:** In each file, add `.eq('business_id', bid)` to the relevant `supabaseAdmin` query chain. Five files, five two-line additions.
1. `loyalty/earn` — customer lookup
2. `aria/auto-review` — customer + sale lookup (×2 queries)
3. `pos/price-lists` — PATCH + DELETE (×2 chains)
4. `pos/price-points` — PATCH + DELETE (×2 chains)
5. `pos/display-suggestions` — customer lookup

### GROUP 3 — Unauthenticated supabaseAdmin public routes (C-01, C-02, C-03, C-04, H-04, H-05)
**Blast radius:** PII for any customer/sale/invoice; unlimited AI cost; phantom DB rows
**Shared fix pattern:** Gate each behind an appropriate session:
- `public/receipt/[sale_id]` → require `cx_session` cookie or HMAC token
- `public/loyalty/[business_id]/balance` → require `cx_session` cookie
- `public/instore/loyalty` → require `ariakiosk_${bid}` cookie; derive `business_id` from session
- `public/menu/[business_id]/descriptions` → require owner auth + `getBid()` ownership check
- `public/instore/recipe` → require `ariakiosk_${bid}` cookie
- `public/order/[id]/status` → remove endpoint (redundant with `/order-track/`)

### GROUP 4 — Financial state mutations with UUID-only gates (H-07, H-08)
**Blast radius:** Arbitrary invoice status flip, fraudulent quote acceptance with email notifications
**Shared fix pattern:** Add a secondary cryptographic token column to each table:
- `invoices.payment_token` — random 32-byte hex, required alongside UUID for `/paid`
- `quotes.acceptance_token` — random 32-byte hex, required alongside UUID for `/accept`
Both follow the existing `invoices.signature_token` pattern already in the codebase.

### GROUP 5 — Mass assignment via `insert/update({ ...body })` (C-13, H-14, H-17)
**Blast radius:** Role escalation, PIN tampering, `portal_enabled` self-grant, state machine bypass
**Shared fix pattern:** Explicit field allowlist in each route's insert/update payload. Never spread `body` directly.
Routes: `pos/staff`, `staff/[id]`, `staff/route.ts`, `pos/categories`, `pos/suppliers`, `pos/outlets`, `pos/settings`, `pos/sale-keys`, `pos/promotions`, `pos/online`, `pos/price-lists` POST.

### GROUP 6 — Weak/no rate limiting on auth and AI endpoints (C-08, C-11, H-11, H-16, M-01, M-07, M-08)
**Blast radius:** OTP brute-force, PIN brute-force, AI cost attacks, SMS pumping
**Shared fix:** Consolidate on Upstash `checkRateLimit` from `src/lib/rate-limit.ts`:
- `staff-portal/verify` → 5 attempts / 15 min per email (Upstash)
- `inventory/app/[slug]/login` → 5 attempts / 15 min per `staff_id` (Upstash)
- `cx/[slug]/auth` → replace in-memory Maps with Upstash (pattern: `loyalty/auth`)
- `public/widget/chat` → 20 messages / hour / IP (Upstash)
- `public/cx/[slug]/join` → 5 enrollments / hour / IP (Upstash)
- Fix `src/lib/rate-limit.ts` to fail **closed** when Upstash is absent

### GROUP 7 — Legacy staff-portal token system overhaul (C-08)
**Blast radius:** Staff schedule/leave exposure, unauthorized leave requests
**Full replacement required:**
1. New `staff_portal_sessions(id, staff_member_id, business_id, token_hash, expires_at, revoked_at)` table
2. `verify` endpoint: generate 32-byte random token, store SHA-256 hash, return raw token (TTL: 4h)
3. Downstream routes: verify by SHA-256 hash lookup, not plaintext OTP comparison
4. Retire `staff_members.portal_token` column

### GROUP 8 — Information disclosure (C-07, H-01, H-02)
- `aria/test` → delete entirely
- `health/stripe` → gate behind `isAdminEmail` or delete
- `aria/artifact-parse-failure` → gate behind owner session auth

### GROUP 9 — Webhook integrity (H-12, H-13, M-06)
- `webhooks/nps-response` → add Twilio HMAC validation via `twilio.validateRequest()`
- `webhooks/stripe-image-credits` → atomic `UPDATE SET paid = paid + $1` (replace read-then-write)
- `social/data-deletion` → verify Facebook `signed_request` MAC before processing

---

## SECRETS STATUS

**Git history scan:** No live Stripe, Anthropic, or Supabase service-role keys found in committed history. `.env.example` only contains placeholders. ✓

**Known previous exposure:** A GitHub PAT (`ghp_wT8…`) was previously noted as exposed. Not found in current audit scope — confirm it has been rotated (FOUNDER TODO).

**`.gitignore` gap:** Only `.env` and `.env.local` excluded. A `.env.production` or `.env.staging` file would be silently committed. Add wildcard.

---

## CONFIRMED SAFE (REPRESENTATIVE)

- All 88 `cron/*` routes — uniformly protected by `verifyCronAuth()`
- All 16 `admin/*` routes — `getUser()` + `isAdminEmail()` + optional role check
- All CX personal routes after CX-SEC-1 sprint (`/me`, `/orders`, `/favourites`, `/notifications`, `/place-order`) — `getCxSession()` + server-side pricing
- All Stripe webhooks except `stripe-orders` — `constructEvent()` with correct secrets
- Widget `api_key` validation — DB-backed key lookup, business_id derived server-side
- `instore/chat` + `scan-and-go` — `ariakiosk_${bid}` cookie session
- `loyalty/redeem`, `loyalty/birthday-check`, `loyalty/account` — properly scoped
- All `pos/*` routes using `getUser()` + `getBid()` pattern (except mass-assignment variants above)
- `billing/[action]` (non-webhook paths) — session auth + `getBid()` ownership

---

*Report end. 14 CRITICAL · 17 HIGH · 14 MEDIUM · 7 LOW. NO code was modified in this audit.*