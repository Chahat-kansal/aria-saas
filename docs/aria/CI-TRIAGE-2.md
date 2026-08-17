# CI-TRIAGE-2 — why `e2e-local` has never been green

**SETUP-1 PHASE 2. Diagnosis only — no fix is applied by this document or its commit.**

Written 2026-08-17. All evidence is from the live GitHub Actions API, the live Supabase database
via MCP, and the code at `d5df27d2`. Nothing here is quoted from a previous report; where an
earlier report is used it is labelled and dated.

> **Status: Q1 and the two-suite comparison are NOT DETERMINED.** They need the CI artifacts,
> which had not arrived when this was committed. Everything else below is established. When the
> artifacts land, a dated section is APPENDED — this document is not rewritten, so the predictions
> in §7 stay visible next to their outcome and can be scored honestly.

---

## 1 · The headline correction: this is not a two-week regression

The sprint brief described `e2e-local` as red for two weeks. It is worse and simpler than that.

| fact | value |
|---|---|
| Last successful e2e run, any branch or event | `82783be0`, **2026-07-10T01:39:35Z** |
| First red of the unbroken streak | `43746e77`, 2026-07-10T02:05:25Z (**26 minutes later**) |
| Consecutive red `main`/push runs since | **200 of 200 on record** |
| Last green `main`/push run | **none exists** |

`43746e77` is the commit that **created the `e2e-local` job**:

```
43746e77  ci: Playwright e2e + typecheck in GitHub Actions   (Fri 10 Jul 2026)
```

The 680 "successful" e2e runs all predate it and belong to the older `repository_dispatch`
prod-smoke workflow that occupied the same file.

**`e2e-local` has therefore never passed, on any commit, ever.** There is no known-good state to
restore. This is unfinished work, not a regression — which is the single most important input to
Phase 3.

---

## 2 · Not one cause. At least four eras.

The failure signature is different at the two ends of the streak, so this is stacked causes, not
one continuous one. Measured by sampling `e2e-local`'s step outcomes across the streak:

| era | window | `typecheck` | first failing step in `e2e-local` | credentialed auth possible? |
|---|---|---|---|---|
| **1** | 10 Jul | **fail** | **Build (TEST env)** — specs never executed | no |
| **2** | 12 Jul | pass | Run e2e specs | no |
| **3** | 14–27 Jul | **fail** | (step detail no longer retained) | no |
| **4** | 3 Aug → today | pass | **Run e2e specs** | yes, from 12 Aug |

Today every piece of infrastructure is green — secrets verified, build, seed, browser install,
server start, server wait all pass — and the **only** failing step is the specs themselves.

**The eras must not be merged.** `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` were created on
**12 Aug 2026** (`smoke-test@ariaos.site`, user `905b95db-9de0-4c2b-8698-991e6e9f61a8`). Before that
date no credentialed spec could have authenticated at all, whatever else was wrong. Eras 1–3 are a
separate question from era 4 and are not explained by anything in §3.

Eras 2–3 overlap CI-TRIAGE-1 (`1632eeb0`, `40afb189`, `1cb13b51`, 26–27 Jul), which drove failures
**52 → 10 → 9**. The 27 Jul Playwright report shows exactly 9. That is where the last triage
stopped, not where things stand now.

---

## 3 · The fixture split — corroborated against the live database

The CI test account owns **exactly two** businesses. Confirmed independently via Supabase MCP,
not inferred from code:

| business | id | created | onboarding_complete | outlets | registers | products (active) | sales |
|---|---|---|---|---|---|---|---|
| **Smoke Test Café** | `…0101` | **2026-07-25 14:19** | **true** | **1** | **0** | 5 (2) | 1 |
| **Sip (E2E Test)** | `…0001` | 2026-07-11 15:19 | **false** | **0** | **0** | 2 (2) | 18 |

`e2e/helpers/test-business.ts:11-18` resolves with `.order('created_at', desc).limit(1)`, so it
returns **`…0101` deterministically**. `TEST_BUSINESS_ID` is not set in either CI job, so that
fallback never engages. `tests/smoke/owner-flows.spec.ts:11` imports **the same resolver**, so both
suites target the same business.

Meanwhile `e2e/helpers/seed.ts:29` seeds `SIP_BUSINESS_ID = …0001` **exclusively** — 2 products,
1 staff member, 1 loyalty reward, loyalty config. The workflow step is even labelled
*"Seed test data (idempotent — Sip business, staff, products, reward)"*.

**The seed writes to `…0001`. Every spec asserts against `…0101`.**

