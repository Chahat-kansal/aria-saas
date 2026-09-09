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
