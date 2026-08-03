# INTEL-OUTCOME-1 — Outcome Learning Audit

**Read-only. No fixes shipped this sprint.** Traces the full RECOMMEND → DECIDE → MEASURE → LEARN
loop against live production data (Sip Café, `business_id ff5055a0-c351-4ada-817a-1804961035f3` —
the only business with real data in this database) and the actual running code, cross-referenced
against 3 prior sprints that already worked this exact territory (`reports/sprint-LRN-1-report.md`,
`reports/sprint-I4-outcome-loop-report.md`, `reports/sprint-I4-VERIFY-report.md`) so nothing here is
rediscovered from scratch — each finding below states whether it confirms, refines, or overturns what
those reports already claimed.

## Plain verdict

**Aria does not learn today. The infrastructure is real and, where it has ever been given real
input, it works correctly — but the loop has closed exactly once, ever, off a manually-seeded test
row from a prior sprint's own verification script. Every organic path a real recommendation takes
through this system either never reaches a decision, or reaches "executed" through a route that
was never wired to measure anything.** This is not a vague "probably broken" — every stage below is
backed by a live row count or a traced code path, not inference.

## Cross-reference: what prior sprints already found (so this isn't rediscovered)

- **LRN-1** (2026-06-11) built a *second*, parallel outcome-tracking system
  (`aria_autopilot_actions.outcome`, founder 👍/👎 feedback, `aria_ai_calls.learning_signal`) on top
  of the pre-existing `aria_outcomes`/`aria_advice_weights` system. Its own "founder verify checklist"
  was left with every box unchecked — it was never confirmed to work, even by its own author.
- **I4** (2026-06-14) claimed PART 1 (action→outcome linking) was "already wired" and the real gaps
  were only advice-weights surfacing + hypothesis closure. **This claim was wrong**, per I4's own
  erratum at the top of that report.
- **I4-VERIFY** (same day, 2026-06-14) found the real dead-end: actions reach `'executed'` via a path
  that skips the `'approved'` branch entirely, so the approve-triggered hook never fires. It fixed
  this at the `'executed'` transition (`onActionExecuted`, wired into the PATCH route and the
  auto-execute path) and **proved one live linked outcome** (`e965d21b…`, action `e2f54cba…`,
  baseline 6900 cents) — explicitly flagging "the verdict tail is on a clock" (needs the 30-day mark
  to pass) and that it could not verify further in its own environment.
- **This sprint verifies what happened after that clock ran out**, and traces why 24 of the 25
  actions executed *since* that fix still have no linked outcome.

## The loop, stage by stage

### 1. RECOMMEND — **partial**

Two structurally different recommendation paths exist, with opposite health:

- **`router.ts`'s judge-validated pipeline** (`aria_router:ops_narrative`, `signal_engine`,
  `cron:aria-health-monitor`, `aria_intelligence:alert` sources) — a recommendation is generated,
  run through a primary/secondary judge, and inserted into `aria_actions` with
  `status: validation.ok ? 'pending' : 'auto_rejected'`. **This part is genuinely wired** — 328 of
  353 all-time rows for Sip came through here, and a sample of the judge's actual rejection reasoning
  (see DECIDE below) shows real, thoughtful grounding-quality checks, not a rubber stamp.
- **`writeAriaOutcome()`** (`src/lib/aria/write-outcome.ts`), called from **34 separate `/api/aria/*`
  routes**, is a *second*, independent recommendation-logging path into `aria_outcomes` (not
  `aria_actions`). Live evidence: **`aria_outcomes` has exactly 1 row in its entire history, across
  every business that has ever existed in this database** — and that 1 row was inserted by
  `onActionApproved`/`onActionExecuted` (service-role, `supabaseAdmin`), not by `writeAriaOutcome`.
  With 34 real call sites and presumably many real invocations over ~2 months of Sip Café activity,
  zero rows from this function surviving is not plausible as "nobody ever triggered any of these 34
  routes" — it is far more consistent with **silent failure**: `writeAriaOutcome` uses
  `createServerSupabaseClient()` (a cookie/RLS-scoped client) and wraps its insert in a bare
  `try/catch` that only `console.error`s — no `aria_ai_calls` row, no `cron_logs` row, nothing
  queryable. A recommendation logged this way "vanishes once shown" exactly as the sprint's Stage 1
  question anticipated; there is no live-log access in this environment to confirm the RLS
  hypothesis with 100% certainty, but the row-count evidence (1 in the table's whole life, from a
  different writer entirely) is unambiguous that this path does not durably record anything today.

