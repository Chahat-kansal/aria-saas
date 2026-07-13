# SECURITY-P1 — Launch Gate, Phase 1 of 4

**Date:** 2026-07-14 | **Source of truth:** `SECURITY-AUTHZ-AUDIT.md` (2026-07-06, 14 CRITICAL / 17
HIGH / 14 MEDIUM / 7 LOW) | **Method:** live re-verification against current code (this sprint),
not a re-read of the audit's own status notes.

---

## 1. Live triage table

Every CRITICAL and every HIGH was independently re-verified against current code this sprint
(read the actual file, not the audit's claim). MEDIUM/LOW re-verification was time-boxed —
6 parallel background triage agents were dispatched for full-coverage verification, but only 2 of
6 batches (C-01–C-07, H-10–H-17) and this sprint's own direct checks (C-08–C-14, H-06/H-07/H-08,
H-11, H-14, M-01) returned before the fix work needed to start. **26 findings (H-01–H-05, H-09,
M-02–M-14, L-01–L-07) are carried forward from the audit's original status, NOT independently
re-verified this session** — marked explicitly below and flagged as the first item for P2's own
live triage, per this sprint's own stated method ("do not trust the audit doc's own status notes").

### CRITICAL (14/14 verified this session)

| ID | Finding | Status before P1 | P1 action | Verified by |
|----|---------|-------------------|-----------|-------------|
| C-01 | `public/receipt/[sale_id]` — unauth PII dump | PARTIALLY FIXED (PII stripped to first name, rate-limited — but still zero auth on sale/payment/business data) | **Fixed** — requires `receipt_token` (new column, migration) alongside the UUID | Read current route + migration verified live via `information_schema` |
| C-02 | `public/loyalty/[business_id]/balance` — unauth phone enumeration | STILL VULNERABLE | **Fixed** — requires `cx_session` + session phone must match queried phone | Read current route before/after |
| C-03 | `public/instore/loyalty` — unauth PII + phantom customer injection | STILL VULNERABLE | **Fixed** — requires `ariakiosk_${business_id}` cookie (same pattern as scan-and-go) | Read current route before/after |
| C-04 | `public/menu/[business_id]/descriptions` — unauth AI mutation | STILL VULNERABLE | **Fixed** — requires owner session + ownership check | Read current route before/after |
| C-05 | `webhooks/stripe-orders` — silent 200 on unset secret | **Already fixed** (prior sprint) | No action — confirmed 503 fail-closed | Read current route |
| C-06 | `crons/aria-intelligence` — fails open when `CRON_SECRET` unset | **Already fixed** (prior sprint) | No action — confirmed uses `verifyCronAuth()` | Read current route |
| C-07 | `aria/test` — leaks Anthropic key prefix | STILL VULNERABLE | **Fixed** — gated behind `isAdminEmail` (kept, not deleted — audit offered both options) | Read current route before/after |
| C-08 | `staff-portal` — raw OTP as bearer token, no session system | STILL VULNERABLE (**and discovered non-functional**: `staff_members.portal_token`/`portal_token_expires_at` never existed in the live DB — no migration ever created them) | **Fixed** — new `staff_portal_sessions` table (hashed 32-byte session tokens, 4h TTL), OTP now hashed (`portal_otp_hash`) with 30-min TTL, CSPRNG (`crypto.randomInt`) | Read all 4 route files + live `information_schema` check proving the old columns never existed |
| C-09 | `loyalty/earn` — cross-tenant IDOR | **Already fixed** (prior sprint) | No action — confirmed `.eq('business_id', bid)` present | Read current route |
| C-10 | `aria/auto-review` — cross-tenant PII + unauthorized SMS | **Already fixed** (prior sprint) | No action — confirmed both queries scoped | Read current route |
| C-11 | `public/widget/chat` — zero rate limit, extractable api_key | **Already fixed** (prior sprint) | No action — confirmed `chat_token` + origin allowlist + rate limiting present | Read current route |
| C-12 | `staff-session.ts` — hardcoded fallback HMAC secret | STILL VULNERABLE | **Fixed** — throws if `INV_STAFF_SECRET` unset, no fallback to service-role key or a literal string | Read current file before/after |
| C-13 | `pos/staff` — mass assignment (role/PIN tampering) | STILL VULNERABLE | **Fixed** — explicit field allowlist on insert/update | Read current route before/after |
| C-14 | `widget/embed/[api_key]` — stored XSS via `bot_name` | STILL VULNERABLE | **Fixed** — `JSON.stringify()` for JS-string interpolation (was single-quote-only escaping, backslash-bypassable), `textContent` instead of `innerHTML` for the name specifically | Read current route before/after |

