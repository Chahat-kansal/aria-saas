# RUN-S8 — FIX THE BUGS

**Autonomous run, 30 Aug 2026.** Six phases, six commits. No new features.

---

## THE SUMMARY, FOR SOMEONE WHO HAS BEEN AWAY ALL DAY

### The three things you most need to know

**1. Your CI has not run a single check since 27 August, and I caused it.** All three workflows —
Canon Rail Guard, E2E Tests, Smoke Suite — die at `npm ci` before any test executes, because
`package.json` declares `@vercel/global-config` and the committed lockfile does not contain it.
`git blame` puts that line in `0ced26289` (POS-OFFLINE-1a, my commit): a dependency change swept in
without its lockfile — exactly the `git add -A` hazard CLAUDE.md warns about. **Fixed in phase 5**,
and reproduced both ways locally: `npm ci` exits 1 with the committed lockfile and 0 with the fix.

**2. The council was losing advisors and nobody could tell — not the model, not you.** The 1,200
ceiling was clipping the advisors' output distribution (p90 at 1160, 8% pinned exactly at the cap),
and a lost advisor arrived at synthesis as `Observations:` followed by nothing — which reads as
"examined, found nothing", not "this advisor was lost". Both fixed. A lost advisor now says so, in
the prompt and to you.

**3. Finding 2 was right, and the fix reaches two more places than the sprint knew about.** The
notice's `id` was already a real `aria_actions` UUID and was already on screen as the React key; the
click sent only `Tell me about "<title>"`. The sweep found **three** deep links doing this, not one.

### The numbers you asked for

| token ceiling | was | now | why |
|---|---|---|---|
| council advisors (all four) | **1,200** | **4,000** | p90 1160, p99 1200, 8% pinned at the cap — a clipped distribution |
| council synthesis | 6,000 | **6,000, unchanged** | 258 calls, max output 1,613. No evidence it is tight, so it does not move |
| Gemini context brain | 1,500 | **1,500, unchanged** | no distribution to justify a change; **detection** added instead |
| ask route / verifier / degraded | 2,000–4,096 / 150 / 1,200 | unchanged | shapes match; the verifier writes "OK" |

**Cost of the one change (RULE 11):** advisor `outputTokensPerCall` 763–848 → 950 (measured 896 plus
headroom). AI **$0.4447 → $0.4508/biz/day = +$0.0061/business/day**. `max_tokens` is a cap, not a
reservation — the 92% of calls that never approach it cost exactly what they did.

**How a lost advisor now surfaces — four places, none of them silent:**
1. In the synthesis prompt: `RISK BRAIN: NOT AVAILABLE for this question — it ran out of room before
   it finished writing.` Never a blank `Observations:` line.
2. A rule telling the model that silence is not a finding.
3. `advisors_lost` on the API response, always an array.
4. To you, under the answer: *"2 of Aria's four advisors didn't report back on this one, so this
   answer is narrower than usual."* — narrower, never "wrong".

**What the notice link passes now:** `{ id, source }` — an identity, never text. The route re-reads
the row itself, **scoped to your business**, and hands the council the record: category, the cron
that raised it, the recommendation, the expected impact, the evidence payload.

**Open bugs: 9 open · 4 parked · 4 delisted as already fixed.** Recurring classes: *exists, looks
correct, does nothing* (3), *silent failure* (2), *truncation at a ceiling* (1), *N copies drift* (1).

### What remains

- **PARKED, yours:** the Anthropic credit-balance outage (1,904 failed calls, 25 Jun–26 Aug) · the
  `aria_message_feedback` table (SQL is in `RUN-S1.md`) · approve/reject on the new surface.
- **Named, not guessed at:** the accuracy verifier has run **once in three months** because the
  council path returns before reaching its gate. Deciding where verification belongs is a design
  call, not a repair.
- **A sprint of its own:** four artifact/report capabilities still only on `/classic`, over 26 real
  `aria_task_outputs` rows.

---

## PHASE 0 — THE GATE · `a9dcf201`

| | |
|---|---|
| files | `src/lib/aria/s8-gate.test.ts` (new, +80) |
| sweep | every file importing `AskBlock`; `BODY_FIELDS` counted at 17 |
| mutation | replace `<AskAriaTransition />` with a div → **red** |
| gates | tsc 0 · vitest green · `next build` BUILD_EXIT=0 |

The swap is live and `/classic` is still reachable. `BODY_FIELDS` is 17/17, and each entry is
verified to actually **judge** an empty body rather than merely be listed. Anti-vacuity: the gate
fails if `BODY_FIELDS` grows past the 17 it names.

**The preflight corrected the sprint's own numbers four times**, and the third correction is to my
own first reading:

