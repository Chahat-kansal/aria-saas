# RUN-S6 · CHECK:LIVE

10 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE

### ⚠️ CORRECTION 1 — neither document was committed. Now they are.

The paste says *"Confirm `ARIA-ARCHITECTURE-AUDIT.md` and `ARIA-MEGA-SPRINT-INDEX.md` are now
committed (they were placed 7 Sep)."* **They were on disk and untracked.** That is why M13, M13B and
M13C each reported the audit file "missing" and re-measured every number from the code instead — it
was never in the repository they were reading.

Both are committed in this phase's commit (13 KB and 59 KB, checked for credentials first: the only
match is a sprint titled *SECRETS-DISCIPLINE*). **Three sprints of confusion end here.**

### ✅ CORRECTION 2 — every credential IS readable. The paste's warning was the right one.

| var | where |
|---|---|
| `CRON_SECRET` · `TEST_USER_EMAIL` · `TEST_USER_PASSWORD` | **`.env.local`** |
| `ANTHROPIC_API_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | **`.env.local`** |
| `TEST_BUSINESS_ID` · `TEST_ADMIN_EMAIL` | **not set anywhere** |

None are in the process environment, and **Playwright does not load `.env.local`** — exactly as the
paste warned. So `check:live` loads it explicitly rather than concluding a value is missing. Had I
checked `printenv` alone I would have reported six missing credentials and stopped.

### ⚠️ CORRECTION 3 — `npm run check` does not exist, in any form

There is **no `check*` script at all**. What exists is `test:unit` (vitest), `test:e2e` and
`test:e2e:ci` (playwright), and `test:smoke` (playwright, separate config). `check:live` is a new
name, not a third implementation of an existing one — and phases 1–2 extend the e2e fixtures rather
than adding a parallel set.

### ⚠️ CORRECTION 4 — THE SUITE SEEDS ONE BUSINESS AND TESTS ANOTHER

This is the preflight's real finding.

| | |
|---|---|
| `e2e/helpers/seed.ts` provisions | **`…0001` "Sip (E2E Test)"**, slug `sip-e2e-test`, created 11 Jul |
| `resolveTestBusinessId()` actually returns | **`…0101` "Smoke Test Café"**, created 25 Jul |

`TEST_BUSINESS_ID` is unset, so the resolver falls through to *"the newest business owned by
`TEST_USER_EMAIL`"* — and the smoke fixture is newer than the e2e one. **The seed script has been
carefully provisioning a business the suite does not use.** Its own last line even prints
`TEST_BUSINESS_ID should be …0001`, and nothing ever set it.

The shape of each explains the symptom:

| | products | completed sales | revenue | outlet | staff | conversations |
|---|---|---|---|---|---|---|
| `…0001` seeded | 2 | **0** | $0.00 | 1 | 1 | 0 |
| `…0101` used | 2 | 3 | $136.40 | 1 | 0 | **331** |

**`…0001` cannot answer a question about money, because the seed writes no sales.** (It *does* write
a staff member — into `staff_members`, the correct table per RULE 6. My first grep looked for
`pos_staff` and found nothing; corrected here rather than carried forward.)

### ✅ Isolation holds — neither test business is Sip

`Sip Café` is `ff5055a0-…`, owned by `fd33fcbd-…`. Both fixtures are owned by `905b95db-…`. **A
check cannot pass by reading Sip**, which the decision table requires — but that is true by accident
today, and phase 1 makes it explicit and asserted.

### What already exists, and is being extended rather than replaced

| | |
|---|---|
| `e2e/helpers/seed.ts` | 175 lines, idempotent, fixed UUIDs — business, staff, 2 products, loyalty offer + config, outlet, register, open cash session. **No sales.** |
| `e2e/helpers/test-business.ts` | `TEST_BUSINESS_ID`, `resolveTestBusinessId()` with the documented newest-wins fallback |
| `e2e/helpers/auth.ts` · `session.ts` · `supabase.ts` · `global-setup.ts` | sign-in and client helpers |
| `tests/smoke/` | `owner-flows.spec.ts`, `security-guards.spec.ts`, its own `global-setup.ts` |
| `e2e/` | 12 specs including `ask-aria.spec.ts` |

---

## PHASE 1 — THE SEEDED TEST BUSINESS ✅

**Commit:** `<phase-1>` · `src/lib/testing/test-business.ts` (new), `test-business.test.ts` (new, 7
tests), `e2e/helpers/test-business.ts`, `e2e/helpers/seed.ts`.

### ⚠️ CORRECTING MY OWN PHASE 0 WRITE-UP

I reported the seed/resolver mismatch as the preflight's finding. **MS8 phase 5 had already
diagnosed it**, and says so in `test-business.ts`'s own comment: *"SECURITY-P4 created a fixture for
the SMOKE suite on 25 Jul; because it was newer than the e2e fixture, it silently repointed the
entire e2e suite at a business `seed.ts` does not seed."*

What is new is **why it is still live**: MS8's fix made `TEST_BUSINESS_ID` win outright and left the
heuristic as a warned last resort — and **the variable was never set anywhere.** Not `.env.local`,
not CI, not a workflow. **A fix that depends on someone exporting a variable, and nobody does, is
not in force.** That is the same shape as everything else in this sprint's table.

**Fixed properly:** the seeded id is now the *default*. If the business the seed writes exists and
belongs to this user, it wins. The env var still overrides; the heuristic still warns; neither is
load-bearing any more.

### The fixture now has shape — sales, which it never had

`seed.ts` provisioned a business, a staff member, two products, loyalty, an outlet, a register and
an open cash session. **No sales.** So the fixture had **$0.00 of revenue**, and any question about
money was unanswerable — a live check asking one would have asserted on an empty answer, which is
this sprint's own failure mode.

Three completed sales added, fixed UUIDs, idempotent, **dated to now on every run** so *"what did we
take today"* has a real answer rather than one that ages out overnight:

```
1× Flat White  $5.50 (card) · 1× Croissant $6.00 (cash) · 2× Flat White $11.00 (card)
SEEDED_TODAY_REVENUE = 22.50   ← the single place that number is written down
```

### VERIFIED — the seed ran, against the real database

```
[seed] Resolved TEST_USER_EMAIL to user_id=905b95db-…
[seed] 3 completed sales ready — $22.50 today
[seed] TEST_BUSINESS_ID should be 00000000-0000-4000-a000-000000000001
```

Read back:

| | |
|---|---|
| `Sip (E2E Test)` | 2 products · **3 sales** · **$22.50** · 3 line items · 1 outlet · 1 staff |
| **cross-tenant** | Sip still has **1,802** sales, and the two businesses have **different owners** |

### ⚠️ THE OBVIOUS SAFETY GUARD IS THE WRONG ONE, and the test says why

`id !== SIP` **passes for an empty string, for `undefined`, for a typo, and for every other real
business in the database.** A check that resolved its business id to `''` and then asserted "not
Sip" would sail through while testing nothing — this sprint's failure mode, reproduced inside the
safety rail.

So `isSafeTestBusiness()` demands the id **be** a fixture: allocated from the reserved
`00000000-0000-4000-a000-` prefix, which `gen_random_uuid()` cannot produce. `assertSafeTestBusiness()`
throws before any write, naming Sip explicitly if that is what it was handed.

**MUTATION:** the naive guard is written out and run against `''`, `undefined`, `null`, a junk
string and a real user's uuid — **it allows all five; the real guard refuses all five.**

### ⚠️ A defect my own test caught on its first run

My first `FIXTURE_ID` pattern matched only the `…0001xx` sub-block and therefore **rejected the
seeded business itself** (`…000001`, allocated from `…0000xx`). Three tests went red immediately.
Fixed to the reserved prefix, which is the real allocation marker.

### One definition, not two

The constants and the guard live in **`src/lib/testing/test-business.ts`**; `e2e/helpers/test-business.ts`
re-exports them and `seed.ts` imports the id rather than declaring its own. **Vitest collects only
`src/**`** — a guard living in `e2e/` would be a safety rail nothing can test, which is the other
half of the same failure.

---

## PHASE 2 — ONE REAL QUESTION ✅ ← *the sprint*

**Commit:** `<phase-2>` · `playwright.check-live.config.ts` (new), `tests/check-live/global-setup.ts`
(new), `tests/check-live/ask.spec.ts` (new), `package.json` (`check:live`).

`npm run check:live` signs in, opens Ask Aria, asks **one** question whose answer needs business
data, and asserts on the wire, the screen, the stored turn and the ledger.

### ⚠️ IT RAN. HERE IS WHAT IT FOUND.

```
[check:live] fixture "Sip (E2E Test)" (…0001), 3 completed sales
[check:live] active business pinned to the fixture
[check:live] WARNING TEST_USER_PASSWORD does not match smoke-test@ariaos.site (400 invalid_credentials)
[check:live] signed in via an admin-minted session (the password path is broken)

  ✓ 0. the run was able to check anything at all
  ✓ 1. the request LEFT the client and reached the route — M12: the chat POST never fired
  ✓ 2. the answer STREAMED and SETTLED — M4: the watchdog
  ✗ 3. the STORED TURN carries provenance anchors — M3: 0 of 288 conversations did
       "the stored turn carries no provenance — every figure in it renders unanchored"
  1 failed · 3 passed
```

**The product works end to end.** The stored answer reads:

> *"You've made **$22.50** this week with 2 days left — but without a weekly target, I can't tell if
> that's on track or a concern. The bigger issue: you have zero customers on file…"*

**$22.50 is exactly the seeded figure.** Seed → app → real model → the right number, with an honest
hedge about the target it does not have. That is the whole chain, verified live for the first time.

### ⚠️ AND THE FINDING: the figure is RIGHT and UNANCHORED

```sql
role       has_provenance   content
assistant  false            "You've made $22.50 this week…"
```

`turnProvenance` is built **only** inside the strategic branch at `ask/route.ts:1234`. This question
took a different branch, so the stored turn carries no `provenance` key at all and **every figure in
it renders plain**. M3's failure — 0 of 288 conversations carrying a tier — is **still live on the
path a real business question takes.**

**The assertion stays red.** It is not flaky and it is not wrong: the product genuinely does not
anchor here. Weakening it would be the exact habit this command exists to break.

### Four defects found in my own check before it could find anything

Each was caught by running it, and none by reading it:

1. **`/api/auth/guard` returned `{"ok":true}` while Supabase returned `400`.** Watching only the
   guard reports a healthy login that never happened. The check now watches
   `/auth/v1/token` — the endpoint that actually decides.
2. **The credentials in `.env.local` carry leading whitespace** — the email is
   `" smoke-test@ariaos.site"`, 23 characters. Supabase was handed an address nobody has an account
   for. Trimmed at read time; nothing else in the repo trims these, **so the smoke suite cannot
   have authenticated either.**
3. **Each Playwright test gets a fresh page**, so "the request fired" and "the answer settled" were
   asserting against different pages and the second found an empty screen. One page for the block.
4. **`.msg-reveal` no longer matches the surface.** It timed out while a perfectly good answer sat
   on the page. Asserting on a class name is asserting on markup; the check now waits for the
   **answer text** to arrive and stop changing.

### ⚠️ A THIRD INDEPENDENT BUSINESS RESOLVER, and it answered as the wrong café

The first live run answered as **"Smoke Test Café"** while every DB assertion queried the seeded
fixture. The question and the verification were about **different businesses**.

That is the phase-0 seed/resolver mismatch in a **third** place: `user_active_business` is what
`resolveOwnerBusinessId` reads, and nothing had ever set it for this user. It is pinned in setup
now, so the seed, the app and the assertions finally name one business.

### ⚠️ THE PASSWORD IS WRONG, AND THAT IS REPORTED, NOT PAPERED OVER

`TEST_USER_PASSWORD` does not match `smoke-test@ariaos.site`. Verified against `auth.users`: the
user **exists, is confirmed, and has a password** — the stored one simply is not it.

The run does **not** mock a session. It mints a **real** one (`admin.generateLink` → `verifyOtp` →
the `sb-<ref>-auth-token` cookie) and **says loudly that the login form was not exercised.**
Navigating the magic link cannot work here: Supabase rewrites `redirect_to` to the allowlisted site
URL — observed, `http://localhost:3100/auth/callback` became `https://www.ariaos.site` — so the
session would land on the wrong origin.

**Resetting that password is an authorisation action. PARKED**, not taken. `scripts/set-smoke-test-password.ts`
exists untracked in the tree and is presumably for exactly this; running it is the founder's call.

### ⚠️ A RUN THAT CHECKS NOTHING EXITS NON-ZERO

Playwright exits 0 when every test skips, and a green `check:live` that verified nothing would be
the seven-row table in one command. Assertion **0** sits outside the skip guard: when the run is
blocked it fails, names the reason, and takes the exit code with it. Observed — the
credentials-blocked run exited **1** with six assertions marked skipped, not passed.

---

## PHASE 3 — ONE REAL PROPOSED ACTION ✅

**Commit:** `<phase-3>` · `tests/check-live/action.spec.ts` (new).

`check:live` now also asks *"Raise the price of Flat White by 10%"* and asserts **the gate held**.

```
  ✓ 7. a price-changing request reaches the route
  ✓ 8. ⚠️ NOTHING WAS PRICED — the gate held
  ⊘ 9. a proposal was recorded, pending, and unexecuted
       "Aria answered without proposing an action this run, so there is no proposal to inspect.
        The gate assertion above still ran and passed."
```

**It never approves and never executes.** The assertion is not *"the price changed"* — it is that a
price change was proposed and then **stopped**.

### The price is read BEFORE and AFTER

That is the one assertion no static gate in this repo can make. `bulk_price_update` is
`propose_only` with gate reason `money`; if anything executed it, the fixture's Flat White would
move and **assertion 8 says so by name**, quoting both prices.

### ⚠️ Assertion 9 is ⊘, not ✗, and the distinction is deliberate

A live model may reasonably answer a request instead of planning an action. Failing on that would be
an assertion about the model's mood, not about the gate — and *"a flaky live check trains people to
ignore red"*. **What must never happen — the price moving — is asserted unconditionally and did
pass.**

---

## PHASE 4 — HONEST OUTPUT ✅

**Commit:** `<phase-4>` · `tests/check-live/ask.spec.ts`.

### ⚠️ ONE RED ASSERTION WAS HIDING THREE OTHERS

The first full run reported:

```
  1 failed · 1 skipped · 3 did not run · 5 passed
```

***"3 did not run"*** — assertions 4, 5 and 6 never executed, because a `serial` describe abandons
the rest of the block when one fails. **A check whose job is ✓/✗ per assertion cannot hide three of
them behind the first failure.** That is the silence this phase exists to end, inside the tool built
to end it.

Serial is now scoped to the **browser turn alone** — those two genuinely must run in order on one
page — and the assertions that merely read what the turn left behind each report for themselves:

```
  1 failed · 4 skipped · 5 passed        ← nothing hidden
```

### Three states, and the third is the point

| | |
|---|---|
| **✓** | the assertion ran and held |
| **✗** | it ran and failed — with **what was expected and what was seen**, never *"assertion failed"* |
| **⊘** | it could not run, **with the reason**: no anchors to verify · no model call was logged · Aria did not propose this run · the run could not sign in |

**A run that checked nothing exits NON-ZERO.** Playwright exits 0 when everything skips, so
assertion **0** sits outside every skip guard: when the run is blocked it fails, names the reason,
and takes the exit code with it. Observed on the credentials-blocked run — exit **1**, six
assertions marked **skipped, not passed.**

---

## PHASE 5 — WHERE IT RUNS ✅

**Commit:** `<phase-5>` · `CLAUDE.md`, `.github/workflows/check-live.yml` (new).

### ⚠️ CONFIRMED: IT IS IN `CLAUDE.md`'s STANDING GATES — **RULE 3a**

This is the durable outcome of the sprint, and it is done. RULE 3 listed three static gates; **RULE
3a** now sits directly beneath them:

```
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
npx vitest run     # must be green
npm run check:live # one real question + one real proposed action, against a real build
```

RULE 3a carries the seven-row table — *green build, dead feature* — so the next person reads **why**
before they read the command. It states the three states, that **a run that checked nothing exits
non-zero**, and the prerequisites.

**"It built" is no longer the standard.**

### Not in the pre-push hook, on purpose

It spends real money and takes minutes. A hook people learn to bypass is worse than no hook. It runs
**deliberately**: `npm run check:live` by hand, or `.github/workflows/check-live.yml` on
`workflow_dispatch` and once a day at **19:00 UTC — 05:00 AEST**, before any Australian venue opens,
so a failure is waiting in an inbox rather than discovered by an owner at the counter.

The workflow seeds the fixture first (idempotent, fixed UUIDs), names **every** required secret, and
uploads the Playwright trace on failure.
