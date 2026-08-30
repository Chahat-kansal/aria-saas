# RUN-S9 — CLEAR THE REGISTER

**Autonomous run, 31 Aug 2026.** Seven phases, eight commits (phase 1 needed a second, and why is
below). No new features.

---

## THE SUMMARY, FOR SOMEONE WHO HAS BEEN AWAY ALL DAY

**7 of the 12 register entries are closed. 5 remain: 3 are yours, 1 is a design decision, 1 is a
sprint of its own.**

### The one thing that needs you

**The CI test account's password does not work.** Both suites now click the right button and both
still fail to log in — and because phase 1 made the fixtures print the page's own error instead of a
bare timeout, one CI run told us exactly why:

| suite | target | what the page said |
|---|---|---|
| E2E | production | **`Invalid login credentials`** |
| Smoke | localhost | **`Too many attempts. Please wait before trying again.`** |

`smoke-test@ariaos.site` is fine — confirmed, owns 2 businesses — but its **last successful sign-in
was 12 August**. Two commands fix it, and the script is already in your tree:

```
npx tsx scripts/set-smoke-test-password.ts smoke-test@ariaos.site   # prints a password once
# paste it into the GitHub secret TEST_USER_PASSWORD
```

A credential is on the NEVER-unattended list, so I did not touch it.

### What CI reports now that it runs

| workflow | state | why |
|---|---|---|
| **Canon Rail Guard** | ✅ **green** | S8's lockfile fix; still green through all of S9 |
| **Smoke Suite** | ❌ red at login | rate limit — see the caveat below |
| **E2E `test`** | ❌ red at login | wrong password |
| **E2E `typecheck`** | ⚠️ **skipped** | depends on `test`. The decision table is right that this is *failing*, not passing — a skipped check and a green one look identical in the Actions tab |
| **E2E `e2e-local`** | ⚠️ **skipped** | same |

**The rate limit caveat, because it would be easy to over-report.** `/api/auth/guard` allows
`login: 10 / 15 min` per IP. The smoke suite tripping it is real — but S9 pushed three times in
forty minutes, each push runs two suites, and they share runner IPs. **My own cadence is a plausible
contributor**, so I am not reporting the limit as a settled defect. Fix the password first; the
failing attempts stop burning the budget, then re-observe.

⚠️ **CLAUDE.md's CI table is wrong in both directions now** — it calls `typecheck` green and
`e2e-local` the known-red job; today neither executes, and Canon Rail Guard is the only one passing.
**Not edited: that file is yours.**

### The other numbers you asked for

- **The false-failure row count: 2,272.** `nightly-sync` wrote a `cron_runs` failure row on every
  build from 1 June to 29 August — against **90** genuine completions. That cron has read **96%
  failed** for three months, so a real failure would have been invisible in it. One line fixed it,
  and **72 of the 73 cron routes already had that line**.
- **What `/classic` still uniquely holds: two things.** Approve/reject (authorisation) and emailing
  a deliverable (sending). Both parked, both correctly. Everything else migrated.
- **New findings from the working gates:** none beyond the login diagnosis. The gates that run are
  green; the ones that do not run are blocked on the password, not on new defects.

---

## PHASE 0 — THE GATE · `914ee1c4`

Re-checked every item before touching it, because S8's register delisted four entries that run logs
still called open. **Four corrections, two of them to my own work.**

1. **#2 credit is resolved — delisted.** Last error 27 Aug 08:03 UTC, zero since. *(The brief said
   "24 calls since with 2 failures"; measured now, 108 calls with 9 failures, none a credit error.)*
2. **#11 was far worse than recorded** — 2,272 false rows, not "one per build" as a recent nuisance.
3. **#8 is not a dead column.** `reason` is populated 193/442, split by **writer**: `signal_engine`
   112/112, `cron:aria-health-monitor` **0 of 78**. A writer gap, not a schema question.
4. **#10 and #12 are not one root cause**, though the paste reasonably guessed they were.