**Verdict: partial.** The judge-gated `aria_actions` pipeline records recommendations in a way that
can later be matched to a decision (it has a stable `id`, `category`, `source`). The parallel
`writeAriaOutcome` pipeline does not durably record anything as far as live data shows.

### 2. DECIDE — **dead**

Live status breakdown, all 353 `aria_actions` rows, Sip Café:

| status | count | source(s) |
|---|---|---|
| `auto_rejected` | 253 (72%) | `aria_router:ops_narrative` (200), `signal_engine` (44), `aria_intelligence:alert` (9) |
| `pending` | 57 (16%) | `cron:aria-health-monitor` (30), `signal_engine` (23), `aria_router:ops_narrative` (3), `aria_intelligence:alert` (1) |
| `executed` | 25 (7%) | `ask_aria:action` (100% of executed rows) |
| `dismissed` | 16 (5%) | mixed |
| `expired` | 2 (<1%) | `signal_engine` |
| **`approved`** | **0** | — |

**Zero rows have ever reached `status='approved'`.** The 16 `dismissed` rows are **not organic owner
decisions** — every one of them has `updated_at` landing on exactly one of two identical
millisecond-precision timestamps (`2026-06-13 08:33:25.345968` or `2026-06-13 10:24:23.44269`),
which is a bulk scripted update, not 16 separate human clicks spread across time. (Consistent with
the `[chat-claude-cleanup-2026-06-12: superseded by newer recommendation in same category]` reason
text found on 62 of the `auto_rejected` rows from the same period — a prior housekeeping pass, not
the judge or the owner.) The `ALLOWED_STATUSES` set in `actions/[id]/route.ts` (the only PATCH
endpoint, correctly wired to fire `onActionApproved`/`onActionExecuted` per I4-VERIFY) doesn't even
include `'dismissed'` — confirming these rows were never written through that endpoint at all.

Separately, the `ask_aria:action` "executed" path (`src/lib/aria/ask/action-executor.ts`, lines
700-721) **directly `INSERT`s a brand-new `aria_actions` row already in `status: 'executed'`** —
there is no `pending → approved` transition for this path at all. The owner's chat message *is* the
recommendation and the execution in the same breath; there is no separately-captured "decision"
distinct from "the owner asked for X," and — critically — **this insert never calls
`onActionApproved` or `onActionExecuted`**, because those hooks only fire from an `UPDATE` (the PATCH
route, or the `plan/route.ts` auto-execute path that I4-VERIFY patched). This direct-insert path is
not what I4-VERIFY fixed, and it is the *only* path that has ever produced an `'executed'` row for
Sip Café (100% of the 25).

**Verdict: dead.** In the full history of this table, zero recommendations have ever received a
genuine, individually-captured owner decision (approve or reject) that the system can trace back to
a specific card.

### 3. MEASURE — **wired, but starved to n=1**

This is where the picture is most nuanced, and where I4-VERIFY's own claim needed re-checking against
time that has now actually passed.

**The mechanism works when given real input.** The one linked outcome I4-VERIFY manually seeded
(`e965d21b…`, action `e2f54cba…`, "Apply 10% discount to Coffee category," `acted_on_at`
2026-06-14) has, as of today (2026-07-16, 32 days later — past the 30-day mark), been fully
verdicted:

