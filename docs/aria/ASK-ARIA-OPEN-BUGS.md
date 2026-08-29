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

**9 open · 4 parked (3 of them the founder's) · 4 already fixed and delisted.**

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

### 1 · CRITICAL — every CI gate has been dead for three days
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

**Severity 1.** Fixed in phase 5. The repair is already sitting in the working tree: the local
`package-lock.json` is modified, `+29/-0`, adding exactly the two missing packages and changing no
existing version.

---

### 2 · HIGH — the Anthropic account ran out of credit for two months · **PARKED (money)**
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

**Severity 2.** Not fixed here — the correct fix is a judgement about *where* verification belongs
(it may be right that the council's own GROUNDING-TEETH passes replace it), and that is a design
decision, not a repair. **Named, not guessed at.**

---

### 4 · MEDIUM — the Gemini context brain cannot notice its own truncation
**What is wrong.** `context-brain.ts:83` sets `maxOutputTokens: 1500` and parses the reply as JSON,
but never reads Gemini's `finishReason`. It is the same class S8 phase 1 fixed for the four
Anthropic advisors, in the one provider that phase could not reach — `stop_reason` does not exist
here, `finishReason: 'MAX_TOKENS'` does.

It also carries **a second, private `safeParseJSON`** (`context-brain.ts:17`) — a duplicate of
`council.ts:85`. Two definitions of "did this parse" is where N-copies drift starts.

**How it presents.** The context brain reports `failed: true`, indistinguishable from a network
error, and the council proceeds with three advisors instead of four.

**Severity 3.** Fixed in phase 5 if there is room; the detection half is small.

---

### 5 · MEDIUM — no feedback table, so no thumbs · **PARKED (DDL — founder's)**
**What is wrong.** `aria_message_feedback` does not exist. Confirmed against
`information_schema.tables`: **0 rows**. S1 phase 5 parked on exactly this and wrote the SQL.

**How it presents.** There is no way to tell Aria an answer was wrong, and no eval set is
accumulating.

**Severity 3 · PARKED.** The `create table` is in `RUN-S1.md`. RULE 10a: DDL is never mine.

---

### 6 · MEDIUM — five capabilities exist only on `/dashboard/ask-aria/classic`
**What is wrong.** S5 migrated 1 of 6 and parked 5: approve/reject a proposed action, artifact
rendering, save-artifact-to-Files, artifact parse-failure reporting, scheduled reports. Verified
still true — `AriaArtifact` appears in `classic/page.tsx` and in no `ask-aria-ax` file.

**How it presents.** An owner on the default surface cannot approve an action or open an artifact.
`aria_task_outputs` has **26 real rows** and `aria_scheduled_reports` **1** — this is live data with
no route to it on the surface people are sent to.

**Severity 3 · PARTIALLY PARKED.** Approve/reject is the authorisation path and stays parked. The
four artifact/report capabilities are migration work, not decisions — a sprint of their own.

---

### 7 · LOW — four swallowed errors remain in the Ask Aria path
**What is wrong.** Four `catch {}` / `catch { return … }` sites across `ax-context.ts`,
`council.ts` and `ask/route.ts` that discard the reason. Several are deliberate and correct (the
advisor-cleaning pass explicitly must never block the council), which is why this is LOW and not a
sweep: each needs reading before touching, and a blanket fix would be worse than the problem.

**Severity 4.** Listed so the count is honest, not because it should be bulk-fixed.

---

### 8 · LOW — `aria_actions.reason` is empty on the rows the surface shows
**What is wrong.** The health-monitor rows carry `recommendation`, `expected_impact` and `payload`
but an **empty `reason`**. The notice block added in S8 phase 3 renders whatever is present, so this
costs nothing today — but a column that is always blank is either dead or unpopulated, and it reads
as though the council is being given a "why" that it is not.

**Severity 4.** Named, not fixed — deciding whether to populate or drop it is a schema judgement.

---

### 9 · LOW — 59 pending actions and a 6-row render cap
**What is wrong.** Nothing, and this entry exists to say so precisely. `aria_actions` has **59**
pending rows; the surface renders 6 and reports the true total separately (`awaitingTotal` from a
`count`, not a `length`). That is S3's fix working. It is listed because "6 shown, 59 real" looks
like the count-vs-page-size bug and someone will re-report it.

**Severity 5 — not a bug.** Verified working.

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
