# BRAIN-LOOP-1 — give the learning loop a real entry condition

**Date:** 2026-08-01 · **Business proven against:** Sip Café (`ff5055a0…`)

The loop was never broken. It was never *started*. Generate → accept → baseline → outcome → weight
was built, scheduled and consumed — but acceptance is owner-gated, and no owner had ever accepted.
240 hypotheses had produced **zero** units of learning.

---

## 1. What was actually wrong (preflight, corrected twice)

| Claim going in | What the data said |
|---|---|
| "1,653 hypotheses" | **240.** 45 active, 195 expired. |
| "the loop isn't built" | Built, scheduled (`cron/outcome-check`), and consumed by `ask`, `action-planner`, `business-context`, `hypothesis/generate`. |
| "the loop doesn't run" | It runs. It has nothing to run *on*: **0 accepted, 0 `action_id`, 0 `baseline_metric_cents`.** |

The gap was never the machinery — it was that hypotheses lived on a board nobody opened.

---

## 2. What shipped

**Entry condition.** Up to **2/day** are routed into the PH-1 Decisions queue (the surface owners
use daily), ranked by learned `weight × confidence`. Weights only ever **reorder** — they never
fabricate, suppress, or alter a card.

**Dedupe is once-EVER, not once-per-day.** `decision_id` is a set-once marker with **deliberately no
FK**. Decision rows *can* be hard-deleted (`aria_autopilot_actions` has no protection trigger; I
hard-deleted some during SPINE-1). `ON DELETE SET NULL` would let a DELETE silently re-open a
hypothesis — a guarantee a DELETE can undo is not a guarantee. Referential integrity is traded away
knowingly; read-through runs the other way (`action_data->>'hypothesis_id'`), so nothing depends on
`decision_id` resolving.

**One acceptance path, three surfaces.** The queue, the hypotheses board and the intelligence page
all converge on the existing `PATCH /api/aria/hypotheses/[id]`.

**Non-decisions now teach something — but only the ones that honestly can.**

| Signal | Δ weight | Why |
|---|---|---|
| measured `worked` | **+0.100** | real, measured |
| measured `backfired` | **−0.150** | real, measured |
| **declined** | **−0.040** | owner read it and said no — a judgement |
| **expired after being surfaced** | **−0.020** | they saw it and let it lapse — ambiguous |
| **expired, `unknown_surfaced`** (the 195) | **excluded forever** | see below |
| expired, never surfaced | excluded | Aria's failure to surface, not the owner's verdict |

It takes 7+ declines to offset one measured success. **Opinion nudges ranking; only evidence moves
it.** Declines/expiries never touch `positive/negative/neutral_outcomes` — those count *measured
outcomes*, and inflating them would turn "never tried" into "tried and failed" downstream.

**The 195 are written off, not guessed at.** Two browse surfaces existed, but nothing recorded
whether an owner ever opened them — so "shown and ignored" is indistinguishable from "never
displayed". Scoring them would mean inventing a fact about owner behaviour. `surfaced_status` keeps
three states precisely so `NULL` ("not yet shown") never collapses into `unknown_surfaced`
("unknowable") — they have opposite learning consequences.

---

## 3. Two real defects the proof caught (neither found by review)

**(a) Cards were born already expired.** The first version passed the hypothesis's `expires_at`
straight onto the card. Hypotheses sit `active` past their own expiry until the expiry job flips
them — so cards were created `pending` but instantly refused: `409 not_waiting`. **The entry
condition would have shipped dead** — hypotheses surfaced, counted, and impossible to accept.
Fixed both ends: stale hypotheses are no longer candidates, and card + hypothesis now share one
clamped closing time (≥72h). The 2 bad cards were repaired to what the fixed code would have written.

**(b) The intelligence page's Accept was a dead accept.** It used the *collection* `PATCH`, which
flipped `status='accepted'` and stopped — no `aria_actions` row, no baseline, nothing for
`runOutcomeChecks()` to measure. An owner accepting there produced a hypothesis that *looked*
acted-on and could never yield one unit of learning. That is this sprint's exact blind spot, hiding
one route over. It now delegates to the canonical path.

Both were found by running the chain, not by reading it.

---

## 4. Proof — the full chain over real HTTP

Session minted for the Sip owner via the admin API, with `@supabase/ssr` writing the cookie itself
(format produced by the library, not guessed). Against a live dev server:

```
POST /api/owner/decisions {action:'approve'} -> 200
  hypothesis 5196b01c… : active -> accepted, accepted_at 2026-07-31T15:35:01Z
  aria_actions aa808a02… created (source: hypothesis_engine, predicted_impact_cents 40000)
  aria_outcomes c11754bc… created, baseline_metric_cents = 0, acted_on = true
POST /api/owner/decisions {action:'decline'} -> 200
  hypothesis 6020f793… : active -> rejected
  learnFromNonDecisions -> inventory weight 1.000 -> 0.960 (-0.04)
                           outcome counters unchanged (0/0/0)  <- decline is not an outcome
  re-run -> declined: 0                                        <- idempotent
```

`baseline_metric_cents = 0` is an **honest zero**, not a failure: Sip has had no sales since
2026-07-17. Note it is stored on `aria_outcomes`, not on the hypothesis row — my first proof checked
the wrong table and reported a false failure.

---

## 5. Honest counts (Sip, after the proof)

| | |
|---|---|
| hypotheses total | **240** |
| surfaced to Decisions | **2** |
| accepted, with `aria_actions` row | **1** |
| **with a measured outcome** | **0** |
| declined | **1** |
| expired `unknown_surfaced` — excluded forever | **195** |

**Surfaced is not learned. Accepted is not learned.** Learning requires a *measured outcome*, and
that count is still **0** — the 7/30-day windows have not elapsed. The loop now has its first input;
it has not yet produced its first output. Anyone reporting "2 surfaced" as progress on learning is
repeating the error this sprint was written to fix.

---

## 6. Known limits (stated, not silently carried)

- **Only 15 of Sip's 45 active hypotheses are genuinely live** — 28 are already past their expiry and
  are correctly excluded. Surfacing will be thin until fresh hypotheses are generated.
- **The generator emits near-duplicates.** The 2/day cap was spent on two near-identical dead-stock
  cards. Cap enforcement is correct; *card diversity* is a generator concern, untouched here.
- **A baseline of 0 on a dormant business** means any later sale reads as a large positive delta.
  Pre-existing `runOutcomeChecks()` behaviour, unchanged by this sprint — flagged, not silently fixed.
- **No new cron, no new function.** Both steps ride the existing `cron/outcome-check` pass: learn
  first, then surface, so today's ranking reflects today's learning.