`…0101` was created on 25 Jul as the **SECURITY-P4 smoke-suite fixture** — labelled exactly that in
`supabase/migrations/20260726010000_businesses_is_test.sql:10`, alongside commits `a5e1e706` /
`a7df4aab` dated 25 Jul. Creating a fixture for the *smoke* suite silently repointed the *e2e*
suite, because the resolver takes "newest business owned by this user". Nothing announced it.

### 3a · Correction to this sprint's own interim report

An interim report earlier in SETUP-1 implied `…0101` is bare and unseeded. **That was wrong**, and
the error was mine: the first query counted `pos_products` without `is_active` and did not read
`onboarding_complete` at all.

`…0101` is in fact the **better-provisioned** business — onboarding complete, an outlet, 2 active
products, a loyalty offer and loyalty config. `…0001` has `onboarding_complete = false` and **zero
outlets**. So the resolver is arguably picking the *right* business, and `seed.ts` is the stale
half, maintaining a fixture nothing reads.

Recording this under CLAUDE.md failure pattern #5 (measurement errors in your own diagnostics),
because the corrected reading changes Phase 3's options rather than just a detail.

### 3b · Neither fixture is currently correct

This is the finding that decides Phase 3's shape.

| | `…0101` (resolved) | `…0001` (seeded) |
|---|---|---|
| onboarding complete | ✅ | ❌ **false** |
| outlet | ✅ 1 | ❌ 0 |
| register | ❌ 0 | ❌ 0 |
| maintained by `seed.ts` | ❌ | ✅ |

