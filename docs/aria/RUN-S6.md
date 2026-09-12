# RUN-S6 · CHECK:LIVE

**10–12 September 2026 · autonomous run, RULE 20 · seven phases, seven commits, none parked as
work. All pushed. Build verified green.**

**`npm run check:live` exists, runs, and found things on its first outing.** One real Ask Aria
question and one real proposed action, end to end, against a real production build — and it is now
**RULE 3a in `CLAUDE.md`**, the last line of every sprint's gate list.

**"It built" is no longer the standard.**

## THE THREE THINGS YOU MOST NEED TO KNOW

**1. ⚠️ M13C + M13D ARE WORKING IN PRODUCTION — and the council is alive.** The feature that managed
*"97 sessions, 2 proposals ever"* over 94 days now shows, in three days: **128 `agent_runs` rows**
(was 7, frozen since 4 June), **32 agent decisions** (was 2 ever), **12 proposals** (was 2 ever), and
an `agent_health` block on **2 of 2** sessions. The owner's line now reads *"Reviewed 4
recommendations… **2 of 14 checks did not report**, so this is not the full picture."* And the first
per-agent diagnosis this product has ever produced: **`pricing` and `clv` are timing out** at the
25-second guard, named with the reason.

**2. ⚠️ THE CHECK FOUND A LIVE GAP ON ITS FIRST RUN.** Ask Aria answered *"You've made **$22.50**
this week…"* — exactly the seeded figure, with an honest hedge about the target it does not have. The
whole chain works. **And the stored turn carries no `provenance` key at all**, so that correct figure
renders unanchored. M3's failure — 0 of 288 conversations carrying a tier — **is still live on the
path a real business question takes.** The assertion stays red.

**3. ⚠️ THE CONSTITUTION AND THE ANCHORS LIVE ON DIFFERENT LANES, so no single turn can have both.**
`assembleAriaPrompt()` has exactly two production callers — the **general** lane (which runs *before*
business context exists) and `slim-context.ts`. `answer-council.ts` still contains **zero**
references to the constitution. The lane that answers business questions is not constitution-
governed. That is the deepest finding here and it needs a sprint of its own.

## EACH ASSERTION, AND THE SHIPPED FAILURE IT WOULD HAVE CAUGHT

| | assertion | the failure it catches |
|---|---|---|
| ✓ | **0.** the run could check anything at all | a green run that verified nothing |
| ✓ | **1.** the request LEFT the client and reached the route | **M12** — the chat POST never fired |
| ✓ | **2.** the answer STREAMED and SETTLED | **M4** — the watchdog |
| ✗ | **3.** the STORED TURN carries provenance anchors | **M3** — 0 of 288 conversations carried a tier |
| ⊘ | **4.** an anchored figure RESOLVES TO REAL ROWS | the moat — a number wearing a badge of truth |
| ⊘ | **5.** the answer was CONSTITUTION-GOVERNED | **M12** — the bathroom answer |
| ⊘ | **6.** the ledger records WHICH PROVIDER served it | **M8/M13B** — a call that cost money and appears nowhere |
| ✓ | **7.** a price-changing request reaches the route | — |
| ✓ | **8.** **NOTHING WAS PRICED — the gate held** | a money action that executes itself |
| ⊘ | **9.** a proposal is pending and unexecuted | **M11** — `executeProposal` that never ran, unnoticed |

**Assert on the STORED TURN, not the screen** — a rendered answer that persisted nothing is the
`/ax` failure, and assertion 3 reads the database, not the page.

## PROOF THE PROVENANCE MUTATION GOES RED

**The mutation was not needed: the product is already in the mutated state.** Assertion 3 is red
against production right now, for the real reason — `turnProvenance` is built only inside the
strategic branch at `ask/route.ts:1234`, and a real business question takes a different one. The
stored assistant turn has no `provenance` key.

**A mutation proves an assertion can fail. This one is failing, on live data, for the exact cause it
was written to detect.** That is stronger evidence than an induced failure, and it is why the
assertion stays red rather than being softened.

## WHAT `check:live` SAYS ABOUT THE LAST FIVE SPRINTS

