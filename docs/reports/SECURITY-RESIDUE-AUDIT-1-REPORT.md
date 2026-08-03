# SECURITY-RESIDUE-AUDIT-1 — read-only re-verification of the launch-gate residue list

No code was changed, no commits made, no migrations run. Every classification below is from the
live code and/or a live Supabase query taken during this audit (2026-07-20), not from any prior
report's claim.

## Headline — one line per item

1. CONNECTOR TOKENS IN PLAINTEXT | **OPEN** | 5 of 7 providers write raw tokens (Xero has 3 separate write paths, none encrypted; Google/Meta/Kounta/Lightspeed all plaintext; Meta confirmed live via DB query) — only Square + Slack use the real per-business AES-256-GCM helper | Smallest fix: point Xero's 3 write sites + the 4 social/lightspeed callbacks at the existing `src/lib/integrations/connector-tokens.ts` helper (already proven correct for Slack).
2. `/api/health/deep` UNAUTHENTICATED | **CLOSED** | `src/app/api/health/deep/route.ts:74-76` requires a valid session + `isAdminEmail()`; anonymous/non-admin callers get a bare `404 {"error":"Not found"}` — no checks object, no env flags, no DB status | n/a.
3. MEDIA BUCKET SPLIT + PII ENCRYPTION | **buckets CLOSED / PII dual-write PARTIAL** | No public bucket holds PII (only product/marketing assets are `public=true`); `pos_customers.email_enc`/`phone_enc`/`name_enc` exist and work, but only 2 of 9 write sites populate them, and the 3 busiest **public** customer-intake routes (`loyalty/enrol`, `place-order`, `instore/loyalty`) never dual-write — 0 of the 15 newest customer rows have any `_enc` column populated | Smallest fix: call `encryptCustomerPII()` from those 3 public routes plus `pos/customers/[id]` PATCH and `customers/merge`.
4. SEC-H5 / SEC-H6 | **H5: dashboard toggle UNKNOWN, app enforcement OPEN / H6: PARTIAL** | No Supabase MCP tool exposes the Auth "confirm email" toggle (genuinely unverifiable from this environment); independently confirmed no server-side `email_confirmed_at` check exists anywhere (only 2 client-side redirects) — same root cause as the already-recorded M-05/L-07 finding. No live GitHub PAT value found anywhere in the repo or git history, but whether the specific previously-exposed token was revoked on GitHub's side cannot be checked from here | Smallest fix (H5 app gap): add a server-side `email_confirmed_at` check in middleware or a shared route helper. H5 toggle + H6: founder must manually confirm both in the Supabase and GitHub dashboards respectively.
5. CANON residue | **OPEN** | Resolver count unchanged at 247 since CANON-MIGRATE-4 (no regression) and zero new `neq('voided')`/hand-rolled-revenue instances since the guard existed — but `scripts/canon-rail-guard.ts` only triggers on `pull_request` in CI, and this repo pushes directly to `main` (3,300 commits, 0 PRs, ever) — **the guard has never once run against a real commit** despite being "wired into CI." 266 pre-existing violations (120 `neq('voided')` + 146 hand-rolled revenue sums across ~130 files) remain un-remediated and are outside the guard's scope regardless | Smallest fix: add a `push: branches: [main]` trigger to `canon-rail-guard.yml` and a `HEAD^..HEAD` diff code path for push events (the current `--base=origin/${{ github.base_ref }}` invocation is undefined outside `pull_request`).
6. PUBLIC SURFACE SWEEP | **mostly CLOSED, 1 HIGH + several MEDIUM/LOW open** | 185 unauthenticated/public-adjacent route files read in full (46 in `public/`+`instore/`+`webhooks/`+`health/`+`widget/`, 139 "stray" candidates elsewhere). The 4 routes already fixed this session (`widget/chat`, `instore/chat`, `instore/loyalty`, `loyalty/enrol`) are confirmed still fixed. New findings: an unauthenticated Xero OAuth callback that lets anyone hijack any business's Xero connection (HIGH), an unauthenticated PII-leaking + SMS-triggering review-request route (HIGH-ish), an identity-leaking loyalty QR/code-scan endpoint (MEDIUM), two webhook receivers with no signature verification (MEDIUM), and a handful of low-severity spoofing/rate-limit gaps | See ranked list below — each finding has its own smallest fix.

