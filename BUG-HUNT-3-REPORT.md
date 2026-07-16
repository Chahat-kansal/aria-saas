# BUG-HUNT-3 — Completing the API Security Surface

Read-only sprint. No code changes. Scope: the two corners BUG-HUNT-1/2 never fully reached —
`api/social` (claimed 0% prior coverage) and the ~65% of `api/aria` left unsampled — plus a live
re-verification of BUG-HUNT-2's still-open findings now that RLS policies can be checked directly
against the database, not just read from source.

## 0. A correction to the sprint's own premise

`BUG-HUNT-2-REPORT.md` exists at repo root, is a real and thorough audit (Part A: re-score of
BUG-HUNT-1's 9 Tier 1 items; Part B: 227 files across `api/dashboard`, `api/social` (42 files),
`api/training`, and the remaining `api/aria`), but **has zero commit history — it was never
committed to git.** `git log --all -- BUG-HUNT-2-REPORT.md` returns nothing; `git status` has shown
it as `??` since this session started. That matters for this sprint's scope:

- `api/social` was **not** 0% audited — BUG-HUNT-2 covered 42 of its 44 files. What was missing
  was commitment/review, not investigation.
- Of BUG-HUNT-2's findings, only its **Tier 0** items were ever fixed — confirmed by grepping the
  `SECURITY-CRITICAL-3` tag across the repo (6 files: `pos/mobile-session/route.ts`,
  `pos/mobile-session/[id]/submit`, `pos/price-points`, `pos/products/generate-image`,
  `pos/timed-prices`, `social/generate-video`). Every Tier 1/2/3 finding in that report was, until
  this sprint re-checked it below, presumed still open in production with zero further
  verification.

This sprint therefore did three things, not two: (1) a fresh sweep of the genuinely-never-opened
`api/aria` remainder, (2) an independent fresh sweep of all 44 `api/social` files (not a re-read of
BUG-HUNT-2's claims), and (3) a **live** re-verification of BUG-HUNT-2's presumed-open findings
against actual `pg_policies` — which changes the honest severity of most of them (§3).

## 1. Fresh `api/aria` sweep — ~107 files, zero prior mentions in either report

Covered via 6 parallel batches, each applying the 3 sharpened lenses (supabaseAdmin +
no-ownership-check as the highest-priority lens; client-id-to-write; PII/real-world-side-effect),
plus a dedicated 7th pass over all of `aria/ask/*` (10 files, including the 2,410-line `route.ts`
read in full — previously sampled at one line only).

**Result: no new Tier 0/1 findings.** This part of `api/aria` is, on the whole, the most
consistently well-defended slice of the codebase audited across all three BUG-HUNT sprints — every
route derives `business_id` via the standard `getBid()` pattern or an explicit
`.eq('id', X).eq('user_id', user.id)` check before any `supabaseAdmin` use, including two-step
patterns (fetch-then-verify-then-act) done correctly in `hypotheses`, `memory`,
`deliverable-email`/`deliverable-pdf` (delegated re-check inside `exportDeliverablePdf`),
`marketing-campaigns` (customer_ids constrained by `business_id` in the same query),
`action-executor.ts`/`action-rollback.ts` (re-scopes every write even for planner-supplied ids),
and `plan`'s winback `action=execute` (unvalidated client `customer_ids` traced end-to-end into
`campaigns/[id]/send/route.ts`, which **ignores the stored id list entirely** and always
re-derives recipients from `business_id` + consent — a dead end, not exploitable).

### New low-severity findings (Tier 3 class — same severity family as BUG-HUNT-1's `recipe-scale`)

| # | File:line | Issue | Severity |
|---|---|---|---|
| 1 | `aria/cash-commentary/route.ts:23` | Client `business_id` used with zero ownership check, but only reaches `trackAICall()`'s `aria_ai_calls` telemetry insert — no data read/leaked. | Cost-ledger pollution only (same class as `recipe-scale`, already known) |
| 2 | `aria/supplier-reorder/route.ts:33` | `pos_suppliers` read by client `supplier_id`, no `.eq('business_id', bid)` filter, on the **anon client**. **Live-checked**: `pos_suppliers` has RLS policy `biz_suppliers` (`ALL`, business-scoped). RLS backstops it — not exploitable. | Defense-in-depth gap only, confirmed via live RLS |
| 3 | `social/image-suggest/route.ts` | Whole file has **no auth check at all** — anyone can hit it to burn Pexels/Unsplash API quota. No DB access. | Resource-exhaustion/API-budget only |
| 4 | `social/music-search/route.ts` | Same — no auth, proxies Pixabay. | Resource-exhaustion/API-budget only |
| 5 | `social/generate-voiceover/route.ts:26-49` | Unverified `business_id` used only as a storage-path segment (`voiceover/${business_id}/...`); nothing reads that path back by ownership. Storage-namespace pollution, not a leak. | Minor, no data exposure |

