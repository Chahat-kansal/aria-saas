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
