# CLAUDE.md — Aria OS Build Rules (READ FIRST, EVERY SESSION)

This file is automatically loaded into every Claude Code session. These rules are
BINDING and override any task instruction that conflicts with them.

**If a paste contradicts this file, this file wins — stop and say so.**

Merged 2026-08-17 (SETUP-0). RULES 0–13 below are the originals, preserved intact; RULES 14–19
and the two lead sections were folded in from the SETUP-0 standing-rules document. Where the two
disagreed, the disagreement is recorded in place rather than silently resolved — see RULE 4
(superseded), RULE 8 (kept), RULE 12 (corrected against live data) and RULE 19 (number collision).

---

## WHAT YOU ARE WORKING ON

Aria OS — an AI business co-owner SaaS for Australian small businesses: **cafés, restaurants,
retail/liquor**. Warehouse is parked; do not build for it, do not count it as scope.

Next.js (App Router) on Vercel · Supabase Postgres with RLS · Anthropic · Stripe · **ClickSend for
SMS** · **Resend for email**. Solo founder, browser-only development. One test business:
Sip Café (`sip-ff5055`, business_id `ff5055a0-c351-4ada-817a-1804961035f3`).

The work is organised as **108 mega-sprints** in a fixed dependency order. You will receive one
mega-sprint per session. It contains numbered PHASES. **Each phase is its own commit.**

- `pwd` is `C:\Users\kansa\aria-saas-audit`. **NEVER** touch
  `c:\Users\kansa\Downloads\aria-saas-main\repo-worktree`.
- **The sale path is sacred.** POS never awaits a network call to complete a sale. No background
  work may block or slow it.

---

## 🚨 MANDATORY COMMIT PROTOCOL — follow for EVERY commit, NO EXCEPTIONS

This is the #1 cause of broken deploys. A build has broken and sat broken across multiple
commits THREE times — every single time because code was committed/pushed WITHOUT building first.

**Before EVERY git commit, in this exact order:**
```
1. npx tsc --noEmit        # MUST show zero errors. If errors → fix them, do NOT commit.
2. npm run build           # MUST complete successfully. If it fails → fix it, do NOT commit.
3. git add -A && git commit -m "..."
4. git push origin main
5. git log origin/main..HEAD   # MUST be empty. If not empty → push again.
```

⚠️ **Step 3's `git add -A` is a known hazard in this repo** — it has swept ~94 junk files and 16 MB
of binaries into a commit. **Stage explicit paths instead.** There are 22 pre-existing untracked
files sitting in the tree right now; none of them belong in a commit.

**COMMIT GRANULARITY:**
- **Inside a mega-sprint: ONE COMMIT PER PHASE.** Never one per file, never one for the whole
  mega-sprint. (RULE 15.)
- **Outside a mega-sprint (ad-hoc prompt): ONE COMMIT PER PROMPT.** Complete all tasks in the
  prompt, then build ONCE, then make ONE commit.
- ❌ Never commit without running `npm run build` first
- ❌ Never push a commit that hasn't passed `npm run build`
- ❌ Never build on top of a commit you haven't verified builds

> The original wording of this rule was "one commit per prompt — multiple commits waste Vercel
> build quota." The quota rationale is **superseded**: Vercel is on the paid plan (RULE 4). The
> per-phase rule replaces it inside mega-sprints. Both are recorded so neither gets reinstated
> from an old paste as if the other never existed.

**COMMITS GO VIA `git push`, SO THE PRE-PUSH HOOK RUNS.** Confirmed 2026-08-17: pushes to this
repo emit `[pre-push] OK — canon-rail-guard clean, tsc 0 errors, unit tests green`. If a commit
ever goes through the **GitHub API** instead, the hook does **not** run — no canon rail, no tsc
gate, no vitest. In that case run all three manually and **state in your report that the hook did
not run.**

**At the END of every task/session:**
- Run `npm run build` one final time to confirm the whole thing is green
- Confirm `git log origin/main..HEAD` is empty (everything pushed)
- State explicitly: "Build verified green, all commits pushed."

If `npm run build` fails and you cannot fix it: STOP, do not commit, report the exact error.
A broken build that reaches `main` blocks ALL deploys including unrelated work.

---

## 🔒 RULE 0 — UPGRADE ONLY, NEVER DOWNGRADE (overrides everything)

Every change must ONLY upgrade, improve, or add. NEVER downgrade, remove, simplify away,
stub, disable, or weaken any existing feature — not even accidentally, not even temporarily,
not even to fix a build error.

- ❌ NEVER remove/comment-out/stub working code to fix an error → fix the actual error
- ❌ NEVER delete a feature, tab, button, field, tool, or capability
- ❌ NEVER reduce limits, outputs, max_tokens, or returned fields
- ❌ NEVER replace a rich implementation with a simpler one
- ✅ If refactoring, the result must do EVERYTHING the original did, plus the improvement
- ✅ Every feature present today must still work tomorrow