| sprint | live status |
|---|---|
| **M13C + M13D** | ✅ **working** — 128 agent runs, 12 proposals, health block present, two agents named as timing out |
| **M14** | ✅ **screens verified in a browser** — `/dashboard/surcharge-ban` renders the RBA mechanism wording verbatim; the compliance card shows the correct **calm** variant. M14's own *"NOT VERIFIED IN A BROWSER"* caveat is discharged |
| **M13B** | ⚠️ the answer council still carries **no constitution** — measured again, unchanged |
| **M11B** | ⚠️ **the plan loop has never produced a step** — `aria_autopilot_actions` with a `plan_id`: **0**. Built, tested, green, never exercised |
| **M3** | ⚠️ provenance still absent from a real business turn |

## CONFIRMED: IT IS IN `CLAUDE.md`'s GATE LIST — **RULE 3a**

```
npx tsc --noEmit   · npm run build   · npx vitest run   · npm run check:live
```

RULE 3a carries the seven-row *green build, dead feature* table so the next reader gets the **why**
before the command. **Not in the pre-push hook** — it costs money and minutes, and a hook people
bypass is worse than no hook. It runs by hand or via `.github/workflows/check-live.yml`:
`workflow_dispatch`, plus daily at **19:00 UTC = 05:00 AEST**, before any Australian venue opens.

## ⚠️ WHAT THE RUN COULD NOT DO

- **The login FORM is not exercised.** `TEST_USER_PASSWORD` does not match
  `smoke-test@ariaos.site` — `auth.users` confirms the user exists, is confirmed and has a password.
  The run mints a **real** session (`admin.generateLink` → `verifyOtp` → cookie), never a mock, and
  says so every time. **Resetting that password is an authorisation action: PARKED.**
  `scripts/set-smoke-test-password.ts` sits untracked in the tree and is presumably for exactly this.
- **⚠️ `.env.local`'s credentials carry leading whitespace** — the email is
  `" smoke-test@ariaos.site"`, 23 characters. `check:live` trims at read time; **nothing else in the
  repo does, so the smoke suite cannot have authenticated either.**

## FOUR DEFECTS IN MY OWN CHECK, ALL CAUGHT BY RUNNING IT

1. Watching `/api/auth/guard` reported `{"ok":true}` while Supabase returned **400** — it now
   watches the endpoint that actually decides.
2. Each Playwright test gets a **fresh page**, so "the request fired" and "the answer settled" were
   asserting against different pages.
3. **`.msg-reveal` no longer matches the surface** — it timed out while a good answer sat on screen.
   Asserting on a class name is asserting on markup.
4. **One red assertion hid three others.** `serial` abandons the block on failure, so the first run
   reported *"3 did not run"* — the exact silence phase 4 exists to end, inside the tool built to end
   it.

**And two the check would have had to defeat to stay honest:** the answer council **caches** on
`questionHash + dataEpoch`, so a repeat run returns a stored answer and **never calls the model** —
green, fast, proving nothing; and the app resolved **a third, different business** from the seed and
the assertions, so the question and the verification were about different cafés.

## MY OWN ERRORS

- **A stale `next build` under a live server** cost three confusing runs: the server served HTML for
  JS chunks because I rebuilt `.next` underneath it. My own standing rule, broken by me.
- **My `FIXTURE_ID` pattern rejected the seeded business itself** — caught by its own test on the
  first run.
- **I reported the seed/resolver mismatch as my finding**; MS8 phase 5 had already diagnosed it. What
  was new is that its fix depended on an env var **nobody ever set**.

---

Written incrementally as the run went — a halted run still leaves a readable log.

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

---

## PHASE 6 — RUN IT AGAINST THE LAST FIVE SPRINTS ✅

**The first honest live status of the product.** Failures below are **findings, not regressions**,
and nothing outside this sprint's scope was fixed.

### ⚠️ M13C + M13D — WORKING IN PRODUCTION. This is the headline.

The nightly council was, for 94 days, *"97 sessions, all complete, 2 proposals ever"*. Measured now:

