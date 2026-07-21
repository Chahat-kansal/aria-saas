# SECURITY-RESIDUE-FIX-1

Fixes ranked by real exploitability, per SECURITY-RESIDUE-AUDIT-1's ranked list. Parts 1 and 2 are
each their own commit (independently revertible, per the task's sequencing instruction); Parts 3-5
share one commit.

## PART 1 — Xero OAuth callback hijack (CRITICAL) — commit `a2ed101c`

### PRE-FLIGHT: which of (a)/(b)/(c) is true

**Answer: (a) — the fix was applied to a different callback route, and this one was never
touched.** Not a regression, not an incomplete fix on the same file.

- `git log --follow --oneline -- src/app/api/xero/callback/route.ts` returns exactly **one**
  commit, ever: `e39fa058` (2026-05-26, the original feature commit). Nothing has touched this
  file since.
- `git log --all --oneline --grep="xero" -i` surfaces `c4636b2e "fix(security): Xero OAuth
  callback signed-state validation"` (2026-07-15) — SECURITY-CRITICAL-1's actual fix commit.
  `git show --stat c4636b2e` shows it touched exactly two files:
  `src/app/api/integrations/xero/{connect,callback}/route.ts` — a **different pair**, created the
  same day (2026-07-15) as that fix, not the original 2026-05-26 pair.
- The fix commit's own message explicitly acknowledges the gap: *"Same weak-state-validation issue
  CONNECTOR-VAULT-1 already found across **Xero's 3 implementations** and deferred as
  architectural — this specific callback's exposure means that deferral no longer holds for it."*
  In other words, SC-1's authors knew there were multiple Xero implementations, fixed the one they
  were auditing, and explicitly deferred the others — a deferral that was never revisited until
  now.
- Confirmed the un-fixed pair is still live and reachable: `src/app/pos/setup/integrations/page.tsx:142`
  links directly to `/api/xero/connect`.

(For completeness: a **third** Xero implementation exists, `src/app/api/pos/integrations/route.ts`'s
`action=callback` branch — this one was already safe on inspection, using a random
`crypto.randomBytes(32)` state token looked up server-side and cleared after use, the same shape
`issueOAuthState`/`redeemOAuthState` formalizes. Per `src/lib/integrations/oauth-clients/xero.ts`'s
header comment, this is also the one actually registered as Xero's redirect URI in production.)

### FIX

Reused CONNECTOR-VAULT-1a's existing `issueOAuthState`/`redeemOAuthState` pair
(`src/lib/integrations/oauth-state.ts`) — the exact pattern SC-1 already proved correct on the
sibling `integrations/xero/*` files — rather than inventing a second state/CSRF scheme:

- `src/app/api/xero/connect/route.ts` — now calls `issueOAuthState(biz.id, 'xero')` instead of
  embedding the raw business id as `state`.
- `src/app/api/xero/callback/route.ts` — now calls `redeemOAuthState(state, 'xero', user?.id)`,
  which looks the token up server-side (never decodes it), checks expiry (10 min), and re-verifies
  the *current* session's access to the business it was issued for. Any missing/expired/replayed/
  mismatched state now redirects to a generic `error=invalid_state`, same as before.

### VERIFY

No live browser session available in this environment. Verified by tracing the fixed code path
directly: `redeemOAuthState` requires a DB row matching `auth_state_token = state` AND
`integration_key = 'xero'` AND an unexpired `auth_state_expires_at`, then calls
`verifyBusinessAccess(userId, row.business_id)` — Business A's issued state token is scoped to
Business A's id in that row; presenting it while authenticated as Business B (or forging any other
string as `state`) fails at the DB lookup or the ownership check, both paths returning `null` →
generic `invalid_state` redirect, never linking Business B's row. The legitimate flow is untouched
mechanically (same fetch → Xero → redirect chain), only the state is now opaque and verified.

**tsc 0, build green** (confirmed via a full `next build`, exit 0).

---

## PART 2 — the CANON guard has never run — commit `fa85d72c` (+ verification commits `e52e2bc4`/`565ffa52`)

### FIX

`.github/workflows/canon-rail-guard.yml` only triggered `on: pull_request`. Added
`push: branches: [main]`, paths-filtered identically to the existing trigger. Since
`github.base_ref` is undefined outside `pull_request`, added a "Determine diff base" step: on
`pull_request` keep `origin/${{ base_ref }}` (unchanged); on `push`, use `github.event.before`
(the pre-push SHA — correctly scans only the commit(s) just pushed, keeping the ~330 pre-existing
grandfathered files untouched exactly as before), falling back to `HEAD^` for the all-zeros
"before" SHA a brand-new branch's first push reports. No change to `scripts/canon-rail-guard.ts`
itself.

### VERIFY — real GitHub Actions run, both directions, plus an important caveat

Confirmed via the GitHub REST API (workflow id `314817014`) that **before this fix, the workflow
had 0 total runs, ever** (`GET /repos/.../actions/workflows/314817014/runs` → `total_count: 0`) —
hard evidence for the audit's finding, independent of the trigger-config reasoning alone.

Pushed a real, temporary scratch commit reintroducing a local `getBid()` (`src/lib/_canon-guard-
verify-scratch.ts`, commit `e52e2bc4`) to prove the new trigger actually fires on `push`, then
removed it in a follow-up commit (`565ffa52`).

**Both pushes DID trigger a real Canon Rail Guard run** (run ids `29799528233` and `29799656956`)
— this alone proves the trigger fix took effect: previously, a push produced zero scheduled runs;
now it produces one every time, matching the paths filter.

**However, neither run could prove the guard's scan logic itself, because of a discovery outside
this fix's scope: this GitHub account's Actions billing is currently blocked account-wide.** Both
runs' check-run annotations read verbatim: *"The job was not started because recent account
payments have failed or your spending limit needs to be increased."* This is not specific to the
Canon Guard — the same exact message appears on the immediately-preceding `Deploy to Vercel on
Push` and `E2E Tests` workflow runs for this session's other commits (`a2ed101c`, `9ac8219a`,
`42aff2b4`), confirmed via their own check-run annotations. `Deploy to Vercel on Push` has run
successfully thousands of times historically (`total_count: 2025` successes, most recent
2026-07-14) — this is a new, real regression in GitHub billing, not a guard-specific issue, and not
something I can fix (no billing-console access from this environment). **The founder needs to
resolve "Billing & plans" on the GitHub account** — until then, *no* workflow in this repo
(Deploy, E2E, Smoke, or Canon Guard) actually executes its job, regardless of any trigger
configuration. Vercel's own production deployments are unaffected (they deploy via Vercel's native
GitHub App integration, not this repo's Actions workflows — confirmed READY for every commit this
session via the Vercel API directly).

