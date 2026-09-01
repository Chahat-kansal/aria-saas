# ASK ARIA — WHAT IS ACTUALLY BROKEN

**S8 phase 4 · 30 Aug 2026.** Every entry below was checked against the live database, the live
GitHub Actions API, or the current file — never against a run log. Four things the run logs still
list as open turned out to be **already fixed**, and they are recorded at the bottom rather than
quietly dropped, because "reports understate what exists" is this repo's third failure pattern and
a register that inherits stale entries is worse than no register.

## THE HEADLINE

> **CI has not run a single check since 27 August.** All three workflows — Canon Rail Guard, E2E
> Tests, Smoke Suite — die at `npm ci` before any test executes, because `package.json` and
> `package-lock.json` are out of sync. **I caused it**, in `0ced26289` (POS-OFFLINE-1a, 27 Aug):
> a dependency line was swept into that commit without its lockfile. Every "failure" in the Actions
> tab since is that install step, not a real finding.
>
> **FIXED AND CONFIRMED, 30 Aug.** Phase 5 committed the missing lockfile entries; on the very next
> push **Canon Rail Guard went green — the first successful CI run since 27 August.** What the other
> two then reported is in the addendum, and it is new information rather than regression.

> ## UPDATED IN PLACE BY S9 · 31 Aug 2026
>
> **7 of the 12 are now closed.** What is left is 3 parked with the founder, 1 design decision,
> and 1 migration sprint. Every closure below carries its evidence; nothing is marked done on the
> strength of a commit message.
>
> **The one thing that needs you:** the CI test account's password. Both suites now click the right
> button and BOTH still fail to log in — and because phase 1 made the fixtures report the page's own
> error, we know exactly why: e2e says `Invalid login credentials`, smoke says `Too many attempts`.
> Your own untracked `scripts/set-smoke-test-password.ts` is the fix for the first.

> ## UPDATED IN PLACE BY S10 · 1 Sep 2026
>
> **The smoke suite finally ran.** 6 passed, 3 failed, behind a real session — assertions that had
> never once executed against a real page. Four consecutive infrastructure layers had blocked it
> (lockfile → selector → password → limiter store) and **none of them was Ask Aria**.
>
> **Then my own push cadence tripped the REAL limit.** With Upstash now reachable in CI, "Too many
> attempts" is a genuine count: 10 logins / 15 min per IP, against three pushes in thirty minutes
> running two suites each from shared runner IPs. Not a regression, not the old bug — the limiter
> working, on a caller that logs in more often than a human. See #14.
>
> **Two findings that outlive CI:** an Upstash outage locks every owner out of login
> ([S10-LIMITER-ANALYSIS.md](./S10-LIMITER-ANALYSIS.md)), and the alerting that exists watches cost
> while `cron_runs` has no watcher at all ([S10-FATAL-SWEEP.md](./S10-FATAL-SWEEP.md)).