| | before | **last 3 days** |
|---|---|---|
| `agent_runs` rows | **7, frozen since 4 June** | **128** |
| `agent_decisions` | **2, ever** | **32** |
| `agent_council_proposals` | **2, ever** | **12** |
| sessions carrying `agent_health` | 0 | **2 of 2** |
| distinct agents that ran | — | **8** |

**The narrative an owner now reads:**

> *"Reviewed 4 recommendations and approved the highest-impact actions for today. **2 of 14 checks
> did not report**, so this is not the full picture…"*

**And the first real per-agent diagnosis this product has ever produced:**

```json
[{ "kind": "timed_out", "reason": "timeout", "agent_type": "pricing" },
 { "kind": "timed_out", "reason": "timeout", "agent_type": "clv" }]
```

**`pricing` and `clv` are hitting the 25-second guard.** Named, with the reason, in a row anyone can
query. That is exactly what M13C phase 1 built and M13D unblocked — and it is a *new* finding,
handed over rather than fixed here.

### ✅ M14 — the screens are verified in a browser. That gap is closed.

M14 shipped with *"NOT VERIFIED IN A BROWSER — no session"* at the top of its run log. Loaded live
against a production build with a real session:

| surface | | |
|---|---|---|
| `/dashboard/surcharge-ban` | **200**, 2,430 chars | renders the RBA mechanism wording **verbatim**: *"the Reserve Bank lifts its prohibition on card networks enforcing no-surcharge rules… expected to forbid surcharging under their own scheme rules"* |
| `/dashboard/compliance` | **200** | the card is live: *"💳 **Card costs fall on 1 October** — You do not add a card fee, so nothing is taken away from you…"* — correctly the **calm** variant, because the fixture does not surcharge |
| `/dashboard/agents` | **200** | *"Council hasn't run today yet. It runs at 6am AEST automatically."* |

**M14's own caveat is now discharged**, by the tool this sprint built.

### ⚠️ M11B — the plan loop has never produced a step

```
aria_autopilot_actions with plan_id IS NOT NULL:  0
```

M11B built the plan rail — `plan.ts`, `persist.ts`, `approve.ts`, `run.ts`, `report.ts` — and
`savePlan` writes its steps as `aria_autopilot_actions` rows carrying `plan_id`/`step_index`.
**Not one such row exists.** The loop has never been driven end to end in production.

That is the seven-row table's shape again — built, tested, green, never exercised — and it is
exactly what a live check is for. **Reported, not fixed:** driving the plan loop is its own sprint.

### The Ask Aria turn itself

```
  ✓ 0. the run was able to check anything at all
  ✓ 1. the request LEFT the client and reached the route
  ✓ 2. the answer STREAMED and SETTLED
  ✗ 3. the STORED TURN carries provenance anchors     ← the finding
  ⊘ 4. an anchored figure RESOLVES TO REAL ROWS        (no anchors to verify)
  ⊘ 5. the answer was CONSTITUTION-GOVERNED            (no model call was logged for this turn)
  ⊘ 6. the ledger records WHICH PROVIDER served it     (same reason)
  ✓ 7. a price-changing request reaches the route
  ✓ 8. NOTHING WAS PRICED — the gate held
  ⊘ 9. a proposal was recorded, pending, unexecuted    (Aria answered without proposing this run)

  1 failed · 4 skipped · 5 passed
```

**Two findings sit behind those skips.**

**⚠️ The turn logged no `aria_ai_calls` row**, which is why 5 and 6 could not run. A model call that
cost money and appears nowhere is precisely how `intent_classifier` ran twice a turn across 412
turns with zero rows (M12 phase 5). Either the turn was served from a cache the epoch-bump did not
reach, or the lane that answered does not log. **Named; not chased here.**

**⚠️ And the constitution question is structurally unanswerable on this path.**
`assembleAriaPrompt()` has exactly two production callers — `ask/route.ts:872` (the **general** lane,
which runs *before* business context exists) and `slim-context.ts`. `answer-council.ts` contains
**zero** references to the constitution, still, as M13B measured. **The lane that carries the
constitution and the lane that answers business questions are different lanes**, so no single turn
can satisfy both assertion 3 and assertion 5. That is the deepest finding of this sprint and it
belongs to a sprint of its own.