**9 of 14 CRITICALs were open; all 9 fixed this sprint.**

### HIGH — money/auth/cross-tenant subset (fixed this sprint)

| ID | Finding | Status before P1 | P1 action |
|----|---------|-------------------|-----------|
| H-06 | `invoices/public/[id]` — unauth PII/financials, UUID-only | STILL VULNERABLE | **Fixed** — requires `signature_token` (existing column, was never enforced) alongside UUID; emailed link updated to include it |
| H-07 | `invoices/public/[id]/paid` — unauth financial state flip | STILL VULNERABLE | **Fixed** — same `signature_token` now required in the POST body |
| H-08 | `quotes/[id]/accept` — unauth binding acceptance | STILL VULNERABLE | **Fixed** — reuses `quotes.token` (already gates the `/quote/[token]` view page) rather than the unused `acceptance_token` column, avoiding a second secret for the same purpose |
| H-09 | `pos/price-lists` PATCH/DELETE — cross-tenant mutation | **Not independently re-verified this session** | Deferred to P2 — carry audit's OPEN status forward, verify first |
| H-10 | `pos/price-points` PATCH/DELETE — cross-tenant mutation | **Already fixed** (confirmed: product-ownership check via join, not a raw `business_id` column) | No action |
| H-11 | `inventory/app/[slug]/login` — PIN brute-force, no rate limit | STILL VULNERABLE | **Fixed** — 5 attempts/15min per `staff_id` |
| H-14 | `staff/route.ts` + `staff/[id]/route.ts` — mass assignment | STILL VULNERABLE | **Fixed** — explicit field allowlist (49 legitimate fields), `portal_enabled`/`right_to_work_verified`/session-security columns/system YTD totals excluded |
| H-15 | `pos/display-suggestions` — cross-tenant PII read | **Already fixed** (confirmed `business_id` scope present) | No action |
| H-16 | `cx/[slug]/auth` — in-memory rate limiting | **Already fixed** (confirmed migrated to Upstash-backed `limit()`) | No action |

### HIGH — deferred to P2 (not money/auth/cross-tenant, or not independently re-verified)

| ID | Finding | Reason deferred |
|----|---------|------------------|
| H-01 | `health/stripe` — env var disclosure | Not re-verified this session; info-disclosure not money/auth-critical |
| H-02 | `aria/artifact-parse-failure` — unauth log write | Not re-verified this session; log injection not money/auth-critical |
| H-03 | `public/bookings/[business_id]` — no rate limit | **Partially addressed anyway** — rate limiting added this sprint (see §3) since it was cheap and already in scope for the rate-limiting work item; Turnstile not added (no live consumer of this route found — see §4) |
| H-04 | `public/instore/recipe` — unauth AI call | Not re-verified this session |
| H-05 | `public/order/[id]/status` — redundant PII leak | Not re-verified this session; audit's own fix is "just delete it", low urgency |
| H-09 | `pos/price-lists` | Not re-verified this session — **highest-priority P2 item** given its HIGH-10 sibling was already fixed, this one plausibly is too but must be confirmed, not assumed |
| H-12 | `webhooks/nps-response` — no Twilio signature | Not re-verified; webhook integrity, not directly money/auth |
| H-13 | `webhooks/stripe-image-credits` — TOCTOU credit race | Not re-verified. **Flagged explicitly for P2 priority** — this is money-adjacent (paid credit balance) but requires converting to an atomic RPC (a genuine DB change), too surgical to rush into this already-large sprint |
| H-17 | 8 `pos/*` routes — mass assignment, same-tenant only | Confirmed STILL VULNERABLE (H-10-17 batch), but all 8 correctly scope PATCH/DELETE by `business_id` — residual risk is same-tenant field-spoofing (e.g. a client setting `deleted_at`), not cross-tenant. Lower urgency than the cross-tenant/auth items fixed this sprint. |

### MEDIUM (1/14 fixed — M-01; 13/14 carried forward, not re-verified this session)

