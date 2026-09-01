# RUN-S10 — THE LIMITER AND THE LAST GATE

**Autonomous run, 1 Sep 2026.** Five phases, five commits. Phase 0's findings are in phase 1's
commit message rather than a commit of their own.

---

## THE SUMMARY, FOR SOMEONE WHO HAS BEEN AWAY ALL DAY

### Login worked. The suite ran. Then my own push cadence tripped the real limit.

**Phase 1 is verified by observation.** Run `33496413779`: **zero `[rate-limit] FATAL` lines, no
login error, and the smoke suite ran to completion — 6 passed, 3 failed, 9.6 minutes.** Those
assertions had never once executed against a real page. Four consecutive infrastructure layers had
blocked this suite — lockfile, selector, password, limiter store — and **not one of them was Ask
Aria.** That is now cleared.

**Then the next run went red at login again, and it is a different thing.** Run `33498410137` shows
**zero FATAL lines and zero "Redis unavailable"** — the limiter is connected and working. So
"Too many attempts" is now a **genuine count**: `/api/auth/guard` allows **10 logins per 15 minutes
per IP**, and I pushed three times in about thirty minutes, each push running two suites that log in
one to two times, with retries, from shared GitHub runner egress IPs.

**This is not a regression and it is not the old bug.** It is the limiter doing its job to a caller
that legitimately logs in more often than a human would. Two ways forward, and only one of them is
mine to propose:

- **Test-side (safe, not done here):** the smoke fixture logs in fresh every run. `e2e/helpers/`
  already has `restoreCachedSession` for exactly this. Reusing a cached session would cut CI's login
  count sharply without touching auth.
- **Product-side (yours):** 10/15m per IP is tight for any shared-egress caller. Changing it is
  authorisation and is parked.

### The two findings that outlive CI

**1. An Upstash outage locks every owner out of their own business.** The login guard runs *before*
Supabase; a 429 there means `signInWithPassword` is never called. When Redis is unreachable the
guard 429s on the **first** call for **every** caller. Full analysis, with the route table and the
key composition, in [`S10-LIMITER-ANALYSIS.md`](./S10-LIMITER-ANALYSIS.md).

**2. The alerting that exists watches cost, not failure.** `MONITOR-1` is real, scheduled and
running — and `cron_runs` has **no watcher at all**, which is why nightly-sync buried 2,272 false
failures for three months. Full sweep in [`S10-FATAL-SWEEP.md`](./S10-FATAL-SWEEP.md).

### Three corrections to the sprint's premises

| the paste said | what is true |
|---|---|
| fail-open/closed is *"a product decision per route, not one global default"* | It **is** one global default today (`rate-limit.ts`), and no route overrides it. That sentence describes the fix, not the present. |
| `auth-guard:login:::1` reads as *"an empty identifier plus a localhost IP"* | **The key varies correctly per caller.** `::1` is the *whole* IP — IPv6 loopback, its double colon being the address's own zero-compression. Checked, not assumed. |
| the E2E 36-minute run *"may be the same cause"* | **Different cause.** That job runs against production, where Upstash *is* configured. It got past login and ran real specs; 36 minutes is a long tail of 45-second timeouts with retries, not a hang. |

And a third behaviour nobody had named: **Redis configured but unreachable at call time does not
fail closed — it throws, and the route 500s** (`rate-limit.ts:64`, unwrapped). On login that still
shows *"Too many attempts"*, because `checkAuthGuard` treats any non-`ok` response as a rate-limit
refusal. **Two different infrastructure failures, one misleading message.**

---

## PHASE 0 — THE GATE (reported in phase 1's commit)

Three things the register still called open are **already resolved**, verified against the Actions
API rather than a document:

- **`typecheck` is GREEN and runs** (run `33494611753`, 09:53→09:56). RUN-S9 says skipped.
- **`e2e-local` executes** rather than skipping — it reaches login.
- **The credential is fixed.** `e2e-local`'s `page_error` is now *"Too many attempts"*, not
  *"Invalid login credentials"*, and the 31 Aug production run got past login entirely. Chahat set
  `TEST_USER_PASSWORD`. **#12's credential half is closed.**

---

## PHASE 1 — GET THE SECRETS TO THE WEB SERVER · `6b41cc42`

`next start` sets `NODE_ENV=production`, so `rate-limit.ts` takes its production branch — which
**fails closed** when Upstash is unreachable, deliberately (SECURITY-P1 M-01). Both variables are
set in Vercel; CI's server runs outside Vercel and nothing passed them in. Every limited route
returned 429 on its **first** call.

Added job-level to the two jobs that run their own server (`smoke`, `e2e-local`), and **deliberately
not** to `test`, which points at production where Vercel already supplies them.

**The rail keys off `BASE_URL`, not a job list** — a job serving localhost runs its own limiter and
must supply its store. Anti-vacuity: the parser must find ≥4 jobs, the exact four names, ≥3 env
blocks and a known key, or it fails as broken. Mutation: strip one variable → red.

**No secret value is printed.** The verify step reports presence and a character count only — the
existing convention — and a test asserts no workflow echoes a secret or commits a literal.

---

## PHASE 2 — WHAT THE SUITE ACTUALLY TESTS · `7b526fd8`

**6 passed, 3 failed.** Three failures, three different verdicts — deliberately not one label:

