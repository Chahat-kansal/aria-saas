# DEFERRED-SWEEP-1 — the "fix in place, don't finish" pattern, swept across the whole repo

Read-only. No code touched. Sources scanned: (1) all ~3,300 commit messages via `git log --all
--grep`, full bodies read for every hit, not just subjects; (2) all 78 `*-REPORT.md`/`*-PLAN.md`
files repo-wide, read in full; (3) every `TODO`/`FIXME`/`HACK`/`XXX`/deferred-language comment
across `src/` (209 raw matches, each read with surrounding code). ~230 raw candidates in total,
triaged down to the genuine ones below. Every "STILL OPEN" / "DONE" / "SUPERSEDED" verdict was
checked against the current code or a live Supabase query — never taken from the record's own
wording, per the brief. Several items the source commit/report claimed were fine, or claimed were
still broken, turned out to be the opposite on inspection — noted explicitly where that happened.

## Headline numbers

- **Commit-message sweep**: 112 raw hits across 18 search terms → 21 genuine deferrals after
  discarding same-day/same-sprint resolutions and incidental word matches.
- **Report/plan sweep**: 78 files read in full → ~120 genuine-or-ambiguous items extracted →
  consolidated below with duplicates across reports merged.
- **Code-comment sweep**: 209 raw matches → 7 genuine current gaps after discarding stale-but-fixed
  comments, variable names (`parked` = the real `pos_parked_sales` feature, not a TODO), and
  disclosed-to-the-user placeholder copy.
- **Direct spot-verification this pass overturned 3 "still open" claims from the source reports**:
  the double stock-decrement, loyalty-redemption, and store-credit-spend items KDS-HYPOTHESIS-
  FIREFORGET-REPORT.md (2026-07-14) flagged as HIGH-risk silent failures were all fixed the very
  next day (`INVENTORY-DECREMENT-FIX-1`, `7d3273c9`, 2026-07-14; `SECURITY-CRITICAL-2`,
  `1377baec`, 2026-07-15) — confirmed by reading the current code, which now `await`s each call and
  surfaces failures as toasts. These are correctly excluded from the open list below.

---

## Full table

Grouped by category for readability; risk tier noted per row.

### A — Security-relevant, currently exploitable or founder-action-blocked