**No refactoring, tidying, renaming, deleting, or "improving while I'm here."** Feeling the urge
is the signal to stop and report it, not to act.

**Use `str_replace` for edits to existing files.** Write a whole file only when creating it, or
when the file itself is the deliverable and the change is structural — and say so in the report.

**If a task seems to require a downgrade: STOP. Do not proceed. Output:**
`⚠️ BLOCKED: [task] appears to require downgrading [feature]. Not proceeding per RULE 0. Need guidance.`

Full detail: see UPGRADE_ONLY_RULE.md

---

## 🔒 RULE 1 — PUSH AND VERIFY AFTER EVERY COMMIT

After EVERY commit:
```
git push origin main
git log origin/main..HEAD   # MUST be empty — confirms push landed
```
Never end a session with unpushed commits. (Lesson: 31 commits once sat unpushed locally.)

---

## 🔒 RULE 2 — READ BEFORE EDIT

Before changing any code:
1. Read the full file you're editing
2. Read the DB schema for any table involved (see AUDIT_STATE.md)
3. Trace the A→B→C dependency chain (what calls this, what this calls)
Never edit blind.

---

## 🔒 RULE 3 — VALIDATE BEFORE COMMIT

Before EVERY commit:
```
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
npx vitest run     # must be green
```
If the build breaks, FIX THE ERROR — never remove the feature causing it (see RULE 0).

---

## 🔒 RULE 4 — VERCEL CONSTRAINTS  *(revised 2026-08-17)*

**CURRENT — Vercel is on the PAID plan** (confirmed by Chahat 2026-07-29, reconfirmed 2026-08-04):
- **100 crons per project**
- **Per-minute cron cadence allowed**
- **300s function timeout**

**SUPERSEDED — do not reinstate from an old paste:**
> - ~~vercel.json: keep at 22 function configs max~~
> - ~~Crons: DAILY MAXIMUM (e.g. "0 9 * * *"). Sub-daily schedules silently break Vercel Pro deploys.~~
>   - ~~(Known issue to fix: parcel-insights is currently "0 \*/6 \* \* \*" — must go daily)~~
>     **RESOLVED** — verified 2026-08-17: no `parcel` cron exists in vercel.json at all, and 0 of
>     the 22 crons are sub-daily. The issue is closed twice over: the cron is gone, and per-minute
>     cadence is now allowed anyway.
> - ~~Cron count: verify against plan limit before adding new crons~~
>
> Retired 2026-08-17. This was a **free/hobby-plan** constraint. It is kept visible, struck
> through, because it survived in pastes for weeks after the plan changed and was still being
> reported against on 2026-08-17 (functions 9/22, crons 22). If a sprint document still carries
> it, **ignore it and say so in your report.**

Current state for reference: 9 function configs, 22 crons, 0 sub-daily.

---

## 🔒 RULE 5 — NEVER TOUCH THESE FILES

AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
(Locked design/UX assets — leave exactly as they are)

---

## 🔒 RULE 6 — DATA CORRECTNESS (from the audit)