| # | assertion | verdict |
|---|---|---|
| 1 | `owner-flows:39` Ask Aria reply | **TEST DEFECT — fixed.** The selector was `[class*="message"\|"response"\|"chat"]`, which matches **nothing** on the AX surface; its classes are `.m`, `.m.me`, `.bub`, `.talk` from the lifted design contract. Written against the old `/classic` DOM. Now `.m:not(.me) .bub` — Aria's side specifically, because matching `.bub` alone would pass on the echo of the owner's own question. |
| 2 | `owner-flows:104` POS product grid | **UNRESOLVED — recorded, not guessed.** I checked before classifying: `.pos-product-grid` *is* on a real element (`terminal/page.tsx:3093`), so the selector is valid and the grid genuinely did not render. Likeliest cause is the "Continue as owner" bypass not taking, leaving POSShell on its PIN screen — but that is inference and settling it needs the failure screenshot. |
| 3 | `owner-flows:193` bookings insert | **OBSERVABILITY DEFECT — fixed; cause still unknown.** It destructured only `data`, so a rejected insert produced `expect(booking).not.toBeNull()` and nothing about why — a constraint, a missing column and an RLS refusal all look identical. RULE 7, in a test. The error is now asserted first, so the next run names it. |

The same assertion as #1 is why the 31 Aug production e2e run took 36 minutes. One root cause, two
suites.

---

## PHASE 3 — THE LIMITER FAILS CLOSED ON LOGIN · `6251e957`

Report only; **no auth behaviour changed.** Full table in
[`S10-LIMITER-ANALYSIS.md`](./S10-LIMITER-ANALYSIS.md): 19 rate-limited routes, what each key varies
by, and what an outage costs each one.

**Four routes are 🔴 lockout-critical** — the three `auth-guard` actions and `aria/ask`. **Four are
🟢 correctly fail-closed** — winback, bulk-winback, invoices/send, pos/customers/sms; refusing to
send money or messages you cannot count is right, and that behaviour should stay.

**Two genuine shared buckets found, neither on the route the sprint suspected:**
`instore-chat` keys on **business_id only** — 60/hour for the whole venue, so one customer can
exhaust in-store chat for everyone; and `with-rate-limit.ts` keys on a **client-supplied**
`x-user-id` header, falling back to `'anon'`.

**Recommendation:** do not flip the global default — that would undo SECURITY-P1 M-01 and strip rate
limiting from the money routes. Make it explicit per call (`onUnavailable: 'deny' | 'allow'`,
defaulting to today), and set `'allow'` on the four 🔴 rows only. The security case for failing
closed on *login* is weak in a way it is not elsewhere, and the guard's own header says why: a
scripted attacker calls Supabase's REST endpoint directly and never touches it.

---

## PHASE 4 — NOBODY IS LISTENING TO FATAL · `7cb3ee64`

**The sprint's framing needed adjusting: there IS a listener.** `MONITOR-1` posts to a webhook and
escalates high severity to email and SMS; three crons call it and all three are scheduled and
running. It was built after the Anthropic outage ran two weeks unnoticed.

**But it watches cost.** `aria-health-monitor` calls `sendAlert` six times — budget, renewals, quota
— and **not once for its own red checks**, which write an `aria_actions` row and stop. 27 are
pending now.

**The two conditions with no listener at all:** the `[rate-limit] FATAL` (the one literal FATAL in
the runtime; a `console.error` and nothing more, logged four times in a single build), and
**`cron_runs` failures — 2,275 of them, and nothing reads that table looking for failures.** That is
the highest-value gap, and a watcher is one query.

**And there is no evidence trail that alerting has ever worked.** `alert.ts` writes nothing to the
database and no-ops silently when `ALERT_WEBHOOK` is unset. **I cannot read Vercel's environment, so
I cannot tell you whether a single alert has ever been delivered** — worth checking before trusting
any of the three watchers.

**Not a finding:** the 14 `'critical'` literals in `page-insight`, `generate-purchase-orders`,
`reorder-forecast`, `seo/crawl` and `visa/monitor` are *content* severity — how urgently to show an
owner a business insight. They are correctly surfaced. Nothing is wrong with them.

---

## WHAT REMAINS

| item | whose |
|---|---|
| Login fail-open decision (`onUnavailable`) | **Yours** — authorisation |
| `10 / 15 m` login limit vs CI's cadence | **Yours** — or cache the smoke session, test-side |
| `instore-chat` venue-wide bucket · `x-user-id` trust | **Yours** — security controls |
| Confirm `ALERT_WEBHOOK` is set | **Yours** — Vercel env |
| `cron_runs` failure watcher; `sendAlert` from red checks and from the FATAL branch | Small and mechanical, but the escalation path is Resend — parked |
| POS grid failure (#2 above) | Needs the failure screenshot |
| Wrap `rl.limit()` so a runtime outage is not a 500 | Follows the `onUnavailable` decision |

## GATES

`tsc` 0 · `vitest` **1254/1254 across 99 files** · `next build` **BUILD_EXIT=0 read from the log** ·
Canon Rail Guard green in CI on every push this sprint.

**Not verified against a browser by me:** every CI claim here cites a run id and was read from the
Actions API. Where a cause is inferred rather than measured — the POS grid — it says so.