| What was deferred | Source | Date | Verified current status | Risk |
|---|---|---|---|---|
| **SECURITY-P1 hardened the WRONG booking route.** Turnstile + rate-limiting were shipped onto `public/bookings/[business_id]` believing it was the live route ("dead route, no live consumer" per the commit's own reasoning) | commit `3fc65514` | 2026-07-13 | **STILL OPEN** — `src/app/book/[slug]/page.tsx` actually calls `/api/bookings/public` (`src/app/api/bookings/public/route.ts`), confirmed today to have **zero** Turnstile and **zero** rate-limit import. The protected route has no live caller; the live route has no protection. | **Exploitable** — unauthenticated booking spam/abuse on the real endpoint. |
| Server-side `email_confirmed_at` enforcement never built (M-05/L-07/SEC-H5-app) | SECURITY-P1/P2/P3-LITE/SECURITY-RESIDUE-AUDIT-1 reports | first flagged 2026-07-06, reconfirmed 07-13, 07-14, 07-20 | **STILL OPEN**, independently reconfirmed this session — only 2 client-side (`'use client'`) redirect checks exist; no middleware/route handler check anywhere. | Exploitable (unconfirmed accounts can call any API route directly). |
| GitHub PAT rotation (exposed `ghp_wT8…`) | commit `3b108814` (2026-06-18, first flagged) | 2026-06-18, still open 2026-07-21 | **UNKNOWN — cannot verify from this environment** (no live secret found in repo/git history, but GitHub-side revocation needs a manual dashboard check). Over 5 weeks old. | Exploitable if never rotated — unverifiable, founder must confirm. |
| Higgsfield API key rotation | commit `dfc59c67` | 2026-07-16 | **UNKNOWN — needs manual check.** Code fix (key no longer returned to browser) confirmed in place; rotation of the *value* itself can't be checked from here. | Exploitable if never rotated. |
| Supabase Auth "Confirm email" dashboard toggle status (SEC-H5) | SECURITY-RESIDUE-AUDIT-1/FIX-1 | 2026-07-20/21 | **UNKNOWN — no MCP tool exposes this setting.** | Founder-action-blocked. |
| Google Business OAuth callback still uses raw `business_id` as `state`, no signed/expiring token (CONNECTOR-VAULT-1a's own deferral, same commit that flagged Xero) | commit `8ece9c17` | 2026-07-14 | **PARTIALLY DONE** — unlike Xero's version of this bug, the callback does require a live session and re-checks `.eq('user_id', user.id)` before use, a real mitigating control Xero lacked. Still not the signed-state pattern. | Broken-by-omission, not directly exploitable like Xero was, but the same shape. |
| `businesses.xero_access_token`/`xero_refresh_token` (10 read/write sites, 2 crons) left plaintext — **deferred for the second time** | first: `8ece9c17` (2026-07-14); again: `SECURITY-RESIDUE-FIX-1-REPORT.md:194-202` (2026-07-21, this session's own work) | 2026-07-14, 2026-07-21 | **STILL OPEN by design** — explicitly scoped out of this session's own token-encryption fix as too large for a single commit. | Silent PII/credential exposure risk, not immediately exploitable. |
| Google, Kounta, Lightspeed connector tokens still plaintext (only Meta + one of three Xero storage paths were fixed this session) | SECURITY-RESIDUE-AUDIT-1 / FIX-1 (this session) | 2026-07-20/21 | **STILL OPEN**, confirmed directly by this session's own audit and fix work — FIX-1's commit message does not mention Google/Kounta/Lightspeed at all. | Silent credential exposure. |
| Smoke Suite's trigger never fires (0 runs, ever — PR-only trigger, repo never uses PRs) — **the exact sibling of the Canon Rail Guard bug this session already fixed** | CI-TRIAGE-1 (this session) | 2026-07-21 | **STILL OPEN** — CI-FIX-1/LOCAL-GATE-1 (this session) fixed Canon Rail Guard's identical trigger bug but explicitly left Smoke's alone. | Silent-failure — a real security-regression test suite (RULE 13: auth/routing/middleware/RLS) providing zero of its intended coverage. |
| Turnstile keys / `TEST_USER_EMAIL`/`PASSWORD` / `NPS_WEBHOOK_SECRET` still not configured | SECURITY-P1 §9, P2 §7/§9, P3-LITE (3 separate confirmation attempts, all still absent) | 2026-07-13/14 | **STILL OPEN**, confirmed absent across 3 independent direct-check attempts. Turnstile fails OPEN (logged) when unset — every form currently accepts submissions with no bot check. | Exploitable (Turnstile), broken (smoke suite has never run against real credentials), founder-action-blocked (NPS). |
| `/api/auth/guard` is a client-called pre-check only; no server-side Supabase Auth Hook exists to enforce rate-limit/Turnstile on direct calls to Supabase's own REST auth endpoint | code comment, `src/app/api/auth/guard/route.ts:8-18` | flagged as a named P2 follow-up in SECURITY-P1-REPORT.md:125 | **STILL OPEN**, disclosed and deliberately scoped — no Auth Hook found anywhere in `src/`. | Exploitable-in-theory by a sophisticated attacker calling Supabase directly; already tracked, not urgent. |
| 34 tables `rls_enabled_no_policy` + 9 tables `rls_policy_always_true` | SECURITY-P3-LITE Item 3 | 2026-07-14 | **STILL OPEN** — "a full pass on all 43 is a P4 candidate, not lite scope." | Silent-failure-class RLS gap, unquantified. |

### B — Silent failures: exists, but never runs or verifies nothing

| What was deferred | Source | Date | Verified current status | Risk |
|---|---|---|---|---|
| "Publish to socials" (Instagram/TikTok/Facebook) from the Reels editor queues a job that is **never consumed by anything** | code comment, `src/app/api/reels/publish-social/route.ts:9-57` + `src/components/reels/TimelineEditor.tsx:395-410,1041` | — | **STILL PRESENT, BROKEN** — grepped all of `src/` for any reader of `reel_publish_jobs`: none exists. The UI says "queued and sent when connected" but nothing can ever dequeue and send it. A structurally distinct, dead-end path from the real, working `social/publish` pipeline. | Broken/silent-failure — feature accepts the request, shows no error, never delivers. |
| Aria's `pos-chat` response only flags (never redacts) hallucinated numbers in `cards[].value`/`chart.values` — the plain-text `message` field DOES get redacted a few lines above | code comment, `src/app/api/aria/pos-chat/route.ts:451-463` | flagged "last sprint" per the comment | **STILL PRESENT AND UNRESOLVED** — confirmed only `mode:'flag'` (never `redact`) applied to structured card/chart JSON. | Silent-failure — a fabricated $/% figure can reach the owner's dashboard UI, only logged after the fact. |
| `xero-auto-sync` cron has zero monitoring — not wrapped in `trackCron`/`withCronRetry`, no error logging of any kind | KDS-HYPOTHESIS-FIREFORGET-REPORT.md | 2026-07-14 | **STILL OPEN**, confirmed directly — grepped the route for `trackCron`, `withCronRetry`, `cron_runs`, `activity_log`: zero matches. | A business's Xero push can fail silently and indefinitely. |
| Stripe-paid online order's KDS-fire failure | KDS-HYPOTHESIS-FIREFORGET-REPORT.md | 2026-07-14 | **PARTIALLY MITIGATED, not fully open as claimed** — `stripe-orders/route.ts:102-107` does now write an `activity_log` row (`action_type:'stripe_webhook_kds_error'`) on KDS-fire failure. Not alerted/monitored, but no longer fully silent. | Downgraded from the report's HIGH to MEDIUM — visible in logs, not proactively surfaced. |
| Commission calculation is still fire-and-forget (`.catch(() => null)`, no failure surfaced) — this is the ONE of the four original "money-moving calls" that SECURITY-CRITICAL-2 (2026-07-15) did NOT include in its await/surface fix | `terminal/page.tsx:1719-1733` (current code, verified directly) | flagged 2026-07-14 (KDS report) | **STILL OPEN** — confirmed by direct code read: loyalty-earn/redeem, store-credit-spend, and split-payment calls were all fixed to `await` + surface failures; commission was not. | Silent-failure — commission simply never records on a failure, invisible until a pay dispute. |
| CANOPY-STAFF-CLOCK-1: clock-out never sets `approved=true`, so `payroll_runs` (which filters `approved=true`) never picks up Canopy-recorded hours | commit `a91a00a0` (explicitly disclosed as a pre-existing gap, not promised as fixed) | 2026-07-15 | **STILL TRUE**, confirmed — `src/lib/staff/payroll.ts:149` still filters `approved=true`; nothing sets it on clock-out. Currently dormant (payroll_runs has 0 rows for the one paying business). | Silent-failure, dormant — will bite the moment a second business relies on Canopy clock-in for payroll. |
| 3 Resend email call sites (`send-scheduled-reports`, `intelligence/email-report`, `bookings/public`) bypass the `sendEmail()` consent/suppression/log chokepoint | commit `4162ef49` (COST-LEDGER-1) | 2026-07-13 | **STILL OPEN**, confirmed — all 3 files still contain a local raw `fetch('https://api.resend.com/emails')` today. | Silent compliance gap — no unsubscribe/suppression enforcement on these 3 paths. |
| `schema-registry.ts`'s `slow_day` domain still uses `.neq('status','voided')` instead of the canonical `completed` filter, despite being named as a known instance of the bug family in a later report | commit `c8316dc2` (flagged it, didn't fix it) | 2026-07-15 | **STILL OPEN**, confirmed — `src/lib/aria/slow-day.ts:47` unchanged today. | Broken — wrong "slow day" figures can reach Aria's own reasoning. |
| `sync-offline` has zero loyalty integration and no real idempotency guard (its sibling `place-order` gap was fixed the same day; this one wasn't) | commit `dda64976` (BUG-HUNT-1) | 2026-07-15 | **STILL OPEN**, confirmed — `src/app/api/pos/sync-offline/route.ts` has no `earnOnSale`/loyalty reference today. | Broken — revenue/stock can double-count on retry; no loyalty earn recorded for offline-queued sales. |
| `writeAriaOutcome()` (34 call sites) silently swallows its own insert errors; `aria_outcomes` has had exactly 1 real row, ever | INTEL-OUTCOME-1-REPORT.md | 2026-06-16 | **STILL OPEN** — the function is unchanged; notably, INTEL-OUTCOME-2's own "deferred to a follow-up" list does not mention this item at all, meaning it was silently dropped rather than carried forward. | Silent-failure — corrupts the entire outcome-learning loop's data at the source. |
| Judge-gated `router.ts` action pipeline has no real DECIDE signal (57 `pending` rows, 0 ever approved); `MorningCommandCentre`'s Approve/Edit/Ignore queue has zero rows from any business | INTEL-OUTCOME-1/2 | 2026-06-16 | **STILL OPEN**, reconfirmed twice across both reports, never investigated further. | Silent-failure — a built feature that has never once been used, unclear if reachable. |
| `runAutopilotOutcomeChecks` has the identical `.neq('status','voided')` bug fixed everywhere else | INTEL-OUTCOME-2-REPORT.md | 2026-07-16 | **STILL OPEN**, explicitly "left untouched since that whole system is deferred." | Same wrong-revenue-figure bug class, confirmed still present in this one spot. |
| LOYALTY-KIOSK-CRON: `outcome-check`'s `autopilot_resolved` metric filters the literal string `'pending'`, but the column defaults `NULL` and zero rows platform-wide ever hold that string — structurally guaranteed to return 0 forever | LOYALTY-KIOSK-CRON-REPORT.md | 2026-07-14 | **STILL OPEN**, never picked up by INTEL-OUTCOME-1/2 or any later report. | Silent-failure — a metric that can never report anything but zero. |
| `subscription_status` filter bug (checks `'trialing'`, live value is `'trial'`) excludes 3/4 businesses from `hypothesis-engine`/`outcome-check` crons | LOYALTY-KIOSK-CRON-REPORT.md | 2026-07-14 | **STILL OPEN**, "bonus finding... not fixed," never picked up later. | Silent-failure — most businesses silently excluded from these crons. |
| "Feedback" tab has no backend at all (`instore_recommendation_feedback` table doesn't exist) | LOYALTY-KIOSK-CRON-REPORT.md | 2026-07-14 | **STILL OPEN**, no later report mentions building it. | UI present, feature does nothing. |

### C — Half-applied fixes: pattern fixed in one place, sibling(s) left alone

| Pattern | Where it WAS fixed | Sibling(s) still open | Risk |
|---|---|---|---|
| Xero OAuth callback trusting unsigned `state` | `integrations/xero/*` (SECURITY-CRITICAL-1, `c4636b2e`) and `xero/*` (this session, SECURITY-RESIDUE-FIX-1 Part 1) | **Now fully closed** — both implementations fixed as of this session. | Closed. |
| tsc/`next build` heap-OOM (no `NODE_OPTIONS`) | `e2e.yml`'s typecheck job (2026-07-12), extended to `e2e.yml`'s e2e-local job + `smoke.yml` + the new pre-push hook (this session, CI-FIX-1/LOCAL-GATE-1) | `canopy/package.json`'s own `"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json"` — **neither invocation has `NODE_OPTIONS`.** | Dormant — `canopy/` is a separate Electron sub-project not wired into any CI workflow, root script, or the new pre-push hook, so this never runs automatically today; still a real, unaddressed sibling if anyone ever wires it in or runs it locally on a large enough change-set. |
| GitHub Actions workflow trigger silently never firing (`pull_request`-only in a repo with zero PRs) | Canon Rail Guard (this session, SECURITY-RESIDUE-FIX-1 Part 2) | **Smoke Suite — still open**, same exact bug, explicitly identified in CI-TRIAGE-1 and not yet fixed. | Live gap — see table A. |
| Connector OAuth token stored plaintext | Meta (facebook/instagram) + `pos_oauth_integrations`-based Xero (this session, SECURITY-RESIDUE-FIX-1 Part 4) | Google, Kounta, Lightspeed, and `businesses.xero_access_token`'s 10 sites — **all still plaintext.** | Live gap — see table A. |
| `.neq('status','voided')` revenue-filter bug | Fixed in dozens of files across INTEL-COMPUTE-1..4, BRIEF-INTEGRITY-1/2, and this session's own audits | `schema-registry.ts`'s `slow_day` domain, `runAutopilotOutcomeChecks` — confirmed still present; **266 more pre-existing instances (120 `neq('voided')` + 146 hand-rolled revenue sums, ~130 files)** confirmed by this session's own SECURITY-RESIDUE-AUDIT-1 as explicitly out of the CANON guard's remediation scope. | Broken figures wherever it's still present; large, honestly-tracked backlog for the rest. |
| AI response grounding via the 5 canonical `grounded.ts` wrappers | Only 2 files in the entire codebase call them | ~146 direct-SDK call sites (31 customer-facing, 22 autonomous-action, 20 vision-media, ~73 background) confirmed still unmigrated across AI-GROUNDING-1, AI-OUTPUT-INTEGRITY-1, INTEL-CONTRACT-1, and INTEL-TRUTH-1 — the same number, reconfirmed open, across 4 separate reports spanning weeks. | The single most heavily-reconfirmed-and-never-touched item in this entire sweep. |
| Local `getBid()`/`getBusinessId()`/`getBiz()` resolver duplication | `withBusinessContext` migration, ongoing across CANON-MIGRATE-1 through -4 (this session did batch 4) | 247 files still un-migrated as of this session's own count (down from 333 at CANON-MIGRATE-1) | Openly tracked, multi-sprint, ongoing — **not** a "forgotten" instance of the pattern, included for completeness only; this is the healthy counter-case (visible backlog, steady progress) vs. the silently-dropped items above it. |

### D — Correctness / data-quality / lower risk (verified still open, not independently re-checked beyond confirming the code is unchanged)

| What was deferred | Source | Status |
|---|---|---|
| date-au.ts hardcodes `+10:00`, no AEDT/DST handling — flagged 3 separate times (TZ-1, WEEK-1, SWLM-1) | TZ-1-report.md, WEEK-1-report.md | STILL OPEN — same bug named 3x, no fix commit found. |
| POS UI report surfaces (dashboard, daily-summary, cash-movements, revenue-comparison, portfolio, promotions) use UTC-midnight boundaries not AEST | TZ-1-report.md | STILL OPEN — named successor "TZ-2" never found. |
| `timezone` column selected, never used in date math — no per-business TZ support | TZ-1-report.md | STILL OPEN. |
| ~20 other `date-au.ts` consumers outside the briefing path still using raw UTC | BRIEF-INTEGRITY-1-REPORT.md | STILL OPEN, explicitly "not touched." |
| Business-health formula duplicated (dashboard vs briefing contradiction, e.g. "$378" vs "$38") | ARIA-BUILD-PLAN.md "REMAINING" #3 (BRIEF-CONTRADICTION-1/INTEL-ROOT-1) | STILL OPEN per the plan doc itself. |
| Historical rainy/clear weather-revenue correlation stubbed null | sprint-I1-health-signals-report.md | STILL OPEN, no weather_history table built. |
| `dow_weighted` goal-projection variant reserved but never implemented | sprint-I2-goal-aware-report.md | STILL OPEN. |
| `aria_business_memory.source_type` CHECK constraint drift vs. live `'signal'` writes | sprint-I3-FIX-stack-reconcile-report.md | STILL OPEN, "left untouched per DO-NOT, noted." |
| STRICT-NULL type-safety sprint (100+ projected TS errors) never run | sprint-DB-TYPES-1-report.md | STILL OPEN, no successor sprint found. |
| 54-cron-count vs. plan limit + 8 orphan cron folders never censused | sprint-CRON-LEAK-1-report.md | STILL OPEN, named successor "CRON-1" never found. |
| Conversation-history row not backfilled after a mid-turn heal (only the live response is corrected) | sprint-GROUND-1-report.md | STILL OPEN across the whole GROUNDING-TEETH/V2/I1-I5 series. |
| INTEL-COMPUTE Bucket B: duplicate COGS/net-margin logic, dead sibling sub-handlers, 3-way dead-stock consolidation, Melbourne-TZ hardcoding in 3 files | INTEL-COMPUTE-1-REPORT.md | STILL OPEN, restated as "REMAINING #7" in ARIA-BUILD-PLAN.md. |
| `detectMarginLeaks()` never fires for Sip Café (uses raw `cost_price`, not the canonical cost resolver) | INTEL-CONTRACT-1-REPORT.md | STILL OPEN. |
| Profit Leaks page/table has no populating code path found in `src/` | INTEL-CONTRACT-1-REPORT.md | STILL OPEN — unresolved mystery. |
| Atomic-RPC race-condition pattern not yet applied to 5 remaining sites (loyalty/redeem ×2, pos/balances, quotes/view, pos/stock/adjust legacy mirror) | ARIA-ARCHAEOLOGY-1-REPORT.md | STILL OPEN. |
| Integration test asserting a real cross-route outcome (the only mechanism that would catch the next "correct code, never wired in" bug) | ARIA-ARCHAEOLOGY-1-REPORT.md | STILL OPEN — no such test found. |
| AI-COST-AUDIT-1's 5 findings: `council.ts` cost logging gap, `model-router`/`ai-router` unlogged Claude calls, hallucinated briefing dates, haiku pricing 4x too cheap in `base-agent.ts`, Opus pricing disagreement between two files | AI-COST-AUDIT-REPORT.md | STILL OPEN, read-only sprint, none fixed since. |
| `dashboard/marketing`'s "Go to Integrations →" link is a dead end (no SMS section exists there) | SECURITY-P3-LITE-REPORT.md | STILL OPEN. |
| `_dup_customer_merge_log` table keep/archive/drop decision never made | SECURITY-P3-LITE-REPORT.md | STILL OPEN. |
| `receipt-ocr`/`reel-scenes` private buckets use `.getPublicUrl()` instead of `.createSignedUrl()` (broken links, not a leak) | SECURITY-RESIDUE-AUDIT-1-REPORT.md | STILL OPEN. |
| 5 lower-severity public-surface findings from this session's own audit never carried into the fix commit: `kiosk/loyalty-scan` identity oracle, `parcel-tracking`/`fal-webhook` no signature verification, `community/live` chat+viewers no auth/rate-limit, `widget/config`+`place-order` no route-specific rate limit, `quotes/view`/`invoices/track` UUID-as-secret | SECURITY-RESIDUE-AUDIT-1-REPORT.md, not in FIX-1's scope | STILL OPEN, explicitly on the same ranked list SECURITY-RESIDUE-FIX-1 only partially executed. |
| twilio_sid DB column name (Twilio was dropped for ClickSend) | commit `3b108814`'s own "Out of scope (untouched)" note | STILL OPEN, confirmed live — 3 code sites + type definitions still reference `twilio_sid` today. |
| `pos_sale_returns` "dormant duplicate" — now read by 2 more routes than before, canonical write path unchanged, dedupe never done | commit `251d229e` | PARTIALLY CHANGED, dedupe recommendation still unactioned. |
| LivePulseRail "hot product" stat permanently shows `—`; comment's stated blocker (`pos_sale_items` has no `business_id`) is now **false** — the column exists and is 100% populated | code comment, `src/components/terminal/LivePulseRail.tsx:51-52` | STALE COMMENT — the real blocker is gone; the stat was simply never revisited. Cosmetic only. |
| 3D drink-fill vessels not wired to real `pos_products` rows | code comment, `src/lib/drinkFills.ts:5` | STILL OPEN, cosmetic. |
| ai-cost-model.json: 4 agents (bas_compliance, clv, weekly_promos, inventory_financing) marked `batchConversionDeferred` | commit `6cccab07` | STILL OPEN, but honestly tracked in the model file itself — not hidden. |
| Full Shopify token migration (CONNECTOR-VAULT-1a only fixed its SSRF issue) | commit `8ece9c17` | UNKNOWN — not independently re-checked this pass. |

---

## Ranked action list

Ranked by real exploitability/impact, using the same standard as this session's prior security work
(does it use `supabaseAdmin`/no ownership check on a guessable key = worse; is it currently
reachable by an unauthenticated or low-trust caller = worse):

1. **Fix the booking-route mismatch** — `public/bookings/[business_id]` has Turnstile+rate-limiting
   it doesn't need; `/api/bookings/public` (the route the live booking page actually calls) has
   none. This is the cleanest new instance of the audited pattern found this sweep: a security fix
   was genuinely shipped, just onto the wrong file.
2. **Smoke Suite's trigger** — identical bug to Canon Rail Guard's (already fixed this session),
   left unfixed. A whole security-regression test suite providing zero coverage.
3. **Server-side `email_confirmed_at` enforcement** — reconfirmed OPEN across 4 reports over two
   weeks; unconfirmed accounts can call any API route today.
4. **Remaining plaintext connector tokens** (Google, Kounta, Lightspeed, `businesses.xero_*`) —
   direct, explicitly-acknowledged siblings of a fix this session already made for Meta/Xero.
5. **`reel_publish_jobs` dead-end feature** — a customer-facing feature that silently does nothing;
   cheap to detect, easy to either wire up or remove.
6. **`xero-auto-sync` cron monitoring** — zero visibility into a real revenue-sync path failing.
7. **Founder-only unverifiable items** (GitHub PAT rotation, Higgsfield key rotation, Supabase
   email-confirm toggle, Turnstile/NPS/TEST_USER secrets) — none of these can be closed by code;
   all need a human to actually go check the relevant dashboard. Bundle into one founder-console
   pass rather than letting each linger separately.
8. **Commission fire-and-forget** — the one money-moving call SECURITY-CRITICAL-2 didn't cover.
9. **3 Resend call sites bypassing the compliance chokepoint** — real suppression/consent gap.
10. **The 146-call-site `grounded.ts` migration** — the single most-reconfirmed-and-never-touched
    item in the whole sweep (named open in 4 separate reports); worth a dedicated sprint given how
    many times it's been re-flagged without anyone picking it up.
11. **`schema-registry.ts`'s `slow_day` + `runAutopilotOutcomeChecks`'s `neq('voided')`** — two
    known-remaining instances of a bug fixed everywhere else; cheap, mechanical, one-line-each fixes.
12. **`writeAriaOutcome()`'s swallowed errors** — silently dropped from its own sprint's follow-up
    list rather than carried forward; the whole outcome-learning loop depends on this working.
13. **date-au.ts's DST/AEDT gap** — flagged 3 times, affects real report figures ~6 months/year.
14. Everything in table D — real, but lower urgency; several (STRICT-NULL, CRON-1 census, Bucket
    B design decision) are large enough to warrant their own dedicated sprint rather than a quick fix.

**No fixes were made this sprint, per the brief.**