1. **Three advisors hit 1,200 on the cited turn, not four.** The turn is in `aria_ai_calls`
   (2026-08-30 01:53:33 Melbourne): strategy 1118 ok · growth 1200 ok · context 1200 FAILED · risk
   1200 FAILED · synthesis input 11,485 output 556. "Exactly, all four" is one out.
2. **Hitting the ceiling does not always destroy the structure**, and the fix depends on it — see
   phase 1.
3. **I nearly reported a 65% advisor failure rate as a code bug.** It is a billing outage: 1,904 of
   ~1,920 exceptions are `credit balance is too low`. Checking my own query before raising the alarm
   is failure pattern #5, and it fired here.
4. **The synthesis ceiling is fine** — 258 calls, max 1,613 against 6,000.

---

## PHASE 1 — THE TOKEN CEILINGS · `5744cfdb`

| | |
|---|---|
| files | `truncation.ts` (new), `token-ceiling-rail.test.ts` (new), `council.ts`, `ai-cost-model.json` |
| sweep | every `max_tokens`/`maxTokens` in the Ask Aria path — 6 sites; 1 changed, 5 justified as-is |
| mutation | restore `max_tokens: 1200` → **2 red** · remove a `stop_reason` check → **red** |
| gates | tsc 0 · vitest 1176/1176 |

**Measured, not inferred.** 1,016 real advisor calls (billing-outage rows excluded): avg 896, p50
878, p90 1160, p99 1200, max 1200, **8% pinned exactly at the cap**. A p90 at 97% of the ceiling is
not a distribution, it is a wall.

**The part that changed the fix.** `safeParseJSON` slices first `{` to **last** `}`, so an advisor
that finished its object and then rambled to the cap still parses. Across all history **81 calls hit
the ceiling and only 12 failed**. Treating `stop_reason === 'max_tokens'` as automatic failure would
have discarded 69 working advisors — a downgrade. So the classification is the pair:

| hit ceiling | parsed | outcome |
|---|---|---|
| yes | yes | `ok_at_ceiling` — not a failure; the budget is tight |
| yes | no | `truncated_mid_structure` — the reported bug, now named |
| no | no | `unparseable` — do not blame the budget |

**One definition, not six.** `stop_reason` was read in exactly two places in this codebase and
neither checked for `'max_tokens'` — no model call in the product could notice its own truncation.

**The rail asserts the property, not the instance:** every `messages.create` in `council.ts` must
inspect its own `stop_reason`, so a fifth advisor added without it fails. Anti-vacuity: the scan must
find ≥2 call sites or the test fails as broken.

**Not verified live.** I cannot run a council turn from here. After deploy, the confirming query is:
`aria_ai_calls where agent_key='council_ceiling'` should stay empty, and advisor `output_tokens`
should stop pinning at a single value.

---

## PHASE 2 — THE COUNCIL MUST KNOW WHAT IT LOST · `4e8d64e4`

| | |
|---|---|
| files | `council-advisors.ts` (new), its test (new), `council.ts`, `ask/route.ts`, `AskAriaTransition.tsx` |
| sweep | all four advisor renders; the owner-facing sentence found written **twice** |
| mutation | restore RISK's unconditional block → **red** |
| gates | tsc 0 · vitest 1187/1187 |

**Observed, not asserted** — the actual before/after:

```
BEFORE (what the model received)          AFTER (what it receives now)
RISK BRAIN (confidence: low):             RISK BRAIN: NOT AVAILABLE for this question —
Observations:                             it ran out of room before it finished writing.
Recommendations:
```

Two blank fields under a confident heading. That does not say "the risk advisor was lost", it says
"the risk advisor looked and found nothing" — **the empty-chrome class S6 and S7 fixed in the
renderers, one layer up**, where the reader is a language model.

**`meta.brains_failed` had always counted them.** That is why this was invisible: the count was real
and went to the `council_runs` table and the agents dashboard. It never reached the synthesis prompt
and never reached the owner. The count was not missing — the **destination** was.

**Degrade honestly, and why** (decided from the code, as the sprint asked): retry doubles the worst
case behind an 18s timeout and re-truncates at the same ceiling that phase 1 just fixed; failing
would discard three good advisors to punish one lost one; degrading keeps the answer and removes the
only thing actually wrong.

Extracted to a module because it began as a closure where nothing could test it — and the
owner-facing sentence had already been written twice, which is N-copies drift starting.

---

## PHASE 3 — THE NOTICE DEEP LINK · `68289cbb`