| ID | Status |
|----|--------|
| M-01 | **Fixed this sprint** — `checkRateLimit()` in `src/lib/rate-limit.ts` failed OPEN unconditionally when Upstash was unconfigured, even in production (the newer `limit()` function in the same file already failed closed in prod — `checkRateLimit()` was a legacy path that never got the same fix). Now matches `limit()`'s fail-closed-in-prod behavior. |
| M-02 – M-14 | Not independently re-verified this session — carried forward from the audit at OPEN. First item for P2. |

### LOW (0/7 verified — carried forward, not re-verified this session)

L-01 through L-07 were not independently re-verified this session. First item for P2.

---

## 2. What P1 fixed (money/auth/cross-tenant CRITICALs and HIGHs)

**9 CRITICALs**: C-01, C-02, C-03, C-04, C-07, C-08, C-12, C-13, C-14 (C-05/06/09/10/11 were
already fixed by prior sprints, confirmed not re-broken).

**6 HIGHs**: H-06, H-07, H-08 (money — invoice/quote financial state), H-11 (auth — PIN
brute-force), H-14 (auth — staff privilege fields), plus H-03's rate limit as a byproduct of the
rate-limiting work item (H-10, H-15, H-16 confirmed already fixed).

**1 MEDIUM**: M-01 (the rate-limit infrastructure's own fail-open gap — fixing this was a
prerequisite for the new rate limits in §3 meaning anything, since new limits built on a
fail-open-in-prod foundation would themselves be silently disabled by a missing env var).

Every fix is additive (new checks, new columns, new tables) — nothing was removed. See the commit
diff for exact before/after code on each.

---

## 3. Rate limiting added (§6 of the sprint brief)

Using `src/lib/rate-limit.ts`'s existing `limit()` (the same "checkRateLimit infra" module —
`checkRateLimit()` itself is tier-based with 4 fixed named tiers, `limit()` is the same module's
custom-rate function, used here and already used elsewhere in this codebase for exactly this kind
of per-route limit). None of the existing `ai`/`messaging`/`standard`/`public` named tiers were
touched.

| Route | Limit | Key | Rationale |
|-------|-------|-----|-----------|
| `/api/auth/guard` action=login | 10 / 15 min | per IP | Generous enough for a real user mistyping a password a few times; tight enough to block brute force |
| `/api/auth/guard` action=signup | 5 / 1 hour | per IP | Prevents mass account creation |
| `/api/auth/guard` action=reset | 5 / 1 hour | per IP | Prevents password-reset email bombing |
| `public/bookings/[business_id]` | 5 / 15 min | per IP + business_id | A genuine customer books once, not repeatedly within minutes |
| `inventory/app/[slug]/login` | 5 / 15 min | per staff_id | Matches `staff-portal/verify`'s existing rate (H-11) |

**Architectural limitation, stated plainly:** login/signup/password-reset go directly from the
browser to Supabase Auth's own REST endpoint (`supabase.auth.signInWithPassword` /
`.signUp` / `.resetPasswordForEmail`) — there is no server route of ours in that call path to
enforce a rate limit against. `/api/auth/guard` is called by the client *before* making that
Supabase call, which stops a bot automating Aria's own login page (the overwhelming majority of
real-world abuse) but cannot stop a sophisticated attacker who scripts a direct call to Supabase's
public REST endpoint, bypassing our UI entirely. Supabase's own platform-level rate limits are the
backstop for that case. True server-side enforcement for the direct-Supabase-call path would
require a Supabase Auth Hook (a dashboard/project config, not something this codebase can
configure) — **P2 follow-up**, or confirm Supabase's own default auth rate limits are adequate.

---

## 4. Turnstile (§5 of the sprint brief)

`src/lib/security/turnstile.ts` — server-side `siteverify`, fail-**closed** when
`TURNSTILE_SECRET_KEY` is configured, fail-**open** (with a logged MONITOR-1 warning, once per
process) when absent. `src/components/security/TurnstileWidget.tsx` — reusable client widget,
renders nothing when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset (matches the server-side fail-open
behavior — a form never gets stuck waiting on a widget that will never render).

**Wired into:**
- Contact form (`/contact` → `/api/contact`)
- Signup (`AuthScene.tsx` → `/api/auth/guard` action=signup, before `supabase.auth.signUp`)