---

## Detailed evidence

### 1. Connector tokens

The real "SEC-5" pattern is `src/lib/encryption.ts` (`encryptField`/`decryptField`): AES-256-GCM,
**per-business** key derived via `HMAC-SHA256(ARIA_MASTER_ENCRYPTION_KEY, "aria-business-key-v1:"+businessId)`,
output `iv:authTag:ciphertext`. It is correctly consumed by `src/lib/integrations/connector-tokens.ts`
(generic `getConnectorTokens`/`writeConnectorTokens`) and `src/lib/integrations/square.ts`. Confirmed
callers of the generic helper today: **only Slack** (`src/lib/integrations/slack.ts`).

A second, weaker helper (`src/lib/integrations/crypto.ts`, global key `INTEGRATION_TOKEN_KEY`,
not per-business) exists and is used by exactly one route (`src/app/api/pos/integrations/route.ts:53-62`)
— which **silently falls back to storing the raw plaintext token** if `INTEGRATION_TOKEN_KEY` isn't
configured (a designed downgrade path per its own inline comment, not a bug, but still a live gap).

| Provider | Status | Evidence |
|---|---|---|
| Xero | Plaintext, 3 inconsistent paths | `pos/xero-sync/route.ts:26,31-35` writes+reads the token raw, no encrypt call at all; `pos/integrations/route.ts:53-62` uses the weak global-key helper with a plaintext fallback; `integrations/xero/callback/route.ts:67-72` (a third, unrelated Xero connect flow) writes plaintext into `businesses.xero_access_token`/`xero_refresh_token`. Live: `pos_oauth_integrations` has 0 rows, `businesses.xero_access_token` has 0 non-null rows — code is the only evidence, and it's unambiguous. |
| Google | Plaintext | 3 separate callback routes (`integrations/google/callback`, `social/google/callback`, `social/callback/google`) all write raw into `social_connections.access_token` (a column not even named `_encrypted`). No live `google_business` rows exist to double-check. |
| Meta (Facebook/Instagram) | Plaintext — **confirmed live** | `integrations/facebook/callback/route.ts:78-108`, `integrations/instagram/callback/route.ts:60-72`. Live query: `SELECT platform, left(access_token,15) FROM social_connections` returned `access_token = 'EAAYcyqqsRU8BRT...'` — the standard Meta Graph API bearer-token prefix, unambiguously plaintext. |
| Kounta | Plaintext | `integrations/kounta/callback/route.ts:54-65` upserts raw into `lightspeed_connections.access_token`/`refresh_token`. Table has 0 live rows. |
| Lightspeed (X-Series) | Plaintext | `integrations/lightspeed-x/callback/route.ts:42-53`, same table/pattern as Kounta. 0 live rows. |
| Square | **Correctly encrypted** | `src/lib/integrations/square.ts` uses `encryptField`. |
| Slack | **Correctly encrypted** | via `connector-tokens.ts` → `encryptField`. |

### 2. `/api/health/deep`