| | |
|---|---|
| files | `notice-context.ts` (new), its test (new), `ax-context-types.ts`, `ax-context.ts`, `ask/route.ts`, `AskAriaTransition.tsx`, `AwaitingRoom.tsx`, `MadeForYouRoom.tsx` |
| sweep | **3 deep links found, not 1** |
| mutation | drop the reference → the turn is back to a bare title · title-matching asserted ambiguous |
| gates | tsc 0 · vitest 1201/1201 |

**Finding 2 was right.** `ax-context.ts:111` builds `Tell me about "<title>"`; the handler sent
`ask(n.prompt)`. The `id` was already the real UUID and already on the same line as the React key.

**What the row held while Aria asked "what system or service is it related to?":**

```
category         system_health
source           cron:aria-health-monitor
recommendation   "Check the generate-briefings cron. If 0 rows in 24h, the pipeline is stalled…"
expected_impact  data integrity
payload          {"value": 0, "details": {…}}
```

**Why not match on the title — and this is not hypothetical.** THREE production rows carry that
exact title, one each for Smoke Test Café, Global Liquor and Sip. Title-matching would be ambiguous
*across businesses*.

The client sends an id, never content. The route re-reads the row and scopes it with
`.eq('id', …).eq('business_id', bid)` — which, given three same-titled rows, is the whole security
story. `id` must be a UUID and `source` one of two literals, so neither can smuggle a table name.

**A mis-wire I caught:** the rooms were handed `ask` directly, so a reference passed as the second
argument would have landed in `ask()`'s `branch` slot — and it **typechecks**, because both are
optional objects. They now get an explicit adapter, and a test forbids `onPrompt={ask}`.

---

## PHASE 4 — THE OPEN-BUG REGISTER · `90a1de47`

`docs/aria/ASK-ARIA-OPEN-BUGS.md`. **9 open · 4 parked · 4 delisted.** Every entry checked against
the live database, the GitHub Actions API, or the current file — never against a run log.

**Four entries were delisted because checking showed they were already fixed:** S2's `pinned_at`,
`deleted_at` and `search_tsv` are all live and wired (that DDL landed in S2B), and the Smoke Suite's
PR-only trigger was fixed in SETUP-1. The sprint warned that recent screenshot-derived findings ran
about one in five correct; those four rows are what that warning looks like when the check is done.

**CLAUDE.md's live-CI table is now out of date in both directions** — Smoke Suite does run, and
Canon Rail Guard is no longer green. That file is not edited here; it is your standing rules, and a
run log is the right place to report against it.

---

## PHASE 5 — FIX WHAT PHASE 4 RANKED · `b6d93385`

| | |
|---|---|
| files | `package-lock.json` (+29/−0), `truncation.ts`, `context-brain.ts`, `token-ceiling-rail.test.ts` |
| mutation | `npm ci` with the committed lockfile → **exit 1**, the exact CI error; with the fix → **exit 0** |
| gates | tsc 0 · vitest 1202/1202 · `next build` BUILD_EXIT=0 |

**#1 CRITICAL — CI restored.** The lockfile fix was already sitting unstaged in the working tree,
`+29/−0`, adding exactly the two missing packages and changing no existing version. Reproduced both
directions locally rather than hoping.

**#4 — the Gemini context brain can now notice its own ceiling.** `maxOutputTokens: 1500` with the
reply parsed as JSON and `finishReason` never read: the same class as phase 1 in the one provider
phase 1 could not reach. `inspectGeminiTruncation` lives in the **same module** — a second
definition of "truncated" is how N-copies drift starts, and that file already carries a second
private `safeParseJSON`. Its budget is **not** changed: there is no distribution to justify one.

**Not fixed, and why:** #2 and #5 are yours (money, DDL). #3 needs a design decision about where
verification belongs. #6 is a migration sprint. #7 is four `catch` sites several of which are
deliberately correct — a blanket fix would be worse than the problem. #8 is a schema judgement.

**A mess I made and cleaned up:** `npm ci --dry-run` is **not read-only** in this npm version — it
deleted `node_modules` before failing, and the reinstall then hit a Windows-only postinstall
(`mkdir -p` through cmd.exe in `@huggingface/transformers`). Recovered with
`npm ci --ignore-scripts` plus `node scripts/setup-git-hooks.js`. **Neither affects CI**, which runs
Linux — but if you ever run `npm ci` on this machine, expect the postinstall to fail.

---

## HONEST LIMITS

- **Nothing here was verified against the live deployment.** I have no authenticated session. Every
  fix is proven at the unit level, by rendered output quoted above, or by reproducing the failure
  locally. The three checks worth doing after deploy are listed per phase.
- **The build was run at phase 0, phase 3 and phase 5**, not after every commit — S4's documented
  practice. Intermediate commits are `tsc` + `vitest` verified; the pushed tree is the built one.
- **`BUILD_EXIT` was read from the log every time**, never from the wrapper.