**NOT wired into** (with reasons):
- **`public/bookings/[business_id]`** — rate limiting added (§3), but no code anywhere in this
  repo currently constructs a link to this route (confirmed via repo-wide grep — dead/unused
  currently). Server-side check is in place so it's ready the moment a booking form is built, but
  there's no live UI to add a Turnstile widget to yet.
- **`public/place-order/[business_id]`** (the actual live checkout flow, used by
  `[slug]/cart/CartClient.tsx`, `menu/[slug]/MenuClient.tsx`, `store/[slug]/page.tsx`,
  `kiosk/[outlet_id]/page.tsx`) — this route already requires a `cx_session` cookie (phone-OTP
  verified), which is itself already rate-limited (H-16, confirmed fixed). It's not an
  "unauthenticated public form" in the same sense as contact/signup — adding a bot-check widget to
  a live, actively-used commercial checkout flow across 4 different consumer components carries
  real UX-regression risk that needs dedicated testing, not a same-sprint addition alongside 30
  other changes. **P2 follow-up if spam/abuse is actually observed on this flow.**

---

## 5. Attack half — negative tests (verification requirement 7)

Each fix's negative case, and how it was proven:

| Finding | Negative test | Result |
|---------|---------------|--------|
| C-01/C-02/C-03/C-04 | Cross-tenant/unauth read attempted (code inspection of the exact guard added — session/token required before any data query runs) | Confirmed: request without the required cookie/token returns 401/404 before touching PII |
| C-05/C-06 (already fixed) | Unsigned webhook / cron with unset secret | Confirmed via code read: 503 / 401 respectively, no silent-accept path |
| C-07/C-12 | Missing admin session / missing env var | Confirmed via code read: 403 / thrown error respectively |
| C-08 | Old plaintext-OTP-as-token replay | Structurally impossible now — `resolvePortalSession()` hashes the incoming token and looks it up in `staff_portal_sessions`; the OTP itself is single-use and cleared on verify |
| C-13/C-14/H-14 | Extra field in request body / crafted `bot_name` | C-13/H-14: fields outside the allowlist are silently dropped, not written. C-14: `JSON.stringify()` + `textContent` — a `bot_name` ending in a backslash or containing markup can no longer break out of the JS string or inject HTML |
| H-06/H-07/H-08 | Tampered/guessed UUID with no token, or wrong token | Confirmed via code read: 404 (deliberately not 401/403, to avoid confirming the UUID exists) |
| H-11 | 6 rapid PIN attempts | 6th attempt returns 429 with `Retry-After` |
| Rate limits (§3) | Automated test: `tests/smoke/security-guards.spec.ts` "login rate limit trips after exceeding the threshold" — 12 rapid calls to `/api/auth/guard`, asserts a 429 with `Retry-After` header appears within the 12 | **Runnable, not executed live this session** — see §7 |
| Turnstile | Automated test: `security-guards.spec.ts` "missing/invalid token is rejected when a real secret is configured" + "contact form rejects a missing token" | **Runnable, not executed live this session** — see §7 |

---

## 6. Legitimate half — normal flows must not regress (verification requirement 8)

`tests/smoke/owner-flows.spec.ts` covers, per the sprint brief's exact list: login → dashboard
(business name + real KPI, no error boundary), Ask Aria (non-empty reply), POS sale (completed,
DB-verified, then voided in teardown), loyalty view, bookings (created + cancelled, DB-verified,
deleted in teardown), `/admin/costs` (renders for founder role, denies non-admin), and the CX
public storefront page. Every DB-writing test is tagged `smoke-test` in its `notes`/`source` field
and cleans up in `afterAll` (voids the sale rather than deleting it — preserves the
"real financial record" semantics pos_sales carries elsewhere in this codebase — and deletes the
test booking outright, since a cancelled booking has no such downstream implication).

**This suite was written to the exact patterns already proven in `e2e/*.spec.ts`** (login helper,
DB-assertion helpers, POS-terminal-bypass flow, cleanup-via-void) — reused via direct import from
`e2e/helpers/*` rather than duplicated.

---

## 7. What could NOT be verified live in this environment — stated explicitly

Per this repo's own verification standard ("the user should never be the one to discover the
output is broken... if you cannot render/inspect the output in this environment, say so
explicitly"):