### Not a bug — flagged for a product decision
`aria/bundle-builder/route.ts:29-37` has an explicitly-commented public "kiosk mode": `business_id`
query param + no auth returns active bundle promos (name/price only, no cost/margin) for any
guessable business UUID. Reads as an intentional public surface, not an oversight — worth a second
opinion on blast radius, not a finding.

## 2. Fresh `api/social` sweep — all 44 files, independently re-read

Enumerated via `find` (Glob mis-resolved cwd in one sub-agent's sandbox — corrected via `find`):
**44 `route.ts` files**, matching BUG-HUNT-2's count, not the "42" its own text claimed — its
coverage section never gave an exhaustive file list to diff against, so which 2 files it undercounted
by name can't be reconstructed; all 44 files' git creation dates (2026-05-03 to 2026-06-04) predate
this sprint by a wide enough margin that none look like new additions.

**`social/generate-video/route.ts`** (the old B.0.1 Higgsfield-key-leak finding) — confirmed fixed:
every handler now verifies `business_id` ownership before use, the raw API key is never returned to
the client. Clean.

**New findings (never in either prior report)**: same 3 items as rows 3-5 in the table above
(`image-suggest`, `music-search`, `generate-voiceover` — discovered independently by both the aria
and social sweep agents' overlap check, listed once here).

Every other file in `api/social` reviewed and clean, or matches BUG-HUNT-2's still-open findings
exactly (carried into §3 below rather than re-listed here).

## 3. Live re-verification of BUG-HUNT-2's 24 presumed-open findings — the headline result

Every one of BUG-HUNT-2's Tier 1/2/3 findings was re-read against **current** source (confirming the
vulnerable code shape is unchanged, not stale) and then checked against **live `pg_policies`** via
Supabase MCP — something neither BUG-HUNT-1 nor BUG-HUNT-2 had done for these specific tables. This
is the same technique BUG-HUNT-2 itself used once (its own item 1.8, `pos_customers`, downgraded to
"defense-in-depth only"). Doing it systematically here changes the honest picture substantially.

**The dividing line, confirmed empirically**: every table below carries an RLS policy of the shape
`CREATE POLICY ... USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))`
with `cmd = ALL`. Per Postgres semantics, an `ALL` policy with no explicit `WITH CHECK` uses `USING`
for both read-visibility **and** write validation — so a route on the **anon/RLS-scoped client**
hitting one of these tables with an unverified client id is blocked at the database layer even
though the application code has a real gap. A route on **`supabaseAdmin`** has no such backstop,
full stop, regardless of the table's policy — RLS does not apply to the service-role client at all.

### 3a. Downgraded to defense-in-depth-only (RLS-backstopped, confirmed live)

| Finding | Table(s) checked | Client | Live RLS result |
|---|---|---|---|
| `aria/customer-intel` (1.6) | `pos_customers` | anon | `biz_customers` ALL policy, business-scoped. Blocked. |
| `aria/activity-narrative` | `activity_log`, `reviews`, `pos_sales`, `stock_movements` | anon | All 4 tables carry business-scoped ALL policies (contradicts BUG-HUNT-2's own note that `activity_log`/`reviews` "lack RLS" — they do have it). Blocked. |
| `aria/business-health-quick` | same table set | anon | Blocked. |
| `aria/competitor-prices/auto-adjust` PATCH | `aria_autopilot_actions`, `pos_products` | anon | Both business-scoped, `pos_products` has `WITH CHECK` too. Blocked. |
| `aria/competitive-brief` | `competitor_snapshots`, `aria_competitor_alerts` | anon | Both business-scoped with `WITH CHECK`. Blocked. |
| `aria/pos-suggestions` | `pos_sale_items` | anon | Business-scoped via `sale_id → pos_sales.business_id` join. Blocked. |
| `aria/generate-quote` PATCH | `quotes` | anon | Business-scoped (and the route's own WHERE clause already double-scopes it). Blocked. |
| `aria/compliance` PATCH | `compliance_items` | anon | Business-scoped. Blocked. |
| `aria/badge-counts` | `reviews`, `pos_customers`, `pos_products`, `staff_members`, `profit_leaks`, `missed_demand`, `intelligence_events` | anon | All 7 tables business-scoped. Blocked. |
| `social/token-status` | `social_connections` | anon | Business-scoped (2 overlapping policies, both correct). Blocked. |
| `social/reels-addon` GET | `social_preferences` | anon | Business-scoped. Blocked. |
| `social/inbox` PATCH | `social_inbox` | anon | Business-scoped with `WITH CHECK`. Blocked. (Was already listed as RLS-verified-safe by BUG-HUNT-2 — reconfirmed.) |
| `social/library` DELETE | `social_content_library` | anon | Business-scoped with `WITH CHECK`. Blocked. (Reconfirmed.) |
| `callback/tiktok`, `connect/tiktok`, `google/callback`, `google/connect` | `social_connections` | anon | Same policy as token-status. Blocked. (Reconfirmed.) |

**None of these are "fixed"** — the application-code gap (missing `.eq('user_id', ...)` /
`.eq('business_id', ...)` check before the query) is real and should still be closed as
defense-in-depth, per this codebase's own established standard (RLS-scoped tables still deserve an
app-level check — RULE 7's spirit). But none of them are **genuinely exploitable** today. This is
the correct, honest severity — the same category BUG-HUNT-2's own 1.8 item already established a
precedent for.

### 3b. Confirmed STILL GENUINELY OPEN — `supabaseAdmin`, no possible RLS backstop

RLS does not apply to the service-role client under any circumstance — these are real,
unconditionally, regardless of the underlying table's policy.

| Finding | File:line | What happens | Severity |
|---|---|---|---|
| `pos/production-plan` PATCH (1.4) | `route.ts:162-171` | `body.id` only, no business filter, `supabaseAdmin.update()` on `pos_production_plans`. | **Genuinely exploitable** — cross-tenant write |
| `aria/competitor-watches` GET/POST (1.7) | `route.ts:61-70, 147-158` | `supabaseAdmin` read/insert on `aria_competitor_watches` keyed by raw `business_id` param, zero check (DELETE is correctly checked, an odd asymmetry that persists). | **Genuinely exploitable** — cross-tenant read + fake-watch injection |
| `aria/influencer/generate` (B.1.1) | `route.ts:85-128` | No `isAdminEmail()` gate; pulls real weekly revenue/top product/reviews via `supabaseAdmin` for any `business_id` in the body. | **Genuinely exploitable** — real financial data cross-tenant leak |
| `aria/roster/notify` + `aria/roster` PATCH (B.1.2) | `notify/route.ts:48-51,76` | `supabaseAdmin` reads `staff_members.phone/personal_email/work_email` by raw `staffIds`, zero business filter, then **fires a real SMS**. | **Highest severity in this report** — real PII → real-world SMS to real people, cross-tenant |
| `aria/studio/influencer-video` (B.1.3) | `route.ts:146-159` | `supabaseAdmin.insert()` into `aria_studio_assets` with client `body.business_id`, zero check at all. | **Genuinely exploitable** — cross-tenant write/pollution |
| `social/media` DELETE (B.1.4) | `route.ts:106-109` | `supabaseAdmin.delete()` on `business_media` by raw `id`, zero check. | **Genuinely exploitable** — cross-tenant destructive delete |
| `social/generate-image` (B.1.5) | `route.ts:220-224` | `supabaseAdmin.update()` on `social_posts` by raw `post_id`, zero check (`business_id` destructured but never used). | **Genuinely exploitable** — cross-tenant write |
| `aria/influencer/publish` | `route.ts:20-84` | No admin gate; `supabaseAdmin` reads/writes `aria_influencer_posts` by raw `post_id` (must be pre-existing `status='approved'`, narrower blast radius than B.1.1 but same shape). | **Genuinely exploitable** — cross-tenant read/write, narrower scope |
| `aria/supplier-ai-suggestions` PATCH | `route.ts:39-54` | `supabaseAdmin.update()` by raw `id`, zero business check (its sibling GET is at least override-then-getBid; PATCH has nothing). | **Genuinely exploitable** — cross-tenant write |
| `aria/winback-sequence` | `route.ts:41,80,114` | `business_id` itself **is** ownership-checked (a detail neither BUG-HUNT-2 nor its own paraphrase highlighted clearly), but `customer_ids` from the client are never verified to belong to that business before `supabaseAdmin.insert()` into `campaign_sends`. | **Genuinely exploitable**, moderate — cross-tenant customer-id linkage in a messaging table |
| `aria/ask/route.ts` escalate branch | `:2273` (shifted from old `:2267`, same shape) | `supabaseAdmin.update({has_escalated:true})` by raw `conversationId`, zero check. | **Genuinely exploitable**, low-impact — a boolean flag only |
| `aria/recipe-scale` | `route.ts:17-19,54` | `business_id` unchecked, only reaches an `aria_ai_calls` telemetry insert via `supabaseAdmin`. | **Genuinely exploitable**, low-impact — cost-ledger pollution only (same class as new finding #1 above) |
| `aria/test-tools` | whole file | No `isAdminEmail()`, any authenticated user fires real paid OpenAI + Gemini Imagen-3 calls and can read `OPENAI_API_KEY_PREFIX`/`GEMINI_API_KEY_PREFIX`. | **Genuinely exploitable** — real-money abuse vector, not tenant-data leak |
| `social/video-status` | `route.ts:42-58` | `job_id` passed straight to Runway/Replicate with zero ownership concept at all (not a DB check — there's no `business_id` field here to check). | **Genuinely exploitable** — cross-tenant job-status disclosure |

## 4. Non-security systemic patterns encountered (noted, not fixed, per sprint rules)

**(a) `.neq('status','voided')` instead of `.eq('status','completed')` on `pos_sales`** — new
instances found in files this sprint actually opened (RULE 6 class, not yet exhaustive across the
whole codebase):
`bundle-builder:66`, `customer-insight:29`, `daily-narrative:64-65`, `live-intelligence:80`,
`page-insight:428,687`, `sale-insight:46`, `staff-profitability:37`, `staff-schedule:34`,
`shift-analysis:42` (in-memory `.filter()` variant), `vitals:30`, `winback-message:32`,
`dynamic-pricing:85`, `nps:97`, `hypothesis/outcome-learning.ts:306,309` (inside the already-known-
deferred `runAutopilotOutcomeChecks`). Contrast: `weekly-report:51-56` and `wins:37,39` correctly use
`.eq('status','completed')` in the same file set — confirming the fix has been applied piecemeal,
not systemically.

**(b) Raw UTC day-boundary math instead of AEST-aware helpers** — new instances:
`daily-narrative:59,117`, `page-insight:119-129`, `pos-end-of-day:125` (inconsistent within its own
file — correct helper used elsewhere in the same file), `reorder-forecast:36`,
`social-suggest:91`, `staff-schedule:42-55,71-79`, `shift-analysis:45`, `command:198-201`,
`explain-metric:76-81`, `theft-detection:28`, `dynamic-pricing:81`, `nps:30-31,92-93`,
`booking-insights:27`, `weekly-order:196-198`, `aria/ask/route.ts:936-946` (inline-commented as an
intentional fixed-offset approximation of AEST). Contrast: `weekly-report`, `live-intelligence`,
`pos-end-of-day` (partially), `vitals` all correctly import `todayAEST`/`toAESTStart` from
`@/lib/date-au` elsewhere — the helper is available and known, just not applied everywhere.

**(c) Correct-looking code never actually wired/called**: none found anywhere in this sprint's
scope. Every route audited has a confirmed live caller (grepped for each).

**Bonus, outside the 3 requested patterns**: `aria/slow-day/route.ts:27` selects
`pos_products.stock_quantity`, a column RULE 6 explicitly documents as invalid (valid columns:
`shelf_capacity`, `qty_backroom`, `expiry_date`). Not a security issue — likely silently
degrades the AI prompt's product list.

## 5. Plain verdict — is `api/` now fully audited?

**For `api/social`: yes**, as of this sprint. All 44 files have now been read, independently, by a
sub-agent in this sprint (not merely by trusting BUG-HUNT-2's uncommitted claims) — plus the 3 new
low-severity findings in §1/§2 that neither prior report caught.

**For `api/aria`: yes, coverage-wise.** Combined with BUG-HUNT-1/2's prior ~35%, this sprint's ~107
newly-opened files plus the dedicated `ask/*` deep-dive account for the remainder. Every file under
`src/app/api/aria/` has now been opened and read by at least one audit pass across the three
BUG-HUNT sprints.

**What is not yet done, honestly:**
1. §3b's 14 genuinely-open `supabaseAdmin` findings are still **unfixed in production** — this
   sprint was explicitly read-only. The roster/notify PII→SMS item is the highest-priority fix
   candidate in the entire three-sprint history that remains open.
2. §3a's 14 downgraded items are RLS-backstopped but still represent a missing defense-in-depth
   layer — worth closing as a batch cleanup, not urgent.
3. `api/dashboard` and `api/training` (covered by BUG-HUNT-2 per its own text, Part B) were **not**
   re-verified live in this sprint — this sprint's mandate was specifically `api/social` +
   remaining `api/aria`. Their BUG-HUNT-2 findings (if any — not enumerated in this report) carry
   the same "presumed open, never RLS-verified" caveat that this sprint just resolved for
   `api/aria`/`api/social`. That is the one honest remaining corner.
4. The 3 systemic non-security patterns (§4) were only tracked incidentally, file-by-file, as this
   and prior sprints happened to open each file — not from an exhaustive grep across the whole
   codebase. A dedicated systemic sweep (grep `neq('status', 'voided')` and raw
   `toISOString().split('T')[0]` across every file, not just audited ones) would be needed to call
   that fully measured, and was explicitly out of scope for a security sprint.

With those four caveats stated plainly: the **security** surface of `api/social` and `api/aria` is
now fully audited across all three BUG-HUNT sprints. `api/dashboard`/`api/training` remain the one
corner whose BUG-HUNT-2 findings still carry only source-level (not live-RLS) verification.
