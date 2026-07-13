# SECURITY-P2 — Launch Gate, Phase 2 of 4

**Date:** 2026-07-13 | **Input:** `SECURITY-P1-REPORT.md` §8 (commit `3fc65514`) | **Method:** live
re-verification of the 26 findings P1 carried forward, against current code, with file:line
evidence — not a re-read of P1's own carry-forward notes.

---

## 1. Live triage — the 26 carried-forward findings

Dispatched 5 parallel independent triage passes (H-01/02/04/05/12; H-17's 8 routes; M-02–08;
M-09–13; L-01–07), each reading the actual current file, not trusting prior status notes.

### HIGH

| ID | Finding | Status before P2 | P2 finding | P2 action |
|----|---------|-------------------|------------|-----------|
| H-01 | `health/stripe` — env var disclosure | Not re-verified (P1) | **Confirmed OPEN** — zero auth, returns which `STRIPE_*` vars are set | **Fixed** — gated behind `isAdminEmail`, 404 (not 401) when denied |
| H-02 | `aria/artifact-parse-failure` — unauth log write | Not re-verified (P1) | **Confirmed OPEN** — wrote to `aria_ai_calls` with a hardcoded zero-UUID `business_id`, no auth | **Fixed** — requires session, real `bid`, rate-limited |
| H-03 | `public/bookings` rate limit | Already fixed (P1) | — | No action |
| H-04 | `public/instore/recipe` — unauth AI call | Not re-verified (P1) | **Confirmed OPEN** — sibling `instore/loyalty` had the kiosk-cookie gate, this route never got it | **Fixed** — same `ariakiosk_${bid}` gate |
| H-05 | `public/order/[id]/status` — redundant PII leak | Not re-verified (P1) | **Confirmed OPEN, confirmed dead** — zero live callers (grepped twice, independently) | **Fixed — deleted.** Live path is `order-track/[orderNumber]`, already correctly scoped |
| H-06,07,08 | Invoice/quote tokens | Already fixed (P1) | — | No action |
| H-09 | `pos/price-lists` PATCH/DELETE — cross-tenant | Not re-verified (P1, flagged top P2 priority) | **Confirmed ALREADY FIXED** — both PATCH and DELETE already have `.eq('business_id', bid)` | No action — but see H-17 gap-fill below, same file |
| H-10 | `pos/price-points` — sibling of H-09 | Already fixed | — | No action |
| H-11 | Inventory PIN rate limit | Already fixed (P1) | — | No action |
| H-12 | `webhooks/nps-response` — no signature check | Not re-verified (P1) | **Confirmed OPEN** — no `twilio` package, no `TWILIO_AUTH_TOKEN` anywhere in repo | **Fixed** — shared-secret fallback (`NPS_WEBHOOK_SECRET`, same pattern as `clicksend-inbound`) + per-phone rate limit. **Real Twilio signature validation should replace this once the actual SMS provider is confirmed** — flagged, not resolved |
| H-13 | `webhooks/stripe-image-credits` — TOCTOU race | Not re-verified (P1, flagged top P2 priority) | **Confirmed OPEN** | **Fixed** — see §2 |
| H-14 | Staff mass assignment | Already fixed (P1) | — | No action |
| H-15,16 | Already fixed | Already fixed (P1) | — | No action |
| H-17 | 8 `pos/*` mass-assignment routes | Confirmed open (P1, same-tenant only) | **Confirmed all 8 still OPEN** | **Fixed, all 8** — see §2 |