Pointing `TEST_BUSINESS_ID` at the seeded business does **not** fix this. It swaps the
wrong-business failure for a **no-outlet** failure — the same gap the 26 Jul e2e fix
(`40afb189`, *"outlet gap"*) and `5dc3f3b7` (*"guarantee an outlet on every onboarding-completion
path"*) closed on `…0101` — **and additionally** hits `onboarding_complete = false`, which routes
authenticated traffic to the onboarding wizard rather than the dashboard.

One has the outlet without the seed; the other has the seed without the outlet, and is not
onboarded either. **Neither is usable as-is.** Any real fix has to reconcile `seed.ts`, the
resolver, and the fixture outlets/registers together, then prove the result over a run — which is
precisely why this is not a small, clearly safe change.

---

## 4 · Q3 — CLOSED. The staff PIN is not implicated.

**Do not re-open this.** `pos_users = 0` on both businesses, and it does not matter:

- `src/components/pos/POSShell.tsx:347-357` renders an explicitly commented
  `{/* Always-visible owner bypass */}` — the button **"Continue as owner (bypass PIN)"** — plus a
  "No staff set up yet" panel when the user list is empty. The bypass is not conditional on
  `pos_users` being non-empty.
- `e2e/pos.spec.ts:15-19` clicks exactly that button before asserting anything, then calls
  `openRegisterIfNeeded` for the separate no-open-shift gate.

Consequences, stated so nobody re-derives them:

- **No staff user needs to be created** for CI.
- **`STAFF_PIN_PEPPER` is untouched by this diagnosis.**
- **The SEC-PIN-3 §2 pepper-rotation ordering constraint does not apply here.**

---

## 5 · Q1 — login vs post-login: **NOT DETERMINED**

Cannot be answered from step granularity. `login()` runs in `beforeEach`, so a `waitForURL`
timeout there and a post-login assertion failure both surface as the same failing step
(`Run e2e specs`). Needs the Playwright report. See the prediction in §7.

## 6 · Two-suite comparison: **NOT DETERMINED**

The mechanism is known — both suites import the same `resolveTestBusinessId`, so a
fixture-resolution cause would hit both, giving **one cause with two witnesses**. Whether the same
specs actually fail the same way needs both reports side by side. The Smoke Suite produced its
first-ever run at `d5df27d2` (SETUP-1 Phase 1); its results are new information, not regressions.

---

## 7 · PREDICTION — recorded before the artifacts arrive, so it can be scored

**The discriminator:** `login()` is called in `beforeEach` by every credentialed spec. If login
were failing, **every** credentialed spec would fail — roughly 40+ across both suites — while the
handful that deliberately use no session would still pass. A partial, clustered failure set means
login works and the causes are post-login.

Classification of the 9 failures from the 27 Jul report (**shape only — three weeks stale, not the
current signature**), by reading each spec body:

| spec | test | business-data dependent? |
|---|---|---|
| `e2e/auth.spec.ts` | logout redirects to login page | **no** — needs login + sidebar chrome only |
| `e2e/dashboard.spec.ts` | sidebar navigation renders | **no** — asserts `nav` exists |
| `e2e/invoice.spec.ts` | shows table or empty state | **no** — asserts the always-rendered "Outstanding" card |
| `e2e/ask-aria.spec.ts` | strategic question gets substantive reply | **no** — LLM latency; flagged in-code as its own finding |
| `e2e/onboarding.spec.ts` | wizard shows a step or redirects | **yes** — reads onboarding state |
| `tests/e2e/02-terminal.spec.ts` | loads with Pulse Rail and main shell | **yes** |
| `e2e/pos.spec.ts` | product grid renders after owner bypass | **yes** |
| `e2e/pos.spec.ts` | search bar present in terminal | **yes** |
| `e2e/pos.spec.ts` | adding a product to cart shows price + charge | **yes** |

**Predictions, in falsifiable form:**

- **P1 — login WORKS.** The current failure set is a *subset*, not a wipeout. Concretely: **fewer
  than 15 failing tests**, and `e2e/auth.spec.ts`'s *"accessing /dashboard without auth redirects
  to login"* (which never logs in) passes. If instead ~40+ fail including every credentialed spec,
  P1 is **wrong** and the cause is authentication, which would make this one environment cause
  rather than several.
- **P2 — the POS ×3 cluster still fails**, and the reason is **`…0101` having 0 registers**, not
  missing products (it has 2 active) and not `pos_users = 0` (bypassed, §4). Expect the failure at
  the product-grid/open-register step, not at login.
- **P3 — `ask-aria`'s failure, if still present, is latency**, independent of the fixture split,
  and belongs to its own investigation. The spec's own comment already records this as a genuine
  finding rather than a test bug.
- **P4 — the same fixture-dependent specs fail in BOTH suites** (one cause, two witnesses),
  because both import the same resolver. If smoke's failures are disjoint from e2e's, the cause
  count goes up and P4 is wrong.

---

## 8 · Cause list, with sizing

| # | cause | era | genuine bug / test / env / bitrot | fix size | belongs in |
|---|---|---|---|---|---|
| 1 | `typecheck` + `Build (TEST env)` red | 1, 3 | env/bitrot | already resolved | closed |
| 2 | No test credentials existed before 12 Aug | 1–3 | environment | resolved 12 Aug | closed |
| 3 | Resolver and seed target different businesses | 4 | **test infrastructure** | medium — touches `seed.ts`, the resolver, and both fixtures together (§3b) | **its own sprint** |
| 4 | Neither fixture has a register; `…0001` also not onboarded and has no outlet | 4 | **test fixture data** | medium — DB fixture work, founder-approved DDL/DML | **its own sprint**, with #3 |
| 5 | Ask Aria latency on sparse-data businesses | 4 | possibly **product** | unknown | **own investigation** — see the stop-condition note below |
| 6 | Residual selector bitrot | 2–4 | test | small each | with #3 |

**Stop-condition check (SETUP-1):** nothing here is yet a confirmed product bug requiring a
mega-sprint. Cause 5 is the only candidate and is unconfirmed — the spec's in-code comment argues
it is real and launch-relevant. It is flagged, not diagnosed, and is explicitly out of scope for
SETUP-1. No fix in this sprint touches application code.

---

## 9 · What this means for RULE 12

`e2e-local` has never been green, and the two leading causes are shared test infrastructure and
fixture data that need reconciling together and proving over a run. That is not a small, clearly
safe fix.

RULE 12 currently asserts CI is the source of truth and that no sprint is done without a green
`e2e-local`. Applied literally, **no sprint since 10 July has been done** — which is not what has
been practised, so the rule as written does not describe reality. Phase 3 addresses that; the
recommendation from this document is **option (b): amend RULE 12 to state what actually enforces
today**, rather than arrange a green tick.

What genuinely enforces on every push right now, verified this sprint:

- **pre-push hook** — canon rail + `tsc` + unit tests (observed emitting
  `[pre-push] OK — canon-rail-guard clean, tsc 0 errors, unit tests green`)
- **Canon Rail Guard** in CI — green on every recent `main` push
- **E2E `typecheck` job** in CI — green
- **Smoke Suite** — runs as of SETUP-1 Phase 1; first results are new information

---

## 10 · APPENDED 2026-08-17 (Phase 3) — fixture state re-verified, and P2 amended

Appended, not merged into the sections above, so §7's predictions stay where they were written.
**The artifacts had still not arrived when this was added; Q1 and §6 remain NOT DETERMINED.**

### 10a · Full fixture state, MCP-verified

| | `…0101` Smoke Test Café | `…0001` Sip (E2E Test) |
|---|---|---|
| `onboarding_complete` | **true** | **false** |
| active products | 2 | 2 |
| outlets | 1 | 0 |
| **`pos_registers` rows** | **0** | **0** |
| **open cash sessions** | **1** | **0** |

The open session on `…0101` is `49b90021-3be1-4243-981b-269be1f6360f`, `status = 'open'`,
**`register_id` IS NULL**, `opened_at` **2026-08-01 03:36:19Z**, `closed_at` null — open for over
two weeks.

Two refinements to how this was framed when the append was requested, both from the query rather
than from inference:

1. **It is not a session pointing at a register that does not exist.** `register_id` is NULL, so
   there is no dangling reference to resolve — the session is register-less, which is a different
   (and quieter) inconsistency.
2. **It is not residue from the 26 Jul smoke repair.** It was opened **1 Aug**, five days later.
   The origin is unconfirmed; a locally-run `npm run test:smoke` that did not reach its cleanup is
   the most plausible candidate, since the CI smoke suite had never executed at all before
   `d5df27d2`. Recorded as unconfirmed rather than guessed at.

### 10b · P2 AMENDED — the branch I expected was wrong, and this says so before the artifacts land

**Original P2 (§7):** the POS ×3 cluster fails because `…0101` has 0 registers.

**That mechanism is wrong.** The terminal's gate does not read `pos_registers` at all:

```
terminal/page.tsx:598   fetch('/api/pos/sessions') -> setRegisterSession(d.openSession ?? null)
terminal/page.tsx:1945  const registerIsOpen = !!registerSession;
terminal/page.tsx:1948  if (!registerLoading && !registerIsOpen) -> "Register is closed" gate
```

The gate is satisfied by an **open cash session**. `register_id` is never consulted by it, and the
sale path keys off `session_id` (`:1572`), not `register_id`. Having 0 `pos_registers` rows
therefore does not block the terminal.

**P2, restated as two branches:**

- **Branch A — the gate is satisfied and the POS specs are NOT blocked by it.** The open session
  makes `registerIsOpen` true, the "Register is closed" screen never renders,
  `openRegisterIfNeeded` correctly finds no "Open register" button and skips (it is
  `.catch(() => false)`, so it cannot throw). Any remaining POS failure is for some other reason,
  and the specs may now **pass outright**.
- **Branch B — the null `register_id` breaks something downstream**, so the gate passes but the
  grid or the cart fails anyway.

**I expect Branch A**, and the sharper form of the prediction is this: the POS ×3 failures in the
27 Jul report **predate the session entirely** (opened 1 Aug). If Branch A holds, an orphaned
session left open by accident on 1 Aug has been silently *unblocking* the POS specs ever since.

**Which makes it fragile in a way worth naming.** The only thing satisfying the register gate in
CI is a session nobody manages and nothing recreates. `tests/smoke/owner-flows.spec.ts`'s POS sale
test is self-cleaning, and `/pos/close` exists — anything that closes `49b90021` re-breaks every
POS spec, with no seed step to reopen one. That is not a stable fixture; it is a fixture held up
by residue.

**This is a third gap**, on top of the outlet gap and the onboarding gap in §3b, and all three
point the same way on sizing.

### 10c · The fixture reconciliation is its own sprint — named here, deliberately not done

**No fixture is touched by SETUP-1.** The work below is a separate, later sprint because these
five items cannot be changed independently — fixing any one in isolation moves the failure rather
than removing it, which §3b already demonstrates for `TEST_BUSINESS_ID`:

1. **`e2e/helpers/seed.ts`** — seeds `…0001`, a business nothing resolves to.
2. **`resolveTestBusinessId`** — "newest business owned by this user" is why creating an unrelated
   fixture in SECURITY-P4 silently repointed the whole e2e suite. Non-deterministic by design.
3. **`TEST_BUSINESS_ID`** — unset in both CI jobs; setting it is necessary but not sufficient.
4. **The missing register** — 0 `pos_registers` rows on both fixtures.
5. **The orphaned open session** `49b90021` — currently load-bearing by accident (10b).

Plus the two state gaps from §3b: `…0001`'s `onboarding_complete = false` and its zero outlets.

**It cannot be verified in a single run.** Each change alters which business the suites resolve to
and what state that business is in, so the failure set moves between runs; a green result would
need several successive runs to distinguish a real fix from a reshuffle. Any DDL or fixture DML in
that sprint is founder-approved and applied via Supabase MCP under CLAUDE.md RULE 10a, then
verified live under RULE 10.