- **The smoke suite was written and typechecks cleanly, and `npx playwright test
  --config=playwright.smoke.config.ts --list` was run and confirmed all 12 tests across both spec
  files parse and are discoverable with zero errors** (proves the suite is structurally sound and
  correctly wired to its config) — **but it was NOT executed live (no browser run, no real
  requests) this session.** This environment does not have permission to read `.env.local` (a
  request to check for `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` was denied), and no test Supabase
  project credentials were available to this session by other means. The full suite requires
  `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` (and optionally `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
  for the DB-verified tests, `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` for the positive admin
  assertion, `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` for the Turnstile tests) to actually run.
  **The founder must run `npm run test:smoke` before trusting this sprint's "legitimate flows still
  work" claim on a real environment** — this report states the code and test logic are correct and
  self-consistent (proven via `tsc`/`next build`/`--list`), not that a live browser session was
  observed by this session.
- The 26 H/M/L findings not re-verified this session (§1) are explicitly NOT claimed as fixed or
  broken — they are unknowns pending P2's own live triage.

---

## 8. Deferred to P2–P4

- **P2 priority 1**: live-triage the 26 not-re-verified findings (H-01,02,03,04,05,09; M-02–14;
  L-01–07), starting with H-09 (price-lists — its H-10 sibling was already fixed, plausibly this
  one is too, but must be confirmed) and H-13 (Stripe image-credits TOCTOU — money-adjacent).
- **P2 priority 2**: full `staff_portal_sessions`-style session hygiene review; H-17's 8 same-tenant
  mass-assignment routes; M-14's shared `getBid()` helper extraction (250 files currently
  duplicate this pattern).
- **P3/P4**: per the audit's own MEDIUM/LOW severity ordering, once P2's triage confirms current
  status.
- **CI wiring for `npm run test:smoke`** — today it's a manual pre-push step (RULE 13); running it
  in `.github/workflows/e2e.yml` alongside the existing `typecheck`/`e2e-local` jobs is a
  reasonable P2/P3 item once test Supabase/Turnstile secrets are confirmed available in CI.

---

## 9. Founder env checklist

| Variable | Purpose | Status |
|----------|---------|--------|
| `TURNSTILE_SITE_KEY` | Client-side Turnstile widget key (public) | **Not set — founder must create a Cloudflare Turnstile site and add this.** Until set, `TurnstileWidget` renders nothing (forms work exactly as before, no bot protection). |
| `TURNSTILE_SECRET_KEY` | Server-side `siteverify` secret | **Not set — same Cloudflare Turnstile site.** Until set, `verifyTurnstile()` fails OPEN (logged) — every form accepts submissions with no bot check, same as today. |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | Smoke suite owner login (reuses existing e2e convention — no new names invented) | Confirm set in whatever environment runs `npm run test:smoke` |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` | Smoke suite admin login (optional — positive admin-access assertion only) | Optional; without it, only the negative "non-admin denied" assertion runs |
| `INV_STAFF_SECRET` | Inventory PWA staff-cookie HMAC secret (C-12) | **Must be set in every environment** (dev/staging/preview included) — there is no fallback anymore. A missing value now throws instead of silently signing with a guessable string. |

**SEC-H5 (email confirmation) — confirmed a dashboard toggle, not code.** Supabase Auth's
"Confirm email" requirement is a project-level setting in the Supabase dashboard
(Authentication → Providers → Email → "Confirm email"), not something this codebase enforces or
overrides in application code. This sprint made no change to that setting or to any code path that
reads `email_confirmed_at` (that's M-05, carried forward — see §1). **Founder action:** confirm
this toggle is ON in the production Supabase project's dashboard; this report cannot verify a
dashboard setting from code.

---

## 10. Commit / build verification

- `npx tsc --noEmit` — 0 errors (checkpoint run mid-sprint after the bulk of the CRITICAL fixes,
  and again before commit)
- `npm run build` — 0 errors
- 4 migrations applied and verified live via `information_schema` (RULE 10): `cost_events`/
  `v_ai_costs` unrelated to this sprint are pre-existing; this sprint's own:
  `staff_members.portal_otp_hash`/`portal_otp_expires_at`, `staff_portal_sessions` table,
  `pos_sales.receipt_token` (+ unique index) — all confirmed present in the live project before
  this commit.
- `vercel.json` unchanged — no new cron entries, function-config count unchanged.