**9 HIGHs fixed this sprint** (H-01, H-02, H-04, H-05, H-12, H-13, H-17×8 counted as one line item).
**2 confirmed already fixed, no action needed** (H-09, and H-09's own re-check saved a redundant fix).

### MEDIUM

| ID | Finding | P2 verdict | P2 action |
|----|---------|-----------|-----------|
| M-01 | Rate-limit fail-open | Already fixed (P1) | No action |
| M-02 | `Math.random()` OTPs | **PARTIALLY FIXED going in** — staff-portal already fixed (P1 rebuild); `cx/[slug]/auth` still `Math.random()` | **Fixed** — `crypto.randomInt()`, matches `staff-portal/session.ts` |
| M-03 | Plaintext OTP storage | **Already fixed** (P1 staff-portal rebuild, confirmed) | No action |
| M-04 | `.gitignore` env wildcard | **Already fixed** (P1, confirmed) | No action |
| M-05 | No `email_confirmed_at` check | **Confirmed OPEN** — no code anywhere checks it server-side | **Deferred to P3** — see §4, this is architectural (middleware matcher doesn't cover `/api/pos/*`/`/api/aria/*` either, a bigger change than a single-route fix) |
| M-06 | Facebook `signed_request` MAC unverified | **Confirmed OPEN** | **Fixed** — HMAC-SHA256 recompute + `timingSafeEqual`, matches `FACEBOOK_APP_SECRET` already used elsewhere |
| M-07 | No rate limit on `cx/[slug]/join` | **Already fixed (coarse)** — `middleware.ts` applies a 30/min per-IP limit to all `/api/public/*`, confirmed covers this route | No action — noted as coarse-grained (shared budget across all public endpoints for that IP), not a dedicated per-route limit, but the audit's core claim no longer holds |
| M-08 | Enrolment rate limit IP-only | **Confirmed OPEN** | **Fixed** — added a phone-keyed limit (5/hour) alongside the existing IP limit |
| M-09 | `scan-and-go/cart` GET — no business_id scope | **Confirmed OPEN, cross-tenant** — any caller with any cart token could poll any business's cart | **Fixed** — kiosk-cookie gate + `business_id` scope added to the GET, matching the POST's existing pattern. **Frontend compatibility note:** the GET now requires `business_id` as a query param — any caller not yet passing it will get 400 instead of cart data, check the frontend poller |
| M-10 | `billing/[action]` webhook uses session client, not admin | **Confirmed OPEN** | **Fixed** — webhook branch only swapped to `supabaseAdmin`; checkout/portal/GET branches untouched |
| M-11 | `instore/chat` — unbounded AI calls | **Confirmed OPEN** for chat (scan-and-go's AI-call half of the original finding no longer applies — that route doesn't make AI calls in current code) | **Fixed** — 60 req/business/hour |
| M-12 | JSON-LD script injection | **Confirmed OPEN, both files** | **Fixed** — both `[slug]/page.tsx` and `menu/[slug]/page.tsx` |
| M-13 | Prompt injection via `cust.name` | **Confirmed OPEN** | **Fixed** — sanitized + length-capped at the interpolation site |
| M-14 | `getBid()` duplication | N/A — separate workstream | See §3 |

**8 MEDIUMs fixed this sprint** (M-02, M-06, M-08, M-09, M-10, M-11, M-12, M-13).
**1 deferred to P3 with reason** (M-05).
**2 confirmed already fixed** (M-03, M-04). **1 confirmed already-adequate** (M-07).

### LOW

| ID | Finding | P2 verdict |
|----|---------|-----------|
| L-01, L-02 | Fetch-before-ownership-check in `customers/[id]/summarise` \| `ai-summary` | Confirmed OPEN — deferred to P3 (low severity, no live exploit path found) |
| L-03 | `loyalty/redeem` final UPDATE missing `business_id` scope | Confirmed OPEN, TOCTOU-window-only (prior read is scoped) — deferred to P3 |
| L-04 | Staff-portal OTP TTL | **Confirmed FIXED** (P1 rebuild — 30 min) |
| L-05 | CSP `unsafe-inline`/`unsafe-eval` | Confirmed OPEN, applies globally (not scoped to just the Ask Aria preview route that needs it) — deferred to P3, real fix is a per-route CSP header, more than a one-line change |
| L-06 | `frame-src` wildcard | Confirmed OPEN — deferred to P3 |
| L-07 | Middleware matcher doesn't cover `/api/pos/*`/`/api/aria/*` | **PARTIALLY FIXED** — matcher grew since the audit (two POS trial-gate entries added) but still doesn't cover these prefixes for auth purposes; per-route auth remains the only protection — deferred to P3, same root cause as M-05 |

No LOW findings fixed this sprint (correctly out of the "auth/money/cross-tenant" fix criterion in
the sprint brief) — all 7 re-verified with current evidence, deferred list in §4.

---

## 2. Fixes — full detail

### H-13 — Stripe image-credits TOCTOU race (money integrity)

`src/app/api/webhooks/stripe-image-credits/route.ts` was read-then-write: `select paid_credits`,
then `update paid_credits = existing + N`. Concurrent Stripe retries for the same event could both
read the same starting balance and lose an increment.

**Fix:** new `credit_image_credits()` SECURITY DEFINER RPC
(`supabase/migrations/20260713000001_image_credits_atomic.sql`), same shape as the existing
`loyalty_preload_load` pattern. The concurrency guard IS the idempotency guard: `pos_image_
transactions` already had a unique index on `idempotency_key` (`idx_pos_image_txn_idempotency`)
that the route had simply never populated. The RPC inserts the transaction row first — the unique
index lets exactly one concurrent caller win for a given Stripe `payment_intent.id` — and only the
winner does the atomic `INSERT ... ON CONFLICT (business_id) DO UPDATE SET paid_credits =
paid_credits + N` balance upsert. Every other caller (retry, race) sees its insert silently
no-op and returns the current balance unchanged. **Verified live** via `pg_proc` before commit
(RULE 10).

### H-17 — 8 mass-assignment routes (`pos/categories`, `suppliers`, `outlets`, `settings`,
`sale-keys`, `promotions`, `online`, `price-lists`)

All 8 were `insert({ ...body, business_id: bid })` / `update(body)` — the raw client body spread
directly into the write. Fixed with explicit field allowlists, same pattern P1 already established
for `pos/staff` and `staff/route.ts`.

**Two real discrepancies found and corrected during the fix, not assumed** (RULE 10 discipline —
verified live via `information_schema`, not trusted from migration files or this sprint's own
triage notes):
- `pos_sale_keys`'s actual live columns (`label, type, color, icon, product_id, category_id,
  function_name, position, category_tab, display_order, color_token`) do **not** match the
  `20260510000008_shopfront_parity.sql` migration's `CREATE TABLE IF NOT EXISTS` column list
  (`colour, custom_price_cents, action, is_active`) — that table evidently already existed with a
  different schema before that migration ran, so the migration was a no-op. Using the file's
  column list would have shipped an allowlist that silently dropped every real write.
  Live-verified columns used instead.
- `pos_settings` does **not** have `manager_pin` or `require_staff_pin` columns at all — the
  earlier triage's fix-instructions (based on the original 2026-07-06 audit text) were wrong on
  this point. `manager_pin` actually lives on `pos_users`; `require_staff_pin` was apparently
  never applied to any table. Corrected before writing the allowlist.
- **Gap-fill beyond the original 8-route list:** `pos/price-lists`'s `_PATCH` handler was still
  spreading raw `body` into `.update(body)` — the original audit only flagged this file's **POST**
  for H-17, PATCH wasn't on the list. Same table, same allowlist already built for POST — fixed
  alongside it rather than left as a known gap.
- **Separately flagged, not fixed this sprint (out of scope):** `pos/price-lists`'s GET handler
  (lines untouched, CSV export + item listing) references a column named `override_price` on
  `pos_price_list_items` — the live column is actually named `price` (confirmed via
  `information_schema`). This looks like a pre-existing, unrelated bug (the GET path is likely
  already silently returning `undefined`/`NaN` for override prices in prod) — the POST fix (§2)
  correctly writes to `price` while still accepting the client's `override_price` key name for
  compatibility, but the GET-side bug is untouched. **P3 follow-up.**

### H-01, H-02, H-04, H-05, H-12 — see triage table for what changed; no additional detail beyond
what's in §1's table.

### M-06, M-09, M-10, M-12, M-13 — see triage table.

---

## 3. `getBid()` extraction (item 5 / M-14)

**362 files** independently define a local `getBid()`/`getBiz()` helper (verified count via grep —
the original audit's ~250 estimate was low). Per the sprint brief: create the canonical helper,
migrate only the routes this sprint's other fixes touched, file the rest for P3.

- **Created:** `src/lib/auth/get-bid.ts` — single canonical implementation, same resolution order
  every copy used (`user_active_business` first, then oldest active `businesses` row).
- **Migrated (9 files, all touched by this sprint's other fixes):** `pos/categories`,
  `pos/suppliers`, `pos/outlets`, `pos/settings`, `pos/sale-keys`, `pos/promotions`, `pos/online`,
  `pos/price-lists`, `aria/artifact-parse-failure`. Two minor consistency fixes as a byproduct of
  migrating: `pos/promotions`'s local copy had an extra `console.warn` fallback-logging branch
  (dropped — diagnostic-only, not behavior); `artifact-parse-failure`'s local copy was missing
  `.order('created_at', {ascending: true})` on the fallback query (now consistent with every other
  copy — a business with multiple active-business rows and no `user_active_business` row now
  resolves the same "oldest" business as everywhere else, instead of an arbitrary one).
- **P3 mechanical-migration list:** the remaining ~353 files. This is intentionally NOT attempted
  in P2 — it's a large, low-risk-per-file, high-total-file-count mechanical change, better suited
  to a dedicated codemod pass with its own verification (grep-and-replace + `tsc` + spot-check),
  not mixed into a sprint that's also shipping live security fixes. Tracked as first item for P3's
  own scope.

---

## 4. Session hygiene review (item 2d)

Full read-only review across all 5 session/token systems in the codebase. Summary (full table
with file:line evidence available on request — kept out of this report for length):

| System | TTL | Rotates on privilege change | Logout invalidates server-side |
|--------|-----|------------------------------|--------------------------------|
| Supabase Auth (owner/staff dashboard) | Platform default, 1h + auto-refresh | No | Partial — `/api/auth/signout` supports `scope:'global'` but defaults to `'local'` |
| CX session (customer) | 90 days | N/A | **Yes** — best-built of the five, real revoke on logout |
| Staff portal | 4h session / 30min OTP | Indirect (deactivation checked live every request) | **No — was a real gap, fixed this sprint** |
| Inventory PWA (`aria_inv_staff`) | 12h, embedded in HMAC | No — architectural (stateless by design) | No — architectural |
| Kiosk (`ariakiosk_${bid}`) | 7min (QR) / 30 days (tablet) | N/A | No explicit logout; **cookie was unsigned/forgeable — fixed this sprint** |

**Fixed this sprint (cheap):**
- **Staff portal had no logout endpoint at all** — a "logged out" client just discarded the token
  locally; the session stayed valid server-side for the rest of its 4h TTL. Added
  `POST /api/staff-portal/logout` (mirrors the CX session logout pattern already in
  `cx/[slug]/auth/route.ts`) and wired it into the actual logout button in
  `src/app/staff-portal/page.tsx` (was previously a no-op-server-side local-storage clear).
- **Kiosk cookie was a bare unsigned `'1'` literal**, not backed by any DB row. `business_id` is a
  UUID visible in every public `/in-store/[business_id]/...` URL — anyone could set
  `document.cookie = "ariakiosk_<biz>=1"` themselves and pass every downstream "must have redeemed
  a real kiosk QR/tablet key" check (`instore/loyalty`, `instore/recipe`, `scan-and-go/cart`,
  `scan-and-go/finish` — including this sprint's own H-04/M-09/M-11 fixes, which all rely on this
  same cookie). This was found during the hygiene review, **not** one of the original 26 carried-
  forward findings — flagging that explicitly since it wasn't audit-tracked. Fixed:
  `src/lib/kiosk/cookie.ts` HMAC-signs the cookie value (embeds and verifies an expiry inside the
  signature, since a forger controls the browser-side `Max-Age`). **Fail-open + logged warning
  when `KIOSK_SESSION_SECRET` is unset** (same pattern as Turnstile in P1) — falls back to the
  exact old presence-only check, so a missing env var can never brick the live in-store ordering
  flow. **New founder env var, see §6.**

**Deferred to P3 (architectural, with reason):**
- Supabase Auth JWT can't be server-revoked before its ~1h expiry on role/permission change
  without a project-level Auth Hook rewriting token issuance. No such hook exists in this repo.
  Confirmed via live Supabase docs search this sprint: the specific hook that would matter here
  (**Password Verification Attempt**) is **Teams/Enterprise-plan only** — this project is
  confirmed on the **Free** plan (`get_organization` → `plan: "free"`) — so this isn't
  buildable at all right now, not just deferred. **Accepted control: Supabase's own platform-level
  auth rate limits are the backstop**, same conclusion P1 already documented for the related
  guard-bypass limitation (item 2e below).
- Inventory PWA's 12h HMAC token can't be revoked before expiry — intentional stateless design
  (confirmed via the module's own comments), would require abandoning that design to fix.
- CX sessions have no "sign out of all devices" UI — not a vulnerability (each session still
  requires a fresh phone OTP to mint), just a missing feature.
- Default logout `scope` staying `'local'` (not `'global'`) for the main Supabase Auth signout —
  **considered and deliberately NOT changed.** Forcing every logout to sign a user out of every
  device/session is itself a product/UX decision (most apps don't do this), not obviously a bug —
  changing it would be a UX regression for legitimate multi-device users, not a pure security fix.
  Left as-is; noting the tradeoff rather than "fixing" it silently.

---

## 5. Supabase Auth Hook for the guard-bypass limitation (item 2e)

P1 documented that `/api/auth/guard` (client-side pre-flight rate limit before the direct
`supabase.auth.signInWithPassword`/`.signUp` call) cannot stop a caller who scripts a direct call
to Supabase's own Auth REST endpoint, bypassing the app's UI/guard entirely — true server-side
enforcement would need a Supabase Auth Hook.

**Checked this sprint, not implemented:** live Supabase docs search confirms the relevant hook
(**Password Verification Attempt** — the one that could reject/rate-limit sign-in attempts
server-side) is available on **Teams and Enterprise plans only**. This organization
(`fnzpmjpjrqiuaobaajgk`) is confirmed on the **Free** plan via `get_organization`. **Not buildable
on the current plan — this is not a P3-deferred item, it's a documented plan limitation.**
**Accepted control, per the sprint brief's own fallback instruction:** Supabase's platform-level
default auth rate limits are the backstop for the direct-REST-call bypass path. If the founder
upgrades to Team/Enterprise, this becomes buildable — noting for the founder checklist.

---

## 6. CI wiring (item 4)

`.github/workflows/smoke.yml` — new workflow, runs `npm run test:smoke`
(`playwright.smoke.config.ts`) on every PR touching `src/**`, `tests/smoke/**`,
`playwright.smoke.config.ts`, or `package.json` (deliberately narrower trigger than `e2e.yml`'s
every-push/PR, since the smoke suite specifically gates auth/routing/middleware/RLS regressions).

- Reuses the exact same 6 required secrets `e2e.yml` already uses
  (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`TEST_USER_EMAIL`/`TEST_USER_PASSWORD`) — no new secret names
  invented, `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` optional as before.
- Turnstile: Cloudflare's official always-pass test keys
  (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) are hardcoded directly in
  the workflow YAML as plain env vars, **not** GitHub secrets — they're public documented
  constants, not sensitive values, and hardcoding avoids a founder setup step for something that's
  never meant to be different per-environment.
- Playwright browsers are cached (`actions/cache@v4`, keyed on `package-lock.json` hash) —
  matches the intent of "cached" in the sprint brief; `e2e.yml`'s own `e2e-local` job does not
  currently cache browsers either, this is new to `smoke.yml` specifically, not a regression to
  the existing workflow.
- The workflow's own build step was removed after initially adding one — `playwright.smoke.
  config.ts`'s `webServer` already runs `npm run build && npm run start` itself, and
  `reuseExistingServer: !process.env.CI` means it always rebuilds under CI regardless — a separate
  explicit build step would have just doubled CI time for no benefit.
- `CLAUDE.md` RULE 13 updated: was "CI wiring is a P2/P3 follow-up, today a manual step" — now
  states CI enforcement is live.

**NOT executed against a real GitHub Actions run this session** (no push to a branch/PR was made
to trigger it) — the workflow YAML was validated for correct trigger/env/step structure by
inspection and by cross-referencing `e2e.yml`'s already-proven-working structure, but "the YAML is
syntactically and structurally correct" is not the same claim as "a live CI run passed." Founder
should confirm the first PR that touches `src/` after this commit actually triggers and passes (or
fails informatively) this new workflow.

---

## 7. Smoke suite — local run attempted, TEST_* still absent (stated loudly, per instruction)

`npm run test:smoke` was actually run this session (not skipped, not assumed) —
**`tests/smoke/global-setup.ts` failed immediately and loudly**:

```
Error: [smoke/global-setup] TEST_USER_EMAIL and TEST_USER_PASSWORD are required to run the smoke suite.
```

**`TEST_USER_EMAIL`/`TEST_USER_PASSWORD` are still not configured in this local environment**,
exactly as P1 reported. This was confirmed by actually attempting the run and observing its own
built-in fail-fast guard — not by reading `.env.local` directly (this session still cannot read
that file; a prior request to check it directly was denied and that restriction was respected
again this sprint). `npx tsc --noEmit` and `npx playwright test --config=playwright.smoke.config.ts
--list` (structural check, 12/12 tests still discoverable after every file this sprint touched)
both ran clean — but **the smoke suite has still never been executed live against a real browser
session in this environment, across either P1 or P2.** The founder must run `npm run test:smoke`
locally (with `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` set) before trusting either sprint's
"legitimate flows unaffected" claim on a real environment, and before the new CI workflow (§6) can
actually pass.

---

## 8. Deferred to P3 — full list with reasons

- **M-05 / L-07 (same root cause)** — no `email_confirmed_at` check anywhere server-side, and
  `middleware.ts`'s matcher doesn't cover `/api/pos/*`/`/api/aria/*` at all. Real fix needs either
  a shared `requireConfirmedUser()` helper applied per-route across ~250+ routes, or extending the
  middleware matcher (which changes what middleware-level guards apply to those prefixes more
  broadly than just this one check) — an architectural decision, not a one-file fix.
- **L-01, L-02** — fetch-before-ownership-check in `customers/[id]/summarise` /`ai-summary`. Low
  severity (no live exploit path found — the ownership check is correct today, this is
  defense-in-depth against a *future* bug in that check), small fix, just not prioritized this
  sprint's fix order (money/auth/cross-tenant Mediums took priority).
- **L-03** — `loyalty/redeem` final UPDATE missing `.eq('business_id', bid)`. TOCTOU-window-only,
  same reasoning as L-01/L-02.
- **L-05, L-06** — CSP `unsafe-inline`/`unsafe-eval` and wildcard `frame-src`, both applied
  globally via `next.config.mjs`'s `source: '/(.*)'` rather than scoped to the specific routes
  that need them (the Ask Aria live-preview sandbox). Real fix is a per-path CSP header split,
  more than a one-line change, needs its own testing pass to confirm the preview sandbox still
  works with a scoped-down global policy.
- **getBid() P3 mechanical migration** — ~353 remaining files (of 362 total) still define a local
  copy. See §3.
- **Supabase Auth Hook for guard-bypass** — not deferred, confirmed unbuildable on the current
  Free plan. Revisit only if the founder upgrades to Team/Enterprise (see §5).
- **H-17 pre-existing `override_price`/`price` column-name bug** in `pos/price-lists` GET — see
  §2, out of scope for a security sprint, needs its own bug-fix pass.
- **CI wiring for `smoke.yml`** — needs a live GitHub Actions run to confirm it actually passes
  once TEST_* secrets are set (see §6/§7); not something this session can trigger without pushing.

---

## 9. Founder env checklist — deltas from P1

| Variable | Purpose | Status |
|----------|---------|--------|
| `NPS_WEBHOOK_SECRET` | Shared-secret gate on the inbound NPS SMS webhook (H-12) — placeholder until the real SMS provider is confirmed and real signature validation replaces it | **New, not set.** Until set, the endpoint fails closed (403 on every request) once deployed — **founder must set this or configure whatever the real inbound webhook auth should be before the next deploy touching this route**, otherwise inbound NPS collection breaks entirely (this route was NOT dead code like H-05 — treat as a real deployment risk, unlike Turnstile/P1's fail-open pattern) |
| `KIOSK_SESSION_SECRET` | HMAC-signs the `ariakiosk_${business_id}` kiosk session cookie | **New, not set.** Fails OPEN (logged warning) when absent — falls back to the exact pre-P2 presence-only cookie check, zero deployment risk, but the forgery gap this sprint fixed stays open until set |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | Smoke suite (local + now CI) | **Still not set in this environment** — confirmed by actually attempting the run, not assumed (§7) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Carried from P1 | Unchanged status — still not set per P1's report, not re-checked this sprint (out of scope) |

**Supabase plan note for the founder:** the org is on the **Free** plan. Two things in this report
are gated on that: the Password Verification Attempt Auth Hook (§5, Teams/Enterprise only) and,
by extension, any future server-side auth-attempt throttling that needs it.

---

## 10. Commit / build verification

- `npx tsc --noEmit` — 0 errors (one stale `.next/types/` reference to the deleted H-05 route
  found and cleared first — a build-cache artifact, not a real error, `.next/` is gitignored)
- `npm run build` — 0 errors, deleted H-05 route confirmed absent from the route manifest
- 1 migration this sprint (`credit_image_credits` RPC) applied and verified live via `pg_proc`
  before commit (RULE 10); `staff_portal_sessions.revoked_at`/`token_hash`/`expires_at` (used by
  the new staff-portal logout endpoint) confirmed live via `information_schema` — all pre-existing
  from P1, no new migration needed for that fix
- `vercel.json` unchanged — 9 functions, 22 crons (both pre-sprint values, confirmed via empty
  `git diff --stat`)