**4 open · 6 parked (5 of them the founder's) · 13 closed or delisted.**

Recurring classes, counted across S1–S8:

| class | instances here | first found |
|---|---|---|
| **Exists, looks correct, does nothing** | 3 (#1, #3, #8) | S2B |
| **Silent failure / no way to notice** | 2 (#4, #7) | S4 |
| **Truncation at a token ceiling** | 1 (#4) | S4, again in S8 |
| **N copies drift** | 1 (#4, a second `safeParseJSON`) | S6 |
| **Parked on schema the founder must apply** | 1 (#5) | S1 |

---

## OPEN — RANKED

### 1 · ✅ CLOSED (S8 `b6d93385`) — every CI gate had been dead for three days
**What is wrong.** `package.json:61` declares `"@vercel/global-config": "^1.5.1"`. The committed
`package-lock.json` contains **zero** references to it. `npm ci` refuses to install a tree whose
lock file disagrees with its manifest, so every workflow fails at the install step.

**How it presents.** The Actions tab shows Canon Rail Guard, E2E Tests and Smoke Suite all red on
every push. It looks like three broken test suites. It is one broken install.

**Evidence.** Run `33232939168`: `npm error code EUSAGE … Missing: @vercel/global-config@1.5.1 from
lock file`. `git blame package.json:61` → `0ced26289`, 27 Aug. 7 successes in the last 60 runs, all
before that date.

**Class.** Exists, looks correct, does nothing — the most expensive instance yet, because it
silently disabled the canon rail, the e2e typecheck and the smoke suite at once.

**Severity 1 · FIXED** (`b6d93385`). `+29/-0`, adding exactly the two missing packages and changing
no existing version. Reproduced both directions before committing — `npm ci` exits 1 with the old
lockfile and 0 with the fix — and then confirmed by a green Canon Rail Guard run on the next push.

---

### 2 · ✅ DELISTED (S9 phase 0) — the credit outage is over
**Re-checked before doing anything else, as the sprint required.** Last credit-balance error
**2026-08-27 08:03:38 UTC** (18:03 Melbourne); **zero since**. 108 AI calls in that window with 9
failures, **none of them a credit error**. Resolved by the founder, not by code. It stays described
below because anyone reading `aria_ai_calls` history must still exclude 25 Jun – 27 Aug.

*(The sprint's brief said "24 calls since with 2 failures" — measured now it is 108 with 9. The
conclusion is the same; the numbers were stale.)*

### ~~2~~ · the outage, for the record · **RESOLVED**
**What is wrong.** 1,904 council advisor calls failed with
`400 invalid_request_error: Your credit balance is too low to access the Anthropic API`, between
**25 Jun and 26 Aug**. Not a code defect.

**How it presents.** The council silently loses all four advisors and falls back. The owner sees a
thinner answer with no indication why.

**Why it is in this register.** Because it poisons every other measurement. It is the reason a naive
query says "65% of advisor calls fail", and I nearly reported that as a code bug in phase 0 before
checking the error text. Anyone reading `aria_ai_calls` must exclude this window.

**Severity 2 · PARKED.** Money is the founder's. Nothing here to fix in code.

---

### 3 · HIGH — the accuracy verifier has run once in three months
**What is wrong.** `route.ts:2469` runs a factual-accuracy reviewer, gated on
`intent.complexity === 'complex' && routedModel !== 'haiku' && !isImageRequest && !degradedProvider
&& cleanResponse.length > 100`. But **the council path returns before ever reaching it**
(`route.ts` ~1370 `NextResponse.json`), and a complex question is exactly what goes to the council.
So the gate can only fire on a request that skipped the council *and* was routed to Sonnet *and* is
still marked complex.

**Evidence.** `aria_ai_calls`: `ask_aria_verifier` — **1 call, ever**, against 355 `ask_aria` calls
of which **111 went to Sonnet**. If the gate were reachable in the ordinary way, those 111 would
have produced far more than one.

**How it presents.** Invisibly. The non-council answer path has no accuracy review, while the code
reads as though it does.

**Class.** Exists, looks correct, does nothing.

**Severity 2 · STILL OPEN, DELIBERATELY.** The correct fix is a judgement about *where*
verification belongs — it may be right that the council's own GROUNDING-TEETH passes replace it —
and that is a design decision, not a repair. S9 re-confirmed the measurement and did not guess at
the answer.

---

### 4 · ✅ CLOSED (S8 `b6d93385` + S9 `9e56574c`) — both halves
**What is wrong.** `context-brain.ts:83` sets `maxOutputTokens: 1500` and parses the reply as JSON,
but never reads Gemini's `finishReason`. It is the same class S8 phase 1 fixed for the four
Anthropic advisors, in the one provider that phase could not reach — `stop_reason` does not exist
here, `finishReason: 'MAX_TOKENS'` does.

It also carries **a second, private `safeParseJSON`** (`context-brain.ts:17`) — a duplicate of
`council.ts:85`. Two definitions of "did this parse" is where N-copies drift starts.

**How it presents.** The context brain reports `failed: true`, indistinguishable from a network
error, and the council proceeds with three advisors instead of four.

**Severity 3 · CLOSED, in two commits.**
- *Truncation half* (`b6d93385`): `inspectGeminiTruncation` reads `candidates[0].finishReason`, in
  the same module as the Anthropic one. The `maxOutputTokens: 1500` budget is deliberately
  unchanged — no distribution justifies a number.
- *Duplicate parser half* (`9e56574c`, S9 phase 4): the two `safeParseJSON` implementations were
  **proven equivalent over a 20-case corpus before being merged**, not assumed. council's survived
  (the canonical engine's). A rail asserts neither file can grow one back.

**Sweep, reported not fixed:** `src/app/pos/ask/page.tsx` still carries its own `tolerantJSONParse`
and `parseAriaResponse` — a genuine third copy, on a different surface with a different segment
type. It wants its own sprint and its own verification, not a ride-along.

---

### 5 · MEDIUM — no feedback table, so no thumbs · **PARKED (DDL — founder's)**
**What is wrong.** `aria_message_feedback` does not exist. Confirmed against
`information_schema.tables`: **0 rows**. S1 phase 5 parked on exactly this and wrote the SQL.

**How it presents.** There is no way to tell Aria an answer was wrong, and no eval set is
accumulating.

**Severity 3 · PARKED.** The `create table` is in `RUN-S1.md`. RULE 10a: DDL is never mine.

---

### 6 · ✅ MOSTLY CLOSED (S9 `bd4d19ae`) — four migrated, two correctly parked
**What is wrong.** S5 migrated 1 of 6 and parked 5: approve/reject a proposed action, artifact
rendering, save-artifact-to-Files, artifact parse-failure reporting, scheduled reports. Verified
still true — `AriaArtifact` appears in `classic/page.tsx` and in no `ask-aria-ax` file.

**How it presents.** An owner on the default surface cannot approve an action or open an artifact.
`aria_task_outputs` has **26 real rows** and `aria_scheduled_reports` **1** — this is live data with
no route to it on the surface people are sent to.

**Severity 3 → CLOSED for the four that were migration work.** The register under-ranked this and
the sprint said so: it was the only entry an owner would feel.

| capability | outcome |
|---|---|
| artifact rendering | ✅ migrated — `AnswerMarkdown` splits segments and renders `AriaArtifact` |
| artifact parse-failure reporting | ✅ migrated — travels with the shared parser |
| save an artifact to Files | ✅ migrated — the *same* `SaveToFilesButton`, same props |
| scheduled reports | ✅ migrated — same route, same payload as `/classic` |
| **email a deliverable** | ⛔ **PARKED — sending.** A test asserts `deliverable-email` is absent from the room, so it cannot be migrated quietly later |
| **approve/reject** | ⛔ **PARKED — authorisation.** Stays on `/classic` |

**Verified against a real row, not a fixture:** the stored answer in conversation `2c98fef3`
(md5 `60951cdc725850d729fe737ba241855c`) parses to 2 segments, 0 failures, artifact
`type=action_card title="Tuesday Breakfast Bundle"`.

**What `/classic` now uniquely holds:** approve/reject (`ActionPreviewCard`) and emailing a
deliverable. Nothing else. It stays reachable, and retiring it is still blocked on those two.

---

### 7 · ✅ CLOSED (S9 phase 6) — 8 fixed, 9 left on purpose, 0 bulk-fixed
**MY OWN COUNT WAS WRONG.** This entry said "four sites across ax-context.ts, council.ts and
ask/route.ts". Re-counted: **17** silent `catch {` across those files — and **`ax-context.ts` had
none**. All seven of its catches were already `catch (e)` with a `console.error`. The S8 grep that
produced "four" matched three narrow literal patterns and missed the rest.

**Fixed (8) — where silence costs something.** Two classes only:
- *Owner data lost*: two `upsertConversation` failures in `ask/route.ts` (`:493`, `:1042`). A turn
  that fails to save vanishes and the returned `conversation_id` may point at nothing. S2B found
  live data loss in exactly this area.
- *Grounding lost invisibly*: the augmented council context, conversation history (pronouns stop
  resolving), the weekly-tracking block, `verifiedFiguresBlock` (the corpus the grounding checks
  measure against), anchor extraction (zero anchors makes every advisor figure get stripped), and
  the advisor-cleaning pass.

**Left (9) — the fallback IS the honest answer**, and each is named in the run log: two JSON-parse
helpers whose contract is to return null; a cache read that must degrade to a miss; an epoch probe
that already returns a distinguishable `'epoch-err'` sentinel; a context builder with a stated safe
fallback; an outcome-signals prefix that is optional by design; and the council-run logger, where
logging a logging failure invites recursion.

**Nothing changed behaviour.** Every one of the 8 is still non-fatal — the advisor-cleaning catch in
particular MUST never block the council, and does not. Only the silence changed.

---

### 8 · ✅ CLOSED (S9 `be3a735c`) — the column was UNPOPULATED, not dead
**What is wrong.** The health-monitor rows carry `recommendation`, `expected_impact` and `payload`
but an **empty `reason`**. The notice block added in S8 phase 3 renders whatever is present, so this
costs nothing today — but a column that is always blank is either dead or unpopulated, and it reads
as though the council is being given a "why" that it is not.

**It is not a dead column and there was nothing to drop.** 193 of 442 rows carry a reason, split by
**writer**: `signal_engine` 112/112 · `aria_intelligence:alert` 9/11 · `aria_router:ops_narrative`
70/213 · **`cron:aria-health-monitor` 0 of 78**, 27 of them still pending — and those 27 are exactly
what the Ask Aria surface renders and what S8 phase 3 now feeds to the council.

**No DDL was needed.** `upsertAriaAction` already declared and wrote `reason` on both its insert and
update paths; the caller simply never passed it. Fixed at the writer, with every value **measured**
(the check's own value and threshold) and a test forbidding invented currency or percentage
literals. **Forward-only** — the 78 existing rows are not backfilled.

---

### 9 · LOW — 59 pending actions and a 6-row render cap
**What is wrong.** Nothing, and this entry exists to say so precisely. `aria_actions` has **59**
pending rows; the surface renders 6 and reports the true total separately (`awaitingTotal` from a
`count`, not a `length`). That is S3's fix working. It is listed because "6 shown, 59 real" looks
like the count-vs-page-size bug and someone will re-report it.

**Severity 5 — not a bug.** Verified working.

---

## ADDENDUM — WHAT CI FOUND THE MOMENT IT COULD RUN (30 Aug, after the #1 fix)

The point of fixing #1 was to get the gates back. Within ten minutes of the push they reported
three things that had been invisible for three days. **Recorded, not fixed — these are new
information, not regressions**, exactly as CLAUDE.md's RULE 12 amendment says a first Smoke Suite
result must be treated.

**Canon Rail Guard: GREEN.** First successful CI run since 27 August. #1 is confirmed fixed by
observation, not by reasoning.

### 10 · ✅ CLOSED (S9 `a4022cce`) — the smoke suite's login selector matched three buttons
`getByRole('button', { name: /sign in|log in|continue/i })` → `strict mode violation: resolved to
3 elements`. A **test** defect, not a product one: the login page has three controls matching that
name. The suite cannot get past its own first step, so every assertion behind it is unproven.
**Severity 3 · CLOSED, confirmed by an observed run.** The three are the "Sign in" **tab**,
**Continue with Google**, and the real submit — and only the submit is inside `<form>`. Both
fixtures now use `form button[type="submit"]`. The strict-mode error is gone from CI.

⚠️ **Adding `.first()` would have been the wrong fix** — it takes DOM order, which is the tab. That
is precisely what #12 was already doing.

### 11 · ✅ CLOSED (S9 `912f2e61`) — and it was far worse than this entry said
`Dynamic server usage: … used request.headers` — three retries (hence three rows per build), each
written to `cron_runs` by `trackCron` as a **genuine failure**.

**THE REAL SCALE: 2,272 false failure rows against 90 real completions, 1 June – 29 August.** Every
one of the 2,272 carries that same error. This cron has read **96% failed** for three months, which
means a real failure has been indistinguishable from the noise the whole time.

**Fixed:** `export const dynamic = 'force-dynamic'` — which **72 of the 73 cron routes already
had**. nightly-sync was the only one out of step. A local build now emits zero such errors and marks
the route `ƒ` (dynamic). The 2,272 historical rows are **not** deleted: forward-only, and they are
the evidence for this finding.

### 12 · ✅ CLOSED (S10 · founder set the password, then S9/S10 cleared the rest)
**The credential half is fixed** — Chahat set `TEST_USER_PASSWORD`. Confirmed by observation:
`e2e-local`'s `page_error` changed from `Invalid login credentials` to `Too many attempts`, and the
31 Aug production run got past login entirely. **`typecheck` is now green and runs; `e2e-local`
executes rather than skipping.** The remaining login failure is a different thing — #13 then #14.

### ~~12~~ · the original diagnosis, for the record
**It shares one FACT with #10 — three buttons match the selector — but it is a different failure and
needed a different fix.** `e2e/helpers/global-setup.ts:89` was *already* form-scoped and correct.

S9 phase 1 made both fixtures report the page's own error text instead of a bare timeout, and one CI
run then answered it:

| suite | target | what the page said |
|---|---|---|
| E2E | `https://www.ariaos.site` (production) | **`Invalid login credentials`** |
| Smoke | `http://localhost:3000` | **`Too many attempts. Please wait before trying again.`** |

**The account is fine** — `smoke-test@ariaos.site` exists, email confirmed, owns 2 businesses — but
its **last successful sign-in was 12 August**. So the password in the CI secret does not
authenticate.

**PARKED: a credential is the founder's, and secret rotation is on CLAUDE.md's NEVER-unattended
list.** The remedy already exists in the repo, untracked:

1. `npx tsx scripts/set-smoke-test-password.ts smoke-test@ariaos.site` — prints a new password once.
2. Paste it into the GitHub secret `TEST_USER_PASSWORD`.

**On the rate limit:** `/api/auth/guard` allows `login: 10 requests / 15 min` per IP. The smoke
suite tripping it is real, but S9 pushed three times in forty minutes and each push runs two suites
from shared runner IPs — **my own cadence is a plausible contributor**, so this is NOT reported as a
settled defect. Fix the password first; the failing attempts stop consuming the budget, then
re-observe.

**`typecheck` and `e2e-local` remain SKIPPED, which the decision table rightly treats as failing** —
a skipped check and a passing one look identical in the Actions tab. They stay unverified.

⚠️ **CLAUDE.md's CI table is now wrong in both directions** — it calls `typecheck` green and
`e2e-local` the known-red job; today neither executes, and Canon Rail Guard (which it does not
mention as at risk) is the only one passing. **Not edited here: that file is the founder's.**

**None of these is fixed here.** They are test-harness and route-config defects, they arrived after
this sprint's last commit, and fixing a login fixture unattended — on the surface that gates every
other assertion — is the kind of change that wants a person watching it.

---

### 13 · ✅ CLOSED (S10 `6b41cc42`) — the CI web server never got the limiter's backing store
`next start` sets `NODE_ENV=production`, so `rate-limit.ts` takes its production branch, which
**fails closed** when Upstash is unreachable (SECURITY-P1 M-01, deliberate). Both variables are set
in Vercel; CI's server runs outside Vercel and nothing passed them in — so every limited route
returned 429 on its **first** call. "Too many attempts" was not a count; it was a limiter with
nowhere to count.

**Fixed** by passing both variables job-level to the two jobs that run their own server, and **not**
to the production job. **Verified by observation:** run `33496413779` shows zero `[rate-limit] FATAL`
lines, login succeeded, and the suite ran 6 passed / 3 failed. A rail keys off `BASE_URL` so the next
server-running job is covered automatically.

---

### 14 · ⛔ OPEN — 10 logins / 15 min is too tight for CI's cadence
**Not the same as #13, and worth keeping separate.** Run `33498410137` shows **zero FATAL and zero
"Redis unavailable"** — the limiter is connected and working correctly. The 429 is a **genuine
count**: `/api/auth/guard` allows 10 logins per 15 minutes per IP, and three pushes in thirty
minutes × two suites × one-to-two logins each, with retries, from shared GitHub runner egress IPs,
exceeds it.

**Two ways forward:**
- **Test-side, safe, not done here:** the smoke fixture logs in fresh every run. `e2e/helpers/`
  already has `restoreCachedSession`. Reusing a cached session cuts CI's login count without
  touching auth.
- **Product-side, PARKED:** raising the limit is authorisation and is the founder's call.

---

### 15 · ⛔ OPEN — an Upstash outage locks every owner out of their own business
The login guard runs *before* Supabase; a 429 there means `signInWithPassword` is never called
(`AuthScene.tsx:120-121`). When Redis is unreachable the guard 429s on the **first** call for **every**
caller — no owner, no staff, no admin can log in.

Fail-open/closed is **one global default** in `rate-limit.ts`, not per route as assumed, and there is
a **third** behaviour nobody had named: Redis configured but unreachable at call time **throws**, and
the route 500s (`rate-limit.ts:64`, unwrapped) — which on login *also* shows "Too many attempts".

Also found: `instore-chat` keys on **business_id only** (60/hour for the whole venue) and
`with-rate-limit.ts` trusts a **client-supplied** `x-user-id`.

**PARKED — authorisation.** Full route table, key composition and recommendation in
[S10-LIMITER-ANALYSIS.md](./S10-LIMITER-ANALYSIS.md).

---

### 16 · ⛔ OPEN — `cron_runs` has no watcher, and the FATAL has no consumer
`MONITOR-1` alerting **exists, is scheduled and runs** — but it watches **cost** (budget, renewals,
quota). `aria-health-monitor` calls `sendAlert` six times and **not once for its own red checks**;
27 are pending. Nothing reads `cron_runs` looking for failures, which is why nightly-sync buried
2,272 false failures for three months. The `[rate-limit] FATAL` is a `console.error` and nothing
more.

**And there is no evidence trail that alerting has ever worked** — `alert.ts` writes nothing to the
database and no-ops silently when `ALERT_WEBHOOK` is unset. **Confirm that variable is set.**

**Reported, not built** — the escalation path is Resend, a sending path, which is parked. Sweep in
[S10-FATAL-SWEEP.md](./S10-FATAL-SWEEP.md).

---

### 17 · ⛔ OPEN — POS product grid does not render for the smoke suite
`owner-flows.spec.ts:104` — `.pos-product-grid` not visible. **Checked before classifying:** that
class *is* on a real element (`terminal/page.tsx:3093`), so the selector is valid and the grid
genuinely did not render. Likeliest cause is the "Continue as owner" bypass not taking, leaving
POSShell on its PIN screen — **but that is inference**, and settling it needs the failure screenshot.
Recorded rather than fixed on a hunch.

---

## DELISTED — the run logs still call these open; the database and CI say otherwise

| item | run log says | actually |
|---|---|---|
| `pinned_at` / `deleted_at` on `aria_conversations` | S2 parked on DDL | **Live.** Both columns exist and are used by `ask/delete/route.ts` and `ask/history/route.ts`. Shipped in S2B. |
| `search_tsv` + GIN index | S2 parked on DDL | **Live.** Column exists; `ask/search/route.ts` queries it. |
| Smoke Suite "has never executed, PR-only trigger" | CLAUDE.md, RULE 13 | **Fixed** in SETUP-1 — it triggers on push and does run. It is red only because of #1. |
| Canon Rail Guard "green on every recent push" | CLAUDE.md, 17 Aug | **No longer true** — red since 27 Aug, and again only because of #1. |

**CLAUDE.md's live-CI table is now out of date in both directions.** It is not edited here: that
file is the founder's standing rules, and a run-log correction is the right place to say so.

---

## HOW THIS WAS CHECKED

Live SQL against `aria_ai_calls`, `aria_actions`, `aria_task_outputs`, `aria_scheduled_reports`,
`information_schema`; the GitHub Actions API via `gh run view --log-failed`; and `git blame` on the
line that caused #1. **No entry here is inferred from a document.** Where a claim rests on reasoning
rather than measurement — #3's "the council returns first" — it is labelled as such and the
measurement that supports it is quoted beside it.

Four candidate findings were dropped during the sweep because checking them showed they were
already fixed. That ratio matters: the sprint warned that recent screenshot-derived findings ran
about one in five correct, and the four delisted rows above are what that warning looks like when
the check is actually done.
