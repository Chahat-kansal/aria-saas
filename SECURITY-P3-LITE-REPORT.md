# SECURITY-P3-LITE — Safe Cleanup Cluster

**Date:** 2026-07-14 | **Scope:** 5 numbered items, explicitly excluding POS sale consolidation,
build-gate flip, AI guardrail unification, Tauri decision, offline POS (each has its own
sprint/decision). **Rule followed:** single commit per numbered item, tsc 0 + build 0 at each step.

---

## Item 1 — `billing/reels-usage/route.ts` auth

**Already done before this sprint started.** An external full-read audit flagged this mid-way
through SECURITY-P2 (2026-07-14) as a P0; fixed and pushed same-session as commit `3b0425c3`
("P0 — require auth on billing/reels-usage, was accepting bare business_id"). Confirmed still in
place at the start of this sprint (`git log` + direct read of the route) — no rework needed. See
that commit / `SECURITY-P2-REPORT.md` §0 for the full writeup (verified zero live callers,
`reel_usage_log` has 0 rows ever, `increment_reel_invoice` RPC doesn't exist live — a separate
pre-existing bug, not fixed).

---

## Item 2 — Legacy Twilio references

**Commit:** `3f2a3935`

Investigated `build-log.txt`'s "Module not found: Can't resolve 'twilio'" warnings before touching
anything. Finding: **the actual import-level fix already happened** — commit `48ce8fd7`
("AUD-1-TWILIO-FIX: remove twilio / route SMS agents via ClickSend", 2026-06-17) confirmed as an
ancestor of current HEAD. All 4 files the build log named
(`agents/reputation/request/route.ts`, `lib/agents/labour-optimisation-agent.ts`,
`reputation-defence-agent.ts`, `waste-elimination-agent.ts`) already import `sendSMS` from
`@/lib/clicksend`, not `twilio`.

`build-log.txt` itself is a stale, tracked build artifact — file mtime 2026-06-06, **11 days
before** the actual fix landed. It was never regenerated, so it kept describing an already-solved
problem (the same shape of issue as this session's earlier `WORKTREE-TRIAGE-1` sprint, which found
`SECURITY-AUTHZ-AUDIT.md` and other artifacts drifting from live reality). Untracked and
gitignored — 602KB of stale generated output has no business being version-controlled.

**What was genuinely still stale:** user-facing and AI-facing text naming the wrong vendor (not
code paths):
- `src/lib/aria-tools.ts` + `src/app/api/aria/ask/route.ts`: Aria's own tool description and a
  cost-tracking comment said "via Twilio"
- **Real correctness bug, not just cosmetic:** `ask/route.ts`'s AI-instruction text told the model
  to match on the error string `"Twilio not configured"` — but the actual runtime error
  (`src/lib/clicksend.ts`) is `"SMS not configured"` (no vendor name at all). That instruction
  branch could never have fired. Fixed both the vendor name and the match string together.
- `src/app/dashboard/marketing/page.tsx`, `src/app/privacy/page.tsx` (legal data-sharing
  disclosure — was naming the wrong SMS processor to customers), `src/app/api/staff/messages/route.ts`,
  `src/app/api/customers/bulk-winback/route.ts`: comment/string corrections only.

**Deliberately NOT touched (documented, not silently ignored):**
- `twilio_sid` column name (3 tables, 9 occurrences in `database.types.ts`) and internal status/
  error VALUES (`'pending_twilio'`, `'twilio_not_configured'`) written to and read from the DB —
  renaming these needs a migration + a consumer audit across every reader, out of scope for "safe
  cleanup"; purely inert legacy naming, zero functional impact.