```
outcome_7d_cents:  600
outcome_30d_cents: 3400
baseline_metric_cents: 6900
outcome_verdict: "backfired"
```

`runOutcomeChecks` genuinely re-measured real 7-day and 30-day post-action revenue against the real
baseline and wrote a real, honest verdict — the discount **backfired** (revenue dropped from $69 to
$34, a real 51% decline, correctly not spun as a win). `cron_logs` confirms `outcome-check` has run
**58 times, 100% `'completed'`**, most recently 2026-07-15 — the cron infrastructure itself is not
the problem; it has been running reliably on schedule for its entire history.

**But this is the only row that has ever existed.** `aria_outcomes` has exactly 1 row, ever, across
every business. The 24 other `ask_aria:action`-executed actions since 2026-06-14 (the I4-VERIFY fix
date) never created a linked outcome, because — per DECIDE above — they never went through the
`onActionExecuted`-wired code path. There is nothing else for `runOutcomeChecks` to measure; it has
run 58 times against, at most, one eligible row.

**Verdict: wired, not dead — but this is a distinction without a practical difference yet.** The
measurement code is real, correct, and running on schedule. It has simply never been given more than
one real recommendation to measure, because Stage 2 (DECIDE) never produces the input it needs
except by hand.

### 4. LEARN — **wired, not dead, but has learned nothing yet**

`adjustAdviceWeight` (`outcome-learning.ts`) correctly fired off that one verdict:
`aria_advice_weights` now has exactly **1 row**: `category='sales', weight=0.850, positive_outcomes=0,
negative_outcomes=1, neutral_outcomes=0, last_updated_at=2026-07-14 17:00` — a real downward
adjustment from the one backfired outcome, exactly as designed.

The **read side is real, live code**, not a dead reference (confirmed by direct file read, not grep
inference alone):
- `src/app/api/aria/ask/route.ts:913` — selects `aria_advice_weights` into the council's groundTruth.
- `src/lib/aria/ask/business-context.ts:350-354` — same, for the business-context builder.
- `src/lib/aria/hypothesis/generate.ts:61` — reads weights to bias nightly hypothesis generation.