`src/app/api/health/deep/route.ts:74-76`:
```ts
const auth = createServerSupabaseClient()
const { data: { user } } = await auth.auth.getUser()
if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```
`getUser()` round-trips to Supabase to validate the session JWT (not a client-trusted decode);
`isAdminEmail()` (`src/lib/admin.ts:59-63`) checks against an `ADMIN_EMAILS` env allowlist. An
in-code comment confirms this was previously open ("pinged live Anthropic... zero auth, publicly
reachable by anyone") and was fixed in an earlier sprint, matching the `health/stripe` sibling's
pattern. Unauthenticated/non-admin response: bare `404 {"error":"Not found"}` — nothing else.
Sibling routes `/api/health` and `/api/healthz` are intentionally public but return only a status
flag and the already-public `NEXT_PUBLIC_APP_VERSION` — no gap there either.

### 3. Storage buckets + `pos_customers` PII encryption

**Buckets** (live `storage.buckets` query): `aria-exports`(private), `media`(public),
`pos-images`(public), `product-images`(public), `receipt-ocr`(private), `reel-scenes`(private),
`reel-uploads`(public), `reports`(private), `reusable-images`(public). Every public bucket is used
only for product photography, marketing assets, or stock images (confirmed by grepping every
`.storage.from(...).upload(...)` call site) — no PII/ID-scan/signed-document content in any public
bucket. **Unrelated minor bug found**: `receipt-ocr` and `reel-scenes` are private buckets but their
upload code calls `.getPublicUrl()` instead of `.createSignedUrl()` — broken image links, not a
security leak.

**PII dual-write (SEC-4/SEC-6)**: `pos_customers.email_enc`/`phone_enc`/`name_enc`/`notes_enc`
exist and the encryption helper (`src/lib/aria/customer-pii.ts`, AES-256-GCM via `encryption.ts`)
works. Live population (49 active rows): `email` 39/49 plaintext vs `email_enc` 37/49; `phone`
47/49 plaintext vs `phone_enc` 37/49; `notes_enc` 0/49 ever populated. **The 15 most-recently-created
rows (2026-07-01 → 07-06) all have plaintext email/phone and zero have any `_enc` column populated**
— the dual-write is not just historically incomplete, it is non-functional for customers created
today. Root cause: only 2 of 9 write sites call `encryptCustomerPII` (`customers/import/square`,
`pos/customers`); the 3 public-facing intake routes that create the most new rows today never do —
`public/loyalty/[business_id]/enrol`, `public/place-order/[business_id]`, `public/instore/loyalty`
— plus `pos/customers/[id]` PATCH and `customers/merge`.

### 4. SEC-H5 (email-confirm) / SEC-H6 (PAT rotation)

**H5 — dashboard toggle**: no Supabase MCP tool (checked all available: `get_project`,
`get_advisors`, `get_logs`, `list_*`, branch/migration tools) exposes Auth provider settings, and
no `supabase/config.toml` exists in-repo to infer local defaults from. **Genuinely UNKNOWN from
this environment** — requires a manual check of Authentication → Providers → Email in the Supabase
dashboard for project `nxfzippunqvqsvkmwtjv`.

**H5 — app-level enforcement (a separate, answerable question)**: **OPEN, independently
reconfirmed.** Only two places check `email_confirmed_at` anywhere in the codebase, and both are
`'use client'` components (`src/app/onboarding/page.tsx:147-148`, `src/app/verify-email/page.tsx:21`)
— client-side redirects only, trivially bypassed by calling any API route directly. No middleware
or route handler checks it server-side. This is the exact same root cause already on record as
`M-05`/`L-07` in `SECURITY-P2-REPORT.md`/`SECURITY-P3-LITE-REPORT.md`, deferred at the time as
"architectural" — still true today, regardless of whatever the dashboard toggle is set to.

**H6 — PAT rotation**: full-repo grep (`ghp_[A-Za-z0-9]+`) and `git log --all -p -S "ghp_"`
across every commit in history found **no live/complete PAT value** anywhere, tracked or
untracked (`.gitignore`-excluded `.next/cache` binary matches don't count). The only hits are the
same truncated, ellipsis-terminated documentation reference (`SECURITY-AUTHZ-AUDIT.md:428`,
"`ghp_wT8…`"). Whether that specific token has actually been revoked on GitHub's side cannot be
verified from this environment (`gh` CLI isn't available here, and even if it were, it can only
show the token *this* environment is authenticated with, not the exposed one's fate) —
**PARTIAL: repo-side evidence is clean, GitHub-side revocation needs a manual founder check** via
Settings → Developer settings → Personal access tokens (classic).

### 5. CANON residue

Fresh grep recount: **247 files** still define a local `getBid`/`getBusinessId`/`getBiz`-style
resolver (131 `pos/*`, 116 outside) — **identical** to the count CANON-MIGRATE-4 itself recorded;
no further migration has landed, and (more importantly for this task) no *new* resolver file has
been introduced since. The guard (`scripts/canon-rail-guard.ts`, added in commit `3aa4369a`,
2026-07-17) correctly exits non-zero on any violation with no `continue-on-error` escape hatch.

Fresh repo-wide search for the other two forbidden patterns: **120** occurrences of
`.neq('status','voided')` across 77 files, **146** hand-rolled revenue `.reduce()` sums across 89
files (excluding the canonical `revenue-snapshot.ts` itself). Git-blaming every single occurrence
of both patterns: the newest instance of either predates the guard's existence by hours-to-days —
**zero new instances of any forbidden pattern have landed since the guard existed.** The 266 live
instances are 100% pre-existing debt the guard was never meant to retroactively clean up.

**The critical finding**: `.github/workflows/canon-rail-guard.yml` exists and correctly invokes the
script with no error-swallowing — but its only trigger is `on: pull_request`. This repository's
actual, CLAUDE.md-mandated workflow is direct `git push origin main` with no PR step at all —
empirically confirmed: 3,300 commits on `main`, **zero** merged pull requests, ever. Since the
guard was added, 7 commits (including CANON-MIGRATE-4 itself) have landed directly on `main`. **The
guard has technically never executed against a single real commit in this repository's history.**
Simply adding a `push` trigger isn't a complete fix either — the script's diff invocation
(`--base=origin/${{ github.base_ref }}`) relies on `base_ref`, which is undefined outside
`pull_request` events; a push-triggered variant needs a `HEAD^..HEAD` diff code path instead.

### 6. Public surface sweep

185 route files read in full: the 46 files under `public/`, `instore/`, `webhooks/`, `health/`,
`widget/`, plus a 139-file sweep of every other route lacking an obviously-recognized auth pattern
(later found to include 3 legitimate custom auth systems the initial regex didn't recognize:
`verifyCronAuth()`, the community cookie-session, and the loyalty cookie-session — all 3 confirmed
sound on inspection). The 4 routes fixed earlier this session were spot-checked and confirmed still
correct: `public/widget/chat`, `public/instore/chat`, `public/instore/loyalty`,
`public/loyalty/[business_id]/enrol`.

**New findings, most to least severe** (full detail in the ranked list below):
1. `src/app/api/xero/callback/route.ts` — unauthenticated OAuth callback, HIGH.
2. `src/app/api/reviews/auto-request/route.ts` — unauthenticated PII leak + real SMS spend, HIGH-ish.
3. `src/app/api/public/kiosk/loyalty-scan/route.ts` + `src/lib/loyalty/resolve-code.ts` — identity-bearing existence oracle, MEDIUM.
4. `src/app/api/pos/parcel-tracking/webhook/route.ts`, `src/app/api/reels/fal-webhook/route.ts` — no signature verification, MEDIUM.
5. `src/app/api/community/live/[id]/chat/route.ts`, `src/app/api/community/live/viewers/route.ts` — unauthenticated spoofing/manipulation, no PII, LOW-MEDIUM.
6. `src/app/api/widget/config/route.ts` (older widget), `src/app/api/public/place-order/[business_id]/route.ts` — missing route-specific rate limits, LOW.
7. `src/app/api/quotes/[id]/view/route.ts`, `src/app/api/invoices/track/[id]/route.ts` — UUID-as-secret write-only beacons, no data exposure, LOW.

**Confirmed genuinely closed, no action needed**: all 9 `loyalty/*` routes (session-cookie gated
via `src/lib/loyalty/auth.ts`, no IDOR path found), all 75 `cron/*`+`crons/*` routes
(`verifyCronAuth()`, fail-closed), `community/dm`+`community/chats` (member_id-scoped from a
session cookie, no addressable-by-id path to another member's thread), `webhooks/stripe` (real
target file `stripe/webhook/route.ts` verified: fails closed on missing signature/secret,
`stripe.webhooks.constructEvent`), `twilio/webhook` (fully retired, unconditional 410, no Twilio
import present so the project's "any Twilio import = HIGH" rule doesn't even apply),
`quotes/[id]/accept`, `shared/[token]`, `aria/share/[token]` (all properly token-gated with
adequate entropy).

---

## Ranked fix list by real exploitability

Using the SC-3 lesson (`supabaseAdmin` + no ownership check + a guessable/public key = worst case):

1. **`src/app/api/xero/callback/route.ts` — CRITICAL.** The initiating route
   (`src/app/api/xero/connect/route.ts:26-32`) sets OAuth `state` to the bare business UUID with no
   signed anti-CSRF nonce and no binding to the session that started the flow. The callback
   (`xero/callback/route.ts:36-66`) trusts `state` outright and writes the token straight into
   `businesses` via `supabaseAdmin` with zero ownership check. Business IDs are not secret in this
   app (returned by several public directory/discovery routes). **Anyone can complete their own
   legitimate Xero OAuth consent, then replay the resulting `code` against any target
   `business_id`** — no victim interaction required — hijacking that business's Xero connection.
   Given item #1's finding that Xero tokens are also stored in plaintext, a successful hijack here
   is doubly bad. Highest-priority fix in this whole audit.
2. **CANON guard never actually executing (item 5).** Not a single exploit, but it means this
   repo's only automated backstop against reintroducing the exact bug class item #1 exhibits
   (unowned writes, wrong-filter revenue bugs) has been completely inert since the day it was
   added. Cheap, mechanical fix (add a `push` trigger + `HEAD^..HEAD` diff mode) — fix this before
   or alongside #1 so the fix itself is guarded going forward.
3. **Connector tokens plaintext, 5 providers (item 1).** Meta's live token is confirmed plaintext
   in the DB today. Any future DB-read bug or compromised `supabaseAdmin`-scoped code path yields
   directly usable third-party API credentials for Xero/Google/Meta/Kounta/Lightspeed.
4. **`src/app/api/reviews/auto-request/route.ts` — HIGH-ish.** No caller authentication despite an
   inline comment claiming it's POS-internal-only. A successful call returns the customer's real
   phone number and name directly in the JSON response, keyed off a guessable `sale_id` — and
   triggers a real, paid ClickSend SMS send with no authorization at all (spam + cost-abuse vector,
   the same class of unlogged spend this codebase has been burned by before per RULE 11).
5. **`pos_customers` PII dual-write gap on public intake routes (item 3).** Not a leak today
   (plaintext is still the live source of truth), but it means the SEC-6 encryption-at-rest
   investment provides zero protection for any customer created via the public loyalty/enrol,
   place-order, or in-store-kiosk flows since at least early July — a silently-failing safety net.
6. **`src/app/api/public/kiosk/loyalty-scan/route.ts` (item 6).** Same identity-leak shape already
   fixed elsewhere this session (name/points/stamps/tier with no ownership proof), gated only by
   the global 30/min/IP floor — no route-specific throttle, and the 3-way response
   (invalid/not-found/found) is itself a partial oracle.
7. **No server-side `email_confirmed_at` enforcement (item 4, SEC-H5 app-level).** Architectural,
   previously deferred, independently reconfirmed still open — any unconfirmed account can call
   POS/Aria routes directly today.
8. **`pos/parcel-tracking/webhook` and `reels/fal-webhook` — no signature verification (item 6).**
   Bounded blast radius (requires knowing/guessing a tracking number or job id) but real: fake
   carrier-status injection (can trigger an autopilot "delivery exception" action) and an
   attacker-influenced server-side URL fetch on the fal webhook.
9. **`community/live/[id]/chat` + `community/live/viewers` — no auth, no rate limit (item 6).** No
   PII exposure; spoofable chat identity and arbitrary viewer-count manipulation on live streams.
10. **Missing route-specific rate limits: `widget/config` (older widget, zero limiting at any
    layer since it's outside `/api/public/`) and `public/place-order` (creates real Stripe
    PaymentIntents behind only the shared global floor).** Low severity, cheap to close.
11. **SEC-H6 PAT rotation + SEC-H5 dashboard toggle — administrative, not code.** No live evidence
    of continued exposure found in this repo; both need a human to confirm directly in the GitHub
    and Supabase dashboards respectively.
12. **`quotes/[id]/view` / `invoices/track/[id]` — UUID-as-secret write-only beacons.** Lowest
    priority: no data is ever returned either way, worst case is a flipped `viewed_at`/polluted
    view-count if a UUID is guessed (~122 bits, impractical to brute force).