- `database.types.ts` — auto-generated from the live schema, never hand-edited.
- `src/app/api/twilio/webhook/route.ts` (a deliberate 410 Gone retirement marker from
  MSG-COMPLIANCE-2) and the `nps-response.ts` comments (from this session's own P2 work on H-12) —
  both already correctly describe the Twilio retirement.
- **Found, flagged, not fixed:** `dashboard/marketing`'s "Go to Integrations →" link points at a
  settings page with **no SMS section at all** — ClickSend config is admin/system-only, env-var
  driven (`src/app/admin/system/page.tsx`), never exposed to individual business owners via any UI.
  This dead-end predates and is unrelated to the vendor-name issue — a UX/product decision (should
  SMS be self-service configurable, or should the error just say "contact support"?), not a
  mechanical text swap. **Flagged for a P4/product decision, not resolved here.**

---

## Item 3 — RLS verify pass

**Commit:** `cc633f13`

**Could not locate a "24 flagged tables" source list anywhere in the repo** (checked
`docs/audit/SCHEMA-TRUTH.md`, `WIRING_AUDIT.md`, `DATA_SAFETY.md`) — used live Supabase security
advisors (`get_advisors`, type=security) as the authoritative current source instead.

**Live reality vs. the task's framing:** exactly **6** public-schema tables have RLS fully
disabled today (`rls_disabled_in_public`), not 24: `_dup_customer_merge_log`,
`business_brain_cache`, `client_hydration_beacons`, `cost_events`, `cost_subscriptions`,
`staff_portal_sessions`. Separately, direct `pg_class` verification of the 6 example table names
from the task text found **5 of 6 already have RLS enabled with a real policy**
(`admin_audit_log`, `admin_users`, `feature_flags`, `support_tickets`, `usage_logs`) — only
`business_brain_cache` overlaps with the actually-disabled set. Same pattern as item 2:
whatever produced the "24" figure doesn't match current live state; most of what it named is
already fine.

### Table-by-table verify pass (the 6 genuinely RLS-disabled tables)

Verified every access site in `src/` for each before touching anything (dispatched a dedicated
research pass — grep + read every query site, classify client type).

| Table | Access pattern | Anon-key/PostgREST reachable? | Verdict |
|-------|----------------|-------------------------------|---------|
| `staff_portal_sessions` | `supabaseAdmin` only (`src/lib/staff-portal/session.ts`) | No | **RLS enabled.** Highest priority of the 6 — stores hashed staff auth session tokens, this exact subsystem has already had one real shipped vulnerability (SECURITY-P1/C-08). |
| `_dup_customer_merge_log` | **Zero live code references anywhere** — created once by `supabase/migrations/20260708000001_merge_dup_customers.sql` as a backup snapshot before the 2026-07-08 customer-dedupe merge | No (no code path exists at all) | **RLS enabled** (safe/additive). Contains full customer PII with no ongoing use — **whether to keep, archive, or drop this table is a founder decision, not resolved in this sprint.** |
| `business_brain_cache` | `makeLazyServiceRoleClient()` only (`src/lib/aria/business-brain.ts`) | No | **RLS enabled.** Per-business AI analysis cache; defense-in-depth. |
| `cost_events` | `getAdminClient()`/`supabaseAdmin` only, every route additionally `isAdminEmail()`-gated | No | **RLS enabled.** Cross-tenant financial ledger; defense-in-depth. |
| `cost_subscriptions` | Same as `cost_events` | No | **RLS enabled.** Defense-in-depth. |
| `client_hydration_beacons` | `supabaseAdmin` only; browser reaches it via `sendBeacon()` → a Next.js API route → server-side insert, never direct PostgREST | No | **RLS enabled.** Lowest priority — non-sensitive telemetry (path/build_id/timestamp), migration comment explicitly documents "no RLS complexity" as an intentional original design choice. Enabled anyway for consistency, zero cost. |

**None of the 6 were a live/exploitable gap today** — every access site uses a service-role
client, which bypasses RLS regardless of whether it's enabled. This is the same
`rls_enabled_no_policy` defense-in-depth pattern already used on 34 other tables in this codebase.
Enabling RLS with no policy is zero functional change for every current caller.

**Verified live, before and after** (RULE 10): `pg_class.relrowsecurity` false→true on all 6;
re-ran `get_advisors` after — `rls_disabled_in_public` count is now 0 (was 6).

**Explicitly out of scope for this pass:** 34 tables flagged `rls_enabled_no_policy` (RLS is
already ON, just no explicit policy — already fail-closed, lower urgency) and 9 flagged
`rls_policy_always_true` (has a policy, but it doesn't actually filter anything — needs individual
judgment on whether that's intentional per-table, not mechanical). A full pass on all 43 is a P4
candidate, not "lite" scope.

---

## Item 4 — getBid() mechanical migration, batch 2

**Commit:** `7faaab54`

Continues the P2 extraction (9 files: 8 `pos/` + 1 `aria/`) toward the remaining 353. Picked
`api/staff/` as the next batch — **24 files**, a complete, cleanly-mechanical group.

**Verified before migrating, not assumed:** extracted and diff'd all 24 local `getBid()`
definitions first. All functionally identical to the canonical helper (`src/lib/auth/get-bid.ts`)
modulo two harmless variants — 5/24 already had the `.order('created_at', {ascending: true})`
fallback clause the other 19 lacked (same non-issue as P2's `artifact-parse-failure` migration:
only matters if a business somehow has multiple active `businesses` rows with no
`user_active_business` row set — the canonical helper's behavior is strictly more consistent, not
a regression); `availability/route.ts` used different local variable names with no return-type
annotation (cosmetic only). **No judgment calls needed for this batch** — confirmed safe for a
pure mechanical swap before running it, per the sprint's own stop-and-report instruction.

Migrated via a verified Python script (removed each local function block, inserted the canonical
import) rather than 48 individual manual edits — script output double-checked with a repo-wide
grep confirming zero remaining local `getBid()` definitions and exactly 24 canonical imports in
`api/staff/`.

**Remaining after this batch: 353 − 24 = 329 files**, across `api/pos` (180), `api/aria` (73),
`api/loyalty` (16), `api/integrations` (13), `api/training` (7), `api/tickets` (7),
`api/dashboard` (6), `api/social` (5), and 14 smaller groups (1–4 files each). Tracked as the
ongoing P4 mechanical-migration list — `api/pos` (180 files) is by far the largest remaining group
and should be its own dedicated batch given the size, likely split further by sub-area
(categories/suppliers-style vs. terminal/sale-flow routes) rather than attempted in one pass.

---

## Item 5 — Remaining L-01–07 triage

| ID | Finding | Status | Action |
|----|---------|--------|--------|
| L-01 | `customers/[id]/summarise` — `select('*')` (full PII) fetched before the ownership check | Confirmed still open | **Fixed** — added a minimal `select('id, business_id')` pre-check, ownership verified against that, THEN the full PII row is loaded. One extra round-trip, zero behavior change for the legitimate path. |
| L-02 | `customers/[id]/ai-summary` — same fetch-before-check pattern | Confirmed still open | **Fixed** — identical pattern to L-01. |
| L-03 | `loyalty/redeem` — final `UPDATE` on `pos_customers` missing `.eq('business_id', bid)` | Confirmed still open | **Fixed** — one `.eq()` addition. The prior `SELECT` in the same handler was already scoped by both `id` and `business_id`, so this closes a TOCTOU window only, no behavior change for legitimate calls. |
| L-04 | Staff-portal OTP TTL (was 24h) | Already fixed (P1 rebuild, 30 min) | No action |
| L-05 | CSP `unsafe-inline`/`unsafe-eval` applied globally via `next.config.mjs`'s `source: '/(.*)'`, though only the Ask Aria live-preview sandbox actually needs it | Confirmed still open | **Deferred to P4.** Real fix is a per-path CSP header split (Next `headers()` supports per-`source` matching) — needs its own testing pass to confirm the preview sandbox still works with a scoped-down global policy; more than a mechanical one-line change, explicitly the kind of thing this "lite" sprint's exclusion list (no build-gate flip, no broader consolidation) is protecting against scope creep on. |
| L-06 | `frame-src` wildcard (`https: http:`) — same `next.config.mjs`, same global-scope issue | Confirmed still open | **Deferred to P4**, same reasoning as L-05 — needs an explicit allowlist of actual embed sources (Stripe, Cloudflare Stream, etc.), a design decision not a mechanical edit. |
| L-07 | Middleware matcher doesn't cover `/api/pos/*`/`/api/aria/*` — per-route auth is the only protection there | Partially fixed (2 POS trial-gate paths added since the audit), core gap remains | **Deferred to P4**, same root cause already on record as SECURITY-P2's M-05 (no `email_confirmed_at` check either) — an architectural decision affecting 250+ routes if the matcher is widened for general auth purposes, not a one-file fix. |

**3 of 7 fixed** (L-01, L-02, L-03 — all cheap, mechanical, zero-behavior-change for legitimate
callers). **1 already fixed** (L-04, prior sprint). **3 deferred with reasons** (L-05, L-06, L-07 —
all architectural/design decisions, matching this sprint's own explicit scope boundary).

---

## Commit / build verification

Per-item, as required:

| Item | Commit | tsc | build |
|------|--------|-----|-------|
| 1 | `3b0425c3` (pre-existing, this sprint) | 0 (verified prior session) | 0 (verified prior session) |
| 2 | `3f2a3935` | 0 | 0 |
| 3 | `cc633f13` | 0 | 0 |
| 4 | `7faaab54` | 0 | 0 |
| 5 | *(this commit)* | 0 | 0 |

**Smoke suite:** actually attempted via `npm run test:smoke` this sprint (not assumed) —
**`TEST_USER_EMAIL`/`TEST_USER_PASSWORD` are still not configured** in this environment, same
fail-fast guard as P1 and P2. None of this sprint's 5 items touch auth/session/middleware
application code in a way that would change smoke-suite-covered behavior (item 3 is a table-level
Postgres RLS migration, not application routing/middleware — judged out of RULE 13's literal scope
even before considering the credential gap), but the credential gap itself is reported here
regardless, matching the standing instruction to say so loudly rather than silently skip. If
TEST_* creds are configured before the next auth-adjacent sprint, `npm run test:smoke` should be
run then.

`vercel.json` unchanged across all 5 items.