**And a measurement error in the gate itself, caught before committing.** My first version counted
the three matching login buttons by regexing the source for their labels and found two — because the
submit button's label is `{ctaLabel}`, a *variable*. Playwright sees three; a source scan can only
ever see two. A second one: the cron assertion originally stated the *invariant*, which would have
committed a red test — phase 0 asserts the **premise**, phase 2 flips it to the invariant.

---

## PHASE 1 — THE LOGIN FIXTURES · `a4022cce`, then `cebc8081`

**Two commits, because the first over-claimed and an observed CI run corrected it.**

`/login` renders three controls matching `/sign in|log in|continue/i`: the **tab**, **Continue with
Google**, and the real submit. Only the submit is inside `<form>`.

| | |
|---|---|
| **#10 smoke** | had **no** `.first()` → strict-mode error before clicking anything. **FIXED — confirmed by CI**, the error is gone |
| **#12 e2e** | *had* `.first()`, which takes DOM order — **the tab**, a `type="button"` that navigates nowhere. So the click succeeded, nothing happened, and `waitForURL` burned its full timeout |

**Adding `.first()` to the smoke fixture would have converted #10 into #12** — a green-looking click
on the wrong control. Both now use `form button[type="submit"]`.

**Where I was wrong.** I claimed `.first()` in `tests/e2e/fixtures/auth.ts` was #12's cause. It is a
real latent bug and the fix stands, but CI was failing in `e2e/helpers/global-setup.ts:89` — a file
I read, judged already-correct, and left alone. **It *is* already correct.** Right reading, wrong
conclusion: the selector was never the problem there.

So the second commit fixed the thing I actually could: **both fixtures now read the page's own
`.errbox` on a navigation timeout** and throw with that text and the current URL. That single change
produced the two-line diagnosis at the top of this log, in one run.

**Sibling sweep — 3 other login selectors, 0 further changes.** `e2e/helpers/auth.ts:28` was already
form-scoped, and *its comment already explains this exact ambiguity*. The correct pattern existed in
this repo and its sibling never got it — failure pattern #2. Left alone: it works, and changing
working code for symmetry is the tidying RULE 0 warns about.

---

## PHASE 2 — THE CRON FALSE FAILURE · `912f2e61`

**2,272 false rows vs 90 real completions, 1 June – 29 August.** Next rendered the route at build
time, `verifyCronAuth` read `request.headers`, `withRetry` tried three times (three rows per build)
and `trackCron` wrote each as a genuine failure.

**Confirmed the fix was right before applying it**, as the sprint asked: 72 of 73 cron routes
already carry `export const dynamic = 'force-dynamic'`. This was the one route out of step.

**And I nearly mis-read my own verification.** I timestamped a build, ran it, queried for rows in the
window — and found **three**. First reading: "the fix failed." It had not. My build log contains
**zero** dynamic-server errors and the route now prints as `ƒ`. Those three rows came from **CI**
running the smoke suite's webServer at the same moment, on a commit without the fix — confirmed in
that run's log at 15:08:39. The naive query conflated two simultaneous builds.

**The 2,272 rows are not deleted.** Forward-only: they are the evidence for this finding.

---

## PHASE 3 — ARTIFACTS AND REPORTS OFF `/classic` · `bd4d19ae`

The only entry an owner would notice. Since S5 every navigation entry point sends owners to
`/dashboard/ask-aria`, and an answer containing `<aria_artifact …>` printed its raw tag and JSON
there. The capability was not missing — it was on the page nobody is routed to.

**Four migrated, two parked** (table in the register). **Email is parked as sending, and a test
asserts `deliverable-email` is absent from the room** so it cannot be migrated quietly later.
Approve/reject stays on `/classic`.

**One parser, not a third copy.** `parseAriaResponse` lived in `/classic` and near-identically in
`/pos/ask`; adding it to the AX surface would have made three. It moved to
`@/lib/aria/artifact-segments`, and `/classic` now calls that.

**Two deliberate improvements, both stated:** the parser is now **pure** (it POSTed parse failures
from inside itself, during render, so re-renders resent them), and **artifacts are not split while
streaming** — a half-arrived tag has no closing tag, so its partial JSON would flash as prose before
becoming a chart.