All three are genuinely wired, matching I4's own claim. **But this table was completely empty for
its entire existence until 2 days before this audit** (`last_updated_at` = 2026-07-14, i.e. 32 days
after the table would have first needed data, and 60+ days after Sip Café's data history begins).
Every one of these "learning" consumers has had, for the overwhelming majority of this system's
life, literally zero rows to read — and today has exactly one, from one single event. A system that
has adjusted its confidence in exactly one category, based on one outcome, is not "learning" in any
meaningful sense yet — it has the wiring for a first data point, not a track record.

**Hypotheses closure — confirms the sprint's "0 accepted" claim, with one correction.** Live:
**180 total hypotheses** for Sip Café (not 1653 — see note below), spanning generation from
2026-05-21 to 2026-07-15 (~2 months of nightly runs): **170 expired, 10 active, 0 accepted, 0
rejected** — every single hypothesis this system has ever generated has either aged out unused or is
still sitting in the queue. `hypothesis-engine` cron: 44 completed runs (+ 14 early failures around
2026-06-10, since resolved), so generation itself is healthy and regular. Since `action_id`/
`outcome_verdict` on `aria_hypotheses` can only ever populate via the accept flow
(`hypotheses/[id]/route.ts` → creates a linked action → `onActionApproved`), and zero hypotheses have
ever been accepted, the hypothesis-closure code from I4 Part 5 (`runHypothesisOutcomeClosure`) has —
like the advice-weights consumers — real, correct code with zero real input in its entire history.

**Note on "1653 hypotheses"**: this sprint's own live count is 180, not 1653. The most plausible
explanation, cross-referenced against `AI-COST-AUDIT-REPORT.md`'s own finding: a migration
(`20260709000001_cleanup_delete_non_sip_businesses.sql`, run 2026-07-09) deleted 16 non-Sip
businesses and cascade-deleted their `aria_ai_calls` rows in the same transaction — the same
cascade-delete pattern would very plausibly have removed those businesses' `aria_hypotheses` rows
too, which could easily have made up the difference between a much larger historical all-business
total and today's Sip-only 180. This sprint cannot confirm the exact 1653 figure's origin (no
historical row-count log exists to check against), but the *qualitative* claim it was tracking —
**a large hypothesis backlog with a 0% acceptance rate** — is fully confirmed live, whatever the
precise historical number was.

**Verdict: wired, not dead, but has never actually influenced anything a real owner has seen.** The
code that would make Aria's advice adapt to what worked is real and correct. It has adapted exactly
once, 2 days ago, based on a test row planted 32 days earlier by a previous sprint's own verification
script — not from anything a real owner did.

## Where exactly the loop breaks (ranked for a follow-up sprint)

1. **`action-executor.ts`'s direct INSERT bypasses DECIDE and MEASURE entirely (highest impact).**
   This is the *only* code path that has ever produced an `'executed'` `aria_actions` row for the
   real business in this database (100% of 25 rows) — every Ask Aria chat-triggered action. It
   creates the row already in its terminal state and never calls `onActionApproved`/
   `onActionExecuted`. Fixing this (calling `onActionExecuted` right after the insert, mirroring
   what I4-VERIFY already did for the PATCH route and `plan/route.ts`) would immediately start
   producing real, organic linked outcomes — 25 today, and growing with every future Ask Aria action.
   This is the single highest-leverage fix: it is the dominant real-world path and is currently 100%
   discononnected from the loop.
2. **`writeAriaOutcome`'s silent failure (high impact, needs live-log confirmation).** 34 call sites,
   1 surviving row ever, RLS-scoped client with a swallowed catch. Whether the root cause is RLS,
   a schema drift, or something else can't be fully confirmed without server log access this
   environment doesn't have — but the practical effect (a recommendation is generated and then
   leaves no trace) is confirmed by the row count alone. Worth an instrumented test (log the actual
   Supabase error instead of swallowing it) before assuming the fix.
3. **No real DECIDE signal exists for the judge-gated pipeline at all.** 57 `pending` rows sit
   unactioned with no UI-driven approve/reject ever observed in the data (0 approved, ever). Even if
   #1 and #2 are fixed, the 328 recommendations that go through `router.ts`'s pipeline still have no
   confirmed path to a real owner decision — worth confirming whether the dashboard surface that's
   supposed to show these cards (and let an owner approve/dismiss them) is actually being used, or
   whether it's not surfaced/visited at all.
4. **`aria_autopilot_actions`' parallel LRN-1 feedback loop (👍/👎) has zero real usage** (190 rows,
   0 positive, 0 negative, 0 non-pending outcomes) — its own founder verify checklist was never
   completed. Lower priority than #1-3 since it's a second, redundant tracking layer rather than the
   primary loop, but worth deciding whether to keep, merge with `aria_outcomes`, or retire — running
   two unverified parallel outcome systems is itself a source of confusion for any future sprint.
5. **Once #1-3 are producing real organic data**, the LEARN-stage code (advice weights, hypothesis
   closure) needs no further changes — it is already correct and already reads live. It just needs
   real input to start actually functioning as "learning" rather than "correctly-plumbed but
   untested infrastructure."

## What is NOT broken (don't re-fix this)

- The `outcome-check` cron: running reliably, 58/58 recorded runs completed, correct schedule.
- `runOutcomeChecks`'s measurement logic: proven correct against the one real case it's ever seen —
  it measured a genuine 51% revenue decline and correctly called it a backfire, not a fabricated or
  inflated number.
- `adjustAdviceWeight` and its 3 real downstream readers: correct code, correctly wired, simply
  unfed.
- `hypothesis-engine`: generating real, distinct, evidence-based hypotheses nightly (44 recent
  completed runs) — the generation side of the hypothesis system is healthy. The closure side is
  unfed for the same reason as everything else: nothing is ever accepted.