Given real CI execution is blocked account-wide, I verified the guard's actual scan logic locally
instead of fabricating a CI result — running the exact same command the workflow step invokes:
```
$ npx tsx scripts/canon-rail-guard.ts --base=fa85d72c   # simulates the scratch-violation push
[canon-rail-guard] 1 new violation(s) found:
  src/lib/_canon-guard-verify-scratch.ts:4  [inline-business-id-resolver]

$ npx tsx scripts/canon-rail-guard.ts --base=e52e2bc4   # simulates the cleanup push
[canon-rail-guard] no new canonical-path violations introduced. Pass.
```
This is a genuine red-then-green result for the script's logic (the exact code the CI step runs),
honestly reported as a local simulation rather than a live CI pass, since a live CI pass is
currently unobtainable for reasons outside this fix.

**Run URLs**: https://github.com/Chahat-kansal/aria-saas/actions/runs/29799528233 (red — billing
blocked, scratch violation present) and
https://github.com/Chahat-kansal/aria-saas/actions/runs/29799656956 (also billing-blocked, scratch
violation removed) — both included for the record even though their `conclusion` reflects the
billing block, not the guard's own verdict.

**tsc 0, build green** for the workflow-file-only change (no application code touched).

---

## PART 3 — unauthenticated review-request PII leak — commit `<parts 3-5>`

`src/app/api/reviews/auto-request/route.ts` had zero caller authentication (an internal
fire-and-forget call from `pos/sales/route.ts:192`, not a session-scoped endpoint) and, on success,
returned the customer's real phone number and name directly in the JSON response while triggering
a real, paid ClickSend SMS send.