Confirmed column/table traps — use the CORRECT name:
- staff_members: first_name + last_name (NO `name`)
- pos_sales: total_amount (NO `total`); revenue/"real sales" queries: status filter
  `= 'completed'` (NOT `!= 'voided'` — corrected 2026-07-16, BRIEF-INTEGRITY-2, live-data
  confirmed. `!= 'voided'` silently counts `draft` rows (held/parked carts — see
  pos/sales/draft/*, explicitly not-yet-real revenue until promoted) as revenue, and includes
  `refunded` rows (a separate row with a NEGATIVE total_amount, linked via original_sale_id —
  see return-engine.ts — an existing distinct "gross vs net" concept per
  reconciliation-agent.ts, not something to blend into one revenue figure by filter alone).
  Use `src/lib/aria/revenue-snapshot.ts`'s `getRevenueSnapshot()` for any AEST-day-boundary
  revenue figure instead of re-querying pos_sales directly — one canonical implementation,
  not a filter to get right by hand at every call site.)
- pos_sale_items: line_total (NO `total_price`)
- pos_timesheets (NOT pos_timesheet_sessions); hours_worked (NO `total_minutes`)
- pos_inventory_transfers (NOT pos_stock_transfers)
- pos_outlet_inventory: items_on_hand (NOT qty_on_hand / stock_quantity)
- pos_product_modifier_groups + pos_modifier_groups (NOT pos_product_modifiers / pos_modifiers)
- pos_customers: NO customer_segment / churn_risk (those are on `customers`)
- pos_products: price (NO retail_price / selling_price); NO kds_skip_routing
- pos_products VALID new cols: shelf_capacity, qty_backroom, expiry_date
- pos_outlets (NOT `outlets`); pos_staff.is_active (NOT `active`)
- google_reviews.has_reply (NOT reviews.response)
- business_expenses: label (NO `name`); amount in dollars
- community_live_streams: cf_stream_uid, cf_playback_hls, cf_whip_url
- THREE briefing tables (different columns): daily_briefings, aria_daily_briefings, pos_daily_briefings
- All amounts DOLLARS (numeric) except columns named *_cents
  (exception: staff_members.pay_rate_cents IS cents; staff_pay_rates.hourly_rate_cents IS cents)
- Display amounts with `(Number(x)||0).toFixed(2)`

**GROUNDING-TEETH — no invented dollar or percentage figures, ever.** An honest "unknown" beats a
plausible number. This has already caused a real bug: a briefing computed every percentage against
a fabricated $999,999 target.

**ALLERGEN HARD RULE — no model output may answer allergen or dietary-safety questions on any
surface**, gated or disclaimed or not. Structured owner fields only. Same for prices and stock.

---

## 🔒 RULE 7 — SILENT FAILURE PREVENTION

- RLS-protected tables: use supabaseAdmin for server/cron/admin reads (anon key returns silent empty [])
- Always check the `error` from Supabase destructuring — never ignore it
- await every insert/update/delete/upsert
- .single() crashes on 0 rows → use .maybeSingle() unless the row is guaranteed
- Never swallow errors as empty results (no `catch { return [] }`)
- Every business-data route must verify the user owns the business_id (cross-business leak = critical)

**Incident record (ARIA-MERGE-FIX-1, 2026-08-17):** a sweep of `pos_customers` writes found **14 of
22 call sites discarded their error**. Two were in `/api/customers/merge`, where the discarded
error was a `pos_customers_phone_uniq` rejection — the route then soft-deleted the source row
anyway, so the merged data was never written and the row holding it was gone, and the caller got a
200. `.maybeSingle()` also ERRORS on >1 row rather than returning the first: `.limit(1)` is
required, not decorative.

---

## 🔒 RULE 8 — AI / MODEL IDs

Use exactly:
- claude-haiku-4-5-20251001
- claude-sonnet-4-6  ← current Sonnet (model-router smart tasks, MODEL-ROUTER-UPGRADE)
- claude-sonnet-4-5-20250929  ← still pinned by the core tool-loop provider (providers/anthropic.ts); migrate later
- claude-opus-4-5-20251101

> A 2026-08-17 paste listed only `claude-sonnet-4-5-20250929` as current Sonnet. **That list is
> wrong and was rejected** — adopting it would have silently reverted MODEL-ROUTER-UPGRADE. The
> four IDs above are correct.

Aria Intelligence Rule: every feature should feed data into briefing/business-brain,
log to aria_ai_calls, and verify aria_autopilot_actions where relevant.

---

## 🔒 RULE 9 — FULL-SAAS-DEPTH

Every feature must match ~80% of the category leader + AI differentiation. No scaffolds,
no placeholders, no "coming soon" stubs shipped as if complete.

---

## 🔒 RULE 10 — MIGRATION VERIFICATION (learned: CX-AUTH-1a/1b incident)

**Migrations in git ≠ migrations applied to production.**

Writing a `.sql` file to `supabase/migrations/` does NOT apply it. Every sprint that adds or
alters a table must end with a live `information_schema` check via Supabase MCP or SQL Editor.

**End-of-sprint verification query (run this, not "trust the file"):**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('new_table_a', 'new_table_b');  -- must return N rows

-- For new columns:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'target_table' AND column_name = 'new_col';

-- For new indexes:
SELECT indexname FROM pg_indexes
WHERE tablename = 'target_table' AND indexname = 'new_idx';
```

- ❌ "File exists in supabase/migrations/" is NOT evidence the migration ran
- ❌ Never close a migration sprint without the row count matching expected tables/cols
- ✅ N rows returned = N objects live in prod. Fewer = apply the missing migration NOW

**Always dump CHECK constraints properly:**
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.<table>'::regclass and contype='c';
```

**Incident record:** cx_otp_codes + cx_sessions (CX-AUTH-1a) and loyalty_identity.phone
(20260622000001) were all written to git but never applied to prod. The entire CX-AUTH-1b
sprint 500'd on every auth request as a result. Applied 2026-07-08 via Supabase MCP.

### 🔒 RULE 10a — YOU DO NOT WRITE SCHEMA  *(added 2026-08-17, composes with RULE 10)*

**This is absolute. It changes who authors DDL; it does NOT replace RULE 10, which is still how a
migration gets verified once applied.**

- **All DDL is applied by Claude in chat via Supabase MCP**, after the founder approves the SQL.
  Columns, constraints, indexes, RLS policies, functions, grants — none of it is yours to invent.
- **You still write DML**: test fixtures, seeded proof rows, rolled-back `DO` blocks. That is how a
  phase proves itself, and you tear it down afterwards.
- **You WILL be given the exact migration SQL to commit** into `supabase/migrations/`. Commit it
  **byte-identical**. Do not reformat, rename, or "clean up" the file. The repo must describe
  production exactly — `git-migration ≠ prod-schema` drift is a documented recurring failure here.
- The migration always lands **before** the code that reads it. If you are asked to write code
  against a column that does not exist yet, **stop and report** — do not create it yourself.
- Reading the database is encouraged, and required by RULE 10's verification step.

---

## 🔒 RULE 11 — COST ESTIMATION IS PART OF PRE-FLIGHT (from: AI-COST-AUDIT-1)

Any sprint adding or modifying an LLM call must state est. $/business/day in its commit
message, computed via `scripts/ai-cost-model.ts`.

- ✅ Before coding: add/update the job's entry in `scripts/ai-cost-model.json`
  (model, batch?, calls/business/day, est. input/output tokens)
- ✅ Run `npx tsx scripts/ai-cost-model.ts` and quote the resulting $/business/day in the
  commit message — same discipline as the RULE 10 migration-verification dump
- ❌ Never ship a new or changed LLM call without this number in the commit message

**Incident record:** AI-COST-AUDIT-1 (2026-07-13) found ~$20 USD Anthropic spend in ~2 weeks
for ONE business with zero real customers, and that the true breakdown was unknowable after
the fact — three separate unlogged/mispriced call paths (`ai-router.ts`, `model-router.ts`,
`council.ts`'s missing `cost_usd_cents`) meant the DB's own cost ledger undercounted real
spend by roughly half. See `AI-COST-AUDIT-REPORT.md` at repo root.

---

## 🔒 RULE 12 — CI IS THE SOURCE OF TRUTH (from: CI-E2E-1)

**"Build green" now means CI green, not local.** `npx tsc --noEmit` and `npm run build`
passing on your own machine is necessary but no longer sufficient to declare a sprint done.

- ✅ Before declaring any sprint done: e2e (`.github/workflows/e2e.yml`, `typecheck` +
  `e2e-local` jobs) must be green on the pushed commit — check the Actions tab, not just
  your terminal
- ✅ A local `tsc`/`build` pass that hasn't been pushed and confirmed green in Actions is
  an unverified claim, not a finished sprint
- ❌ Never declare "build green" from local output alone once CI exists for this repo
- ❌ Never merge/consider done a PR with a red or pending required check

Full detail: see `.github/workflows/e2e.yml` header comment for required secrets and
`e2e/helpers/seed.ts` for the idempotent test-data seed (Sip test business).

### 🔒 RULE 12 AS AMENDED — SETUP-1, 2026-08-17. THIS PARAGRAPH IS THE OPERATIVE ONE.

The rule above describes the intended end state. It does not describe today, and applied literally
it would mean **no sprint since 10 July has been done** — which is not what has been practised. A
rule nobody can satisfy stops being a gate and starts being decoration, so it is amended here to
what actually enforces. This is deliberately an honest amendment rather than an arranged green
tick; see `docs/aria/CI-TRIAGE-2.md` for the full diagnosis.

**What actually enforces today:**

- **The pre-push hook — canon-rail-guard + `tsc` + unit tests.** Runs on every push, currently
  green. This is the real gate.
- **Canon Rail Guard in CI** — green, and genuinely enforcing since its trigger fix
  (SECURITY-RESIDUE-FIX-1 PART 2).
- **E2E `typecheck` job in CI** — green.

**What does NOT enforce today:**

- **`e2e-local` — KNOWN-RED. Never green since inception** (`43746e77`, 10 Jul 2026 — the commit
  that created the job; 200 of 200 `main`/push runs red). Cause: fixture/seed divergence plus
  stacked eras — see `docs/aria/CI-TRIAGE-2.md`. **It is NOT a gate on "done" until the fixture
  sprint lands.** Do not treat a red `e2e-local` as a blocker, and do not claim it as evidence of
  anything either.
- **Smoke Suite** — runs as of `d5df27d2` (SETUP-1 Phase 1). It had **never executed before that**,
  so **its first results are NEW INFORMATION, NOT REGRESSIONS.** Do not attribute them to whatever
  commit happens to surface them.

**What "done" means in the interim:** the **pre-push hook green**, plus **the phase's own proof,
stated in the report** (RULE 17). Nothing else is currently a gate. When the fixture sprint lands
and `e2e-local` goes green, this amendment is removed and the rule above resumes in full.

### ⚠️ LIVE CI STATE — measured 2026-08-17, not assumed

A 2026-08-17 paste claimed "GitHub Actions is billing-blocked, so nothing catches it server-side
either." **That is false and has been deleted.** Measured against the GitHub API:

| workflow | state | reality |
|---|---|---|
| Canon Rail Guard | active | **green** on every recent `main` push |
| E2E Tests · `typecheck` job | active | **green** |
| E2E Tests · `e2e-local` job | active | **RED on 40 of 40** examined `main`/push runs, back to 2026-08-04. No success in that window. |
| Smoke Suite | active | **0 runs, ever** |

4,628 workflow runs exist on the repo. Actions is running and is not billing-blocked.

**Two things this means, and they are the RULE 12 problem, not a footnote:**
1. `e2e-local` has been red continuously since at least 2026-08-04. Under this rule as written, no
   sprint in that window is "done". Either the job is genuinely broken (environment/secrets) and
   must be fixed, or the rule is being ignored. **Do not declare a sprint done on the strength of
   RULE 12 until this is resolved** — cite the actual run, not the rule.
2. **Smoke Suite has never executed.** `smoke.yml` triggers on `pull_request` only, and this repo
   pushes directly to `main`, so the trigger has never fired. This is failure pattern #1 below in
   its purest form: it exists, it is `active`, it looks correct, and it does nothing. RULE 13's
   claim that it "also runs in CI" is therefore **aspirational, not true today.**

---

## 🔒 RULE 13 — SMOKE SUITE FOR AUTH/ROUTING/MIDDLEWARE/RLS SPRINTS (from: SECURITY-P1)

Any sprint touching auth, routing, middleware, or RLS must run `npm run test:smoke`
(`tests/smoke/`, config: `playwright.smoke.config.ts`) green before push — alongside tsc/build,
not instead of them. This suite runs against a real production build (`next build && next
start`, not `next dev`) and asserts BOTH halves: the attacks it exists to block actually fail,
AND normal owner/customer flows still work (login, dashboard, Ask Aria, POS sale, loyalty,
bookings, admin authz, CX public page) — a security change that blocks Sip fails the sprint.

- ✅ Before push, for any sprint changing auth/session/rate-limit/RLS/middleware code:
  `npm run test:smoke` must pass locally, same tier as RULE 3's tsc/build. As of SECURITY-P2
  it also runs in CI (`.github/workflows/smoke.yml`) on every PR touching `src/**` — a red
  smoke check blocks merge same as a red typecheck/e2e-local check.
  **⚠️ 2026-08-17: the CI half of this has never actually run — 0 runs, PR-only trigger, and this
  repo pushes straight to `main`. Local is currently the ONLY place this suite executes.**
- ✅ A new auth-adjacent route or form needs a corresponding assertion added to
  `tests/smoke/owner-flows.spec.ts` (legitimate case) — and to
  `tests/smoke/security-guards.spec.ts` if it adds a new rate limit or Turnstile gate
- ❌ Never tighten a rate limit or add a new gate without running the legitimate-flow half of
  this suite — if it starts failing, the fix is to loosen the limit/gate, never to loosen the test
- Test credentials: `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` (reuses the existing e2e convention),
  optionally `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` for the positive admin-access assertion.
  Never real production user passwords — see `SECURITY-P1-REPORT.md`'s founder env checklist.

**Incident record:** SECURITY-P1 (2026-07-14) found 9 of 14 audited CRITICAL findings still
open against current code (`SECURITY-AUTHZ-AUDIT.md`, 2026-07-06) despite several having been
reported as already fixed — including a staff-portal OTP/session system that referenced two
columns (`staff_members.portal_token`/`portal_token_expires_at`) that had never existed in the
live database at all (no migration ever created them, confirmed via `information_schema`), so
the feature had been silently non-functional in production, not merely insecure.

---

## 🔒 RULE 14 — PARALLEL SESSIONS: ASSUME YOU ARE NOT ALONE

Several Claude Code sessions may run on this repo at once, on separate branches.

- **Work only on your declared branch and your declared file domain.** Both are stated in your
  mega-sprint. If your work needs a file outside your domain, **stop and report** — do not take it.
- **Never assume `main` is what you branched from.** If you merge or rebase, re-run `tsc`, `build`
  and `vitest` against the combined result. "It was green on my branch" is not evidence after
  someone else merged.
- If the canon rail flags something you did not write (a merge can do this, and a **file move** has
  done it before on byte-identical code), **report it — do not `--no-verify` past it silently.** If
  a bypass is genuinely correct, say so explicitly in the commit message and in your report.

---

## 🔒 RULE 15 — HOW A MEGA-SPRINT RUNS

**PREFLIGHT — before any phase, for the whole mega-sprint.** Report and STOP:
- every table any phase touches: columns · CHECKs · FKs · UNIQUE/partial indexes
- every helper any phase will call: **does it already exist?** Reports in this project
  systematically *understate* what exists — four confirmed cases.
- anything that contradicts the mega-sprint document. **The document is a report too.** If the code
  disagrees with it, the code wins.

**EACH PHASE carries all six:**
| | |
|---|---|
| **SCOPE** | exactly what changes |
| **NOT-SCOPE** | named exclusions, so nothing gets helpfully added |
| **VERIFY** | tests, plus **one mutation check** |
| **SWEEP** | grep for siblings of every change; report a number, including zero |
| **COMMIT** | one commit; `npx tsc --noEmit` = 0, `npm run build` = 0, `npx vitest run` green **before** it |
| **GATE** | report; continue only if this phase's own proof passed |

**The mutation check is the point, not a formality.** Revert your fix and confirm the suite goes
red. **A mutation check that fails to fail is itself the finding** — report it loudly. This has
happened twice and both times revealed the fix was structurally impossible or the test was
comparing something to itself.

Where a fix lives in SQL and the guard is a database constraint, a fake-DB unit test proves only
your model of the bug. Mutate against the real thing — a rolled-back `DO` block that reintroduces
the original statement order and shows the actual `sqlstate` is stronger evidence, and says so.

**Rules for phases:**
- A **failed phase halts the mega-sprint.** Do not work around it. Do not continue "around" it.
- A phase whose work is **already done** reports that and skips. It never invents scope to justify
  itself.
- **One commit per phase.** Never one per file. Never one for the whole mega-sprint.

---

## 🔒 RULE 16 — THE FIVE FAILURE PATTERNS OF THIS CODEBASE

Measured from this repo's own history. Check for each one before calling anything done.

1. **"Exists, looks correct, does nothing."** Seven confirmed instances — Canon Guard (0 runs
   ever), Smoke Suite (0 runs — **re-confirmed 2026-08-17, see RULE 12**), a Deploy workflow that
   verified nothing in 8s, Turnstile hardened on a route with no callers, a CHECK constraint that
   made the live booking page unable to book, an RPC referencing a non-existent column so every
   void silently failed to restore stock. **Prove behaviour, not presence.**
2. **"Fix landed on the wrong file."** Three instances in one day. **Every fix greps for its own
   siblings before it is done.**
3. **"Reports understate what exists."** Four instances — things documented as 0 rows had 2,146;
   most of a sprint was already built. **Verify against live code and the live database, never
   against a document.** (2026-08-17 added a fifth: a sprint asked for a unique index that already
   existed, predicate-for-predicate.)
4. **"N copies drift."** Six business-id resolvers, 120 revenue filters, three business-health
   computations, one canonical helper built twice four weeks apart. **Before writing a new helper,
   search for the three that already exist.** Rail first, then migrate — a new helper alone stalls
   at 9–15% adoption.
5. **Measurement errors in your own diagnostics.** A `sed` range that never matched ran to EOF and
   reported 12 false findings; a normalisation query truncated and manufactured a collision that
   did not exist; a "non-deterministic resolver" report was produced by a query that omitted the
   `deleted_at is null` filter the resolver actually applies. **Sanity-check your own query before
   building a sprint on its output — and retract loudly when it was wrong.**

---

## 🔒 RULE 17 — REPORT FORMAT, EVERY PHASE

```
PHASE <n> — <name>
  files changed        (paths, +/- lines)
  sibling sweep        what you searched for, how many hits, what you did
  mutation check       what you reverted, how many tests went red
  gates                tsc · build · vitest · hook ran? y/n
  commit               sha + message
  NOT done, and why    scope you declined, and the reason
  discovered           anything that changes a later mega-sprint
```

**Say what you did not do.** An honest "mechanism proven at the SQL layer, not exercised through
the UI" is a good report. A claim of end-to-end verification you did not perform is the worst
possible outcome — worse than the bug, because it stops anyone looking.

---

## 🔒 RULE 18 — STOP AND ASK: do not decide these yourself

- The code contradicts the mega-sprint document.
- A phase needs a file outside your declared domain.
- A phase needs schema you were not given.
- The sweep finds more instances than the document predicted.
- A fix would change an existing HTTP response shape, or anything customer-facing.
- Anything involving **money, customer contact, deletion, or authorisation** where the correct
  behaviour is not spelled out.
- You are about to bypass a gate for any reason.

**Erring toward stopping is correct.** A stopped session costs an hour. A wrong assumption that
ships costs a week of archaeology — and this repo has the history to prove it.

---

## 🔒 RULE 19 — PROMPT AUTHORING: EXTRACT THE FACT, DON'T FORBID THE SYMPTOM

If you are about to write "NEVER say X" into a prompt, **extract the missing fact instead.** A
prohibition treats the symptom; the model said X because it lacked the fact that makes X wrong.

> ⚠️ **Number collision:** the SETUP-0 source document numbered this "RULE 9". **RULE 9 in this
> file is FULL-SAAS-DEPTH and predates it.** If a paste refers to "RULE 9 — extract the missing
> fact", it means this rule, RULE 19. Do not renumber either one.

---

## 🔒 RULE 20 — AUTONOMY BY DEFAULT  *(created 2026-08-18)*

> ⚠️ **Created, not amended.** The instruction that produced this section said "amend RULE 20". No
> RULE 20 existed — this file ended at RULE 19, and neither "AUTONOMOUS" nor any autonomy rule
> appeared anywhere in it. Per RULE 15 ("the document is a report too; if the code disagrees with
> it, the code wins") the scope was adjusted from *amend* to *create*, and the v1 scope line below
> is preserved struck-through anyway — it never lived in this file, but recording what it said is
> what stops it being reinstated from an old paste. Nothing was renumbered; no other rule was
> altered.

**SUPERSEDED 2026-08-18 — do not reinstate from an old paste:**
> - ~~Autonomous run mode is the default for any sprint marked AUTONOMOUS.~~

**CURRENT — autonomous run mode is the DEFAULT for EVERY sprint in this repo.** A sprint does not
need to be marked. **The founder is not watching any of them.** The exceptions are the PARK list
and the HALT list below — nothing else waits for a human.

If a sprint carries its own **DECISION TABLE**, that table wins for the branches it covers. For
everything else — including a sprint with no table at all — use the **STANDING DECISION TABLE**
below. **A sprint arriving without a table is normal, not a reason to stop.**

### STANDING DECISION TABLE — applies to every sprint, all 130

These are the branch points that recur across this codebase. Apply literally; do not ask.

| Situation | Decision |
|---|---|
| The sprint's premise is contradicted by the code or DB | The code wins. Log the contradiction, adjust scope to what is actually true, continue. If the whole phase becomes meaningless, PARK it and move on. |
| The work is **already done** | Report and skip. Never invent scope to justify a phase. Reports here systematically understate what exists. |
| A helper you need **already exists** (possibly 2–3 versions of it) | Use the one the canonical engine uses. Never write a fourth. If it is genuinely unclear which is canonical, PARK and name the candidates. |
| A fix needs a **schema change** | PARK. DDL is never yours. Name the exact column/constraint and why. |
| The sweep finds **more instances than the sprint predicted** | Fix the ones in the declared file domain; list the rest. Do not expand into other domains unattended. |
| A test asserts the **old** behaviour the phase is changing | Rewrite the test to assert the new behaviour and write in the test file why it changed. Never delete it. |
| A **mutation check fails to fail** | That is a finding, not a formality. Fix the test so it can go red, re-run, and record the whole episode. If it still cannot go red, PARK the phase — an unfalsifiable test is not verification. |
| Backfilling historical rows looks possible | **Do not backfill.** Forward-only unless the sprint explicitly instructs otherwise. Historical rows record what happened. |
| A number cannot be computed honestly (missing cost, missing data) | Render **unknown**. Never zero, never a substitute, never an estimate presented as fact. GROUNDING-TEETH. |
| Two plausible implementations, no instruction | Take the one that preserves existing observable behaviour and is revertible in one commit. Log both and why. |
| A phase would touch **money, message wording, authorisation, personal data, or deletion** | PARK. Wiring *how* something is sent or stored is in scope; changing what it says, who may do it, or what is removed is not. |
| A **compliance violation** is discovered | Build the forward fix if the sprint asks for it. PARK all remediation of past events, marked URGENT at the top of the run log. |
| A phase fails verification 3 times | Revert your own commit for it, PARK, continue. |
| A phase's dependants are parked | Skip them too, note the chain, continue to the next independent phase. |
| Everything in the sprint is parked | Write the run log, push, stop. That is a complete and successful run. |

### NEVER, UNATTENDED — no exceptions, not even with a decision table

DDL · destructive SQL against production · key or secret rotation · `--no-verify` · committing with
tsc/build/vitest failing · sending real messages to real customers as a test · deleting rows ·
touching the worktree path · starting the next mega-sprint.

### HALT the run entirely only for

tsc or build not green within two attempts after reverting your own change · a rejected push or an
unreconcilable tree · any risk of data loss · the same failure across three different phases
(systemic). On halt: repo green and pushed at the last good commit, run log written, stop.

### THE RUN LOG

`docs/aria/RUN-<sprint-id>.md`, written **incrementally as you go** and committed with each phase —
a halted run must still leave a readable log. Per phase: changes · sweep count · mutation result ·
gates · commit sha · decisions taken under the standing table · parked items with everything
learned · anything that changes a later mega-sprint.

Finish with a one-screen summary at the top: phases done, phases parked, commits, and the three
things the founder most needs to know. **That summary is the whole conversation he would otherwise
have had — write it for someone who has been away all day.**

### HOW THIS SITS WITH RULES 15 AND 18

Recorded here rather than by editing those rules, which this change was told not to touch. Read
them together as follows.

**RULE 18 (STOP AND ASK) — three of its bullets are superseded for autonomous runs**, because the
standing table decides them instead:
- *"The code contradicts the mega-sprint document"* → decide (the code wins), log, continue.
- *"A phase needs a file outside your declared domain"* → fix what is in domain, list the rest.
- *"The sweep finds more instances than the document predicted"* → same: fix in domain, list the rest.

**Its other bullets survive unchanged** and are reinforced by the PARK and NEVER lists above:
schema, money, customer contact, authorisation, deletion, and bypassing a gate all still stop.

**RESPONSE-SHAPE CHANGES — SETTLED 2026-08-18. Use the CONSUMER TEST, not the shape of the diff.**

RULE 18 says stop for *"a fix that would change an existing HTTP response shape, or anything
customer-facing"*, and the standing table's PARK list covers message wording but not response
shape. Resolved as follows.

**SUPERSEDED 2026-08-18 — the interim reading, do not reinstate:**
> - ~~An ADDITIVE response field proceeds; a change that removes or renames an existing field, or~~
>   ~~alters a status code, PARKS under RULE 18.~~
>
> Retired because it asked the wrong question. Whether a change is additive says nothing about
> whether anyone can be broken by it — a purely internal route can have a field deleted safely,
> and a route with a cached client can be broken by a change that adds nothing.

**THE QUESTION IS WHO CONSUMES THE ROUTE.**

**PROCEEDS unattended** — every consumer of the route is inside this repo, the sibling sweep finds
all of them, and they change in the same commit. **Type changes included**: that is an internal
refactor with a wide diff, not an API change. If the sweep cannot find every consumer, you do not
have this case.

**PARKS** — any consumer outside this repo, **or any client that may be running an old cached
bundle**. That second clause is not hypothetical here:

- The **CX app** and the **inventory staff app** are installed PWAs. The staff app registers
  `/inventory-sw.js` and injects a per-slug manifest (`inventory/[slug]/page.tsx`, PWA block); the
  root app ships `src/app/manifest.ts`. A phone that has not refreshed is running last week's
  JavaScript against today's server, which makes it **an external consumer sitting inside your own
  repo**.
- It writes as well as reads: `enqueueSafe` queues counts offline and replays them later, so a
  stale bundle can POST an old payload shape to a new route *after* the deploy that changed it.

**For routes with such a consumer:** additive fields proceed; **removing a field, renaming one,
changing a status code, or widening a type to nullable PARKS.** Nullable is on that list for a
concrete reason — a cached client calling `.toFixed()` on a newly-nullable field throws, and it
throws on the phone of someone mid-stocktake, not in CI.

**WORKED EXAMPLE — `total_variance_cents` → nullable (INV-BASELINE-1 Phase 3).** That change
**PARKS** under this rule. It reaches the staff app's stocktake summary, which is exactly a cached-
PWA consumer. **It was the correct change and it should still happen** — parking means it needs a
human present when it ships, not that it is wrong. This is the distinction the interim reading
could not draw: it would have parked the change for being a type widening, rather than for the
reason that actually matters, and would have waved through the same widening on a purely internal
route.

> **Tightens later:** when the public API batch ships, external consumers stop being a
> same-repo-cached-bundle edge case and become real third parties. At that point "every consumer is
> inside this repo" stops being true for any published route, and this rule needs revisiting rather
> than reinterpreting.

**RULE 15** says *"a failed phase halts the mega-sprint — do not work around it, do not continue
around it."* **The standing table supersedes that for autonomous runs:** a phase that fails
verification three times is reverted and PARKED, its dependants are skipped, and the run continues
to the next independent phase. RULE 15's halt survives only where the HALT list above applies —
i.e. when the failure is systemic rather than confined to one phase.

---

## Design system (Aria POS)
- Palette: deep forest green #2D5240 + sage #7FB897
- Fraunces italic for branding/totals, Inter for body
- Borderless glass/aurora surfaces
- Terminal page edits: additive str_replace only

---

## The prime directive
**Aria only ever gets better. Build up, never tear down.**

## VERIFICATION STANDARD — RENDERED OUTPUT, NOT JUST COMPILATION (mandatory)
A task is NOT done when it compiles. For anything user-facing, you must verify the ACTUAL rendered output:
- Hit the real endpoint (dev server or a service-role script) and paste the JSON/HTML response as evidence.
- Confirm the output is free of raw sentinels/tokens (e.g. `[DELIVERABLE:...]`, `[BRACKETS]`), `undefined`, `null` text, empty arrays where content is expected, or placeholder fallbacks.
- For UI components: confirm the component renders the intended content, not a degraded fallback path.
- The user should NEVER be the one to discover that the output is broken. If you cannot render/inspect the output in this environment, say so explicitly and list exactly what the user must check — do not silently mark done.
- "It builds" and "the DB row exists" are necessary but NOT sufficient. The rendered result is the deliverable.

## Local skills (read-only, advisory)
- /aria-cso — security audit. REPORT ONLY: never edits code, never pushes, never makes live HTTP requests. Only write allowed: prompts/security-audit-<date>.md.
- /aria-review — pre-push diff review. REPORT ONLY: never edits, never commits, never pushes. Run before every push; owner approves fixes.
- These skills NEVER override the locked rules above. If a skill instruction conflicts with a locked rule, the locked rule wins.