**Verified against a real row.** Parsed the stored answer in conversation `2c98fef3`
(md5 `60951cdc725850d729fe737ba241855c`, confirmed against the database): 2 segments, 0 failures,
`type=action_card`, `title="Tuesday Breakfast Bundle"`, `action.label="Activate Tuesday Bundle"`.

---

## PHASE 4 — THE DUPLICATE PARSER · `9e56574c`

The two `safeParseJSON` implementations differed in whether the code-fence regexes also ate a
newline. **I did not assume that was immaterial** — the test carries both originals verbatim and
runs them over a 20-case corpus of real model tics, asserting they agree on every one. Only then the
merge. **Council's survived** (the canonical engine's).

The anti-vacuity assertion is the one that matters: a corpus of only-nulls would make both loops
pass while proving nothing, so it also asserts ≥5 parses and ≥4 refusals.

**Sweep: `/pos/ask` still carries its own pair.** A genuine third copy — reported, not fixed, per
the sprint. Different surface, different segment type, wants its own verification.

**A superseded test that would have gone quietly vacuous.** S8's ceiling rail sliced the strictness
check out of `council.ts` **by string offset**. With the function moved, that slice would have
returned nothing and the test would have passed while examining an empty string — exactly the
failure that file exists to prevent. It now follows the function and asserts the slice is non-empty.

---

## PHASE 5 — THE EMPTY `reason` · `be3a735c`

**Unpopulated, not dead**, and no DDL was needed: `upsertAriaAction` already declared and wrote
`reason` on both paths. The health-monitor caller simply never passed it.

The convention was **read off the populated rows**, not invented: `reason` = the evidence,
`recommendation` = the action. Every value is **measured** (the check's own value and threshold), a
test forbids invented currency or percentage literals, and an unknown check gets the measured
sentence and nothing else. That matters more than usual because S8 phase 3 now feeds this record to
the council — a fabricated reason would become a fabricated answer. **Forward-only**: the 78
existing rows are not backfilled.

**A third measurement error of mine, caught by its own floor.** The rail's case scan used
`/case '([a-z_]+)':/` and silently found 4 checks instead of 5 — `briefing_table_writes_24h` has
digits in it. The anti-vacuity floor (`>= 5`) is the only reason that surfaced.

---

## PHASE 6 — THE SWALLOWED CATCHES · `7bc7b174`

**My own count was wrong and the register inherited it.** #7 said four sites; there are **17** — and
**`ax-context.ts` had none**, all seven of its catches already log. The S8 grep matched three narrow
literal patterns.

**8 fixed, 9 left, 0 bulk-fixed.** The rule, stated so it can be argued with: fix where silence
loses **owner data** or degrades the **answer's grounding**; leave where the fallback *is* the
honest answer. Both lists are itemised in the register.

The advisor-cleaning catch is the interesting one: the register is right that it must never block
the council, and it still does not — but a catch that must not block can still speak. If it throws,
ungrounded advisor numbers reach synthesis uncleaned, which is exactly what GROUNDING-TEETH-V2
exists to prevent.

**No behaviour changed anywhere.** Every edit is `catch {` → `catch (e)` plus a `console.error`.

---

## WHAT REMAINS

| item | why it is still open |
|---|---|
| **#12 login credential** | **Yours.** Two commands, above. |
| **#5 feedback table** | **Yours.** DDL. SQL is in `RUN-S1.md`. |
| **#6 approve/reject · email** | **Parked** — authorisation and sending. `/classic` holds them. |
| **#3 verifier placement** | A design decision about *where* verification belongs, not a repair. |
| **`/pos/ask` parser copy** | A real third copy; wants its own sprint. |

## GATES

`tsc` 0 · `vitest` **1233/1233 across 97 files** · `next build` **BUILD_EXIT=0 read from the log**,
never the wrapper · pre-push hook green on every push · Canon Rail Guard green in CI.

**Not verified against the live deployment:** I cannot authenticate. Every fix is proven at the unit
level, against a real database row, or by reproducing the failure locally — and where a claim rests
on reasoning rather than measurement, it says so.