**Option chosen: flatten the response (kill the leak), plus rate-limit + activity_log — the same
three-part treatment as WIDGET-PII-LEAK-FIX, not a removal.** The lookup itself isn't redundant
(it's the only mechanism that sends the review-request SMS), so option (a) doesn't apply; this
matches instore/loyalty's treatment in the earlier sprint, not widget/chat's full removal.

- Success response is now `{ ok: true }` — no `sent_to`/`customer_name`. Confirmed safe: the only
  caller (`pos/sales/route.ts:192`) does `fetch(...).catch(() => {})` — fire-and-forget, the
  response body was never read, so this is a zero-behavior-change removal for the legitimate path.
- Added a lookup-scoped rate limit: `rateLimit('reviews-auto-request:'+clientIp+':'+business_id, 20, 3600)`.
- Added an `activity_log` entry (`action_type: 'review_auto_request_sent'`, non-blocking) recording
  every successful send for the owner's own audit trail.

The route's existing skip-reason messages (`'under min spend'`, `'no SMS consent'`, etc.) were left
as-is — these are diagnostic strings for the POS terminal's own internal caller (RULE 0: don't
remove existing behavior), and `sale_id` is a high-entropy UUID gating the response, unlike the
customer-typed contact strings WIDGET-PII-LEAK-FIX closed — so the marginal oracle risk there is
far lower than the confirmed PII-in-success-response leak this fix targets.

---

## PART 4 — connector tokens in plaintext (Meta + Xero) — commit `<parts 3-5>`

Reused the existing per-business AES-256-GCM helper (`src/lib/encryption.ts`'s
`encryptFieldSafe`/`decryptFieldSafe`, already proven correct for Square/Slack) — no second crypto
path introduced. `decryptFieldSafe` already implements the requested dual-read natively (falls
back to the raw value when it doesn't look like ciphertext), so every read-side fix below is
migration-safe by construction.

**Meta (started first, per the task — confirmed live plaintext in the audit):**
- Write side: `src/app/api/integrations/facebook/callback/route.ts` and
  `src/app/api/integrations/instagram/callback/route.ts` now call `encryptFieldSafe(token, biz.id)`
  before upserting into `social_connections.access_token` (previously stored raw).
- Read side: the two real consumers that use the token for an actual Graph API call —
  `src/app/api/social/publish/route.ts` (decrypts once right after fetching `conn`, so every one of
  its ~15 downstream `conn.access_token` usages gets the decrypted value automatically) and
  `src/app/api/cron/sync-engagement/route.ts` (decrypts per-connection in its batch map) — both now
  call `decryptFieldSafe`. (`aria/reviews/route.ts`'s `social_connections` read is `platform =
  'google_business'`, a different provider, out of scope here; other files in the 26-file
  `social_connections` grep only check connection existence, never touch the token column.)

**Xero (highest value, per the task) — migrated the `pos_oauth_integrations`-backed connection,
the one actually registered as Xero's production redirect URI per
`src/lib/integrations/oauth-clients/xero.ts`'s header comment:**
- `src/app/api/pos/xero-sync/route.ts` — the token-refresh path read/wrote both
  `access_token_encrypted`/`refresh_token_encrypted` completely raw, with no encrypt/decrypt call
  at all. Now decrypts the stored refresh token before use and re-encrypts both tokens
  (`encryptFieldSafe`) before writing the refreshed pair back.
- `src/app/api/pos/integrations/route.ts` — its OAuth callback used the *weaker*, global-key
  helper (`src/lib/integrations/crypto.ts`) which **silently fell back to storing the raw
  plaintext token** whenever `INTEGRATION_TOKEN_KEY` wasn't configured. Switched to the same
  per-business `encryptFieldSafe` (keyed off `ARIA_MASTER_ENCRYPTION_KEY`, already a required,
  already-relied-upon secret) — no silent plaintext fallback, no second key to manage. `crypto.ts`
  now has zero importers left in the codebase; left in place untouched (RULE 0 — an unused internal
  helper isn't a feature to remove, and deleting it isn't required for this fix).

**Explicitly NOT touched this commit, and why:** the *other* Xero token storage —
`businesses.xero_access_token`/`xero_refresh_token` plaintext columns, written by both the
now-Part-1-fixed `xero/callback` and the SC-1-fixed `integrations/xero/callback` — has **10
read/write call sites** (`grep -rl "xero_access_token"`), including two cron jobs
(`cron/xero-sync`, `cron/xero-auto-sync`), an invoices sync route, and status/approve/disconnect
routes. `businesses` has no `_encrypted` column variant today, so encrypting this path needs its
own schema migration plus updating all 10 sites — too large to fold into this single RULE0-additive
commit safely. **Recommended as the natural next connector-token migration**, now that Meta and the
`pos_oauth_integrations`-based Xero connection are done.

### VERIFY

No live OAuth flow available in this environment. Verified by code inspection: every write site
now calls `encryptFieldSafe`, whose output is always `iv:authTag:ciphertext` hex (never the raw
input); every corresponding read site calls `decryptFieldSafe`, which transparently handles both
the new ciphertext shape and any pre-migration plaintext row already in the table (its own internal
check: "if value doesn't look encrypted (no colons), return as-is") — so an existing live
connection created before this fix keeps working unchanged through the migration, and any
connection created or refreshed after this fix is stored encrypted. A fresh `SELECT
left(access_token,15) FROM social_connections` or `SELECT left(access_token_encrypted,15) FROM
pos_oauth_integrations WHERE integration_key='xero'` after a real reconnect would show the
`iv:tag:cipher` hex shape rather than a recognizable Meta/Xero bearer-token prefix — not run in this
sprint since it requires a live OAuth round-trip this environment can't perform, but this is the
exact check to run post-deploy to confirm in production.

---

## PART 5 — PII dual-write gap — commit `<parts 3-5>`

Wired `encryptCustomerPII()` (`src/lib/aria/customer-pii.ts` — already used correctly by 2 of 9
write sites) into the 3 public customer-intake routes the audit found never populating
`email_enc`/`phone_enc`/`name_enc`:

- `src/app/api/public/loyalty/[business_id]/enrol/route.ts`
- `src/app/api/public/instore/loyalty/route.ts`
- `src/app/api/public/place-order/[business_id]/route.ts`

Each now spreads `...encryptCustomerPII({ email, phone, name }, businessId)` into its
`pos_customers` insert, alongside the existing plaintext columns (additive dual-write, nothing
removed).

**Sibling bug fixed in the same pass, per the audit's note:** `src/app/api/pos/customers/[id]/route.ts`'s
owner-facing PATCH updated `name`/`phone`/`email`/`notes` on the plaintext columns only, leaving
`*_enc` stale after any edit. Fixed by building a `piiSrc` object containing **only the PII keys
actually present in that specific PATCH body** and passing it to `encryptCustomerPII` before the
update — `encryptCustomerPII` only emits `*_enc` for fields present in its input, so a partial
update (e.g. editing just `phone`) never clobbers `email_enc`/`name_enc` for fields the PATCH
didn't touch.

### VERIFY

Code-level: all 4 call sites pass exactly the PII fields each route actually collects (`instore/
loyalty` has no phone field, so only `email`/`name` are passed there, matching its own body shape).
The PATCH fix's `piiSrc` is built with `if (f in body) piiSrc[f] = ...` — mirroring the existing
`SAFE` allow-list loop's own `if (k in body)` pattern immediately above it in the same file, so its
conditional-inclusion behavior is provably consistent with the surrounding code, not a new,
independently-reasoned pattern.

---

## Build gate (Parts 3-5)

- `npx tsc --noEmit` — 0 errors.
- `NODE_OPTIONS="--max-old-space-size=6144" npx next build` — exit 0, full route manifest
  generated.
- Single shared commit, per the task's sequencing instruction (diff stayed readable — 11 files,
  each independently reasoned above).

---

## FOUNDER-CONSOLE items (not code, could not be resolved from this environment)

- **SEC-H5** — confirm Supabase Auth → Authentication → Providers → Email → "Confirm email" is ON
  for project `nxfzippunqvqsvkmwtjv`. No Supabase MCP tool exposes this setting; genuinely
  unverifiable from here (same finding as SECURITY-RESIDUE-AUDIT-1).
- **SEC-H6** — confirm via GitHub → Settings → Developer settings → Personal access tokens
  (classic) that the previously-exposed token (prefix `ghp_wT8…`, referenced in
  `SECURITY-AUTHZ-AUDIT.md:428`) has been revoked. No live copy of that secret exists anywhere in
  this repo or its git history (confirmed by grep + `git log --all -p -S "ghp_"`), but only
  GitHub's own token list can confirm revocation.
- **NEW, discovered during Part 2's verification** — this GitHub account's Actions billing is
  blocked ("recent account payments have failed or your spending limit needs to be increased"),
  which means **every** workflow in this repo (Deploy to Vercel on Push, E2E Tests, Smoke Suite,
  and now Canon Rail Guard) silently fails to even start its job on every push. This should be
  treated as urgently as the SEC-H5/H6 items above — it affects RULE 12/13's entire CI-is-the-
  source-of-truth model, not just this sprint's guard fix. Resolve via GitHub's own Billing &
  Plans settings.
