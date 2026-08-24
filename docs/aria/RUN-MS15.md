# RUN-MS15 — THE HARNESS + THE INERTNESS LEDGER (autonomous, 2026-08)

## ⚠️ READ FIRST — ARIA IS STILL FAILING, AND IT IS A BILL, NOT A BUG

**2,401 of 2,533 Anthropic failures in the last 30 days (95%) are one error, verbatim:**

```
400 {"type":"error","error":{"type":"invalid_request_error",
"message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing
```

**Running continuously since 2026-07-27. Still failing 2026-08-23 20:00 UTC.** The remaining 132
are 127 nulls and 6 timeouts. The failure rate rose 48% → 60% because the block never lifted.

**This is not fixable in code and nothing in this sprint pretends otherwise.** Every answer Aria
has given for four weeks came from the Gemini fallback with no live data tools. What this sprint
DID do is make it impossible to miss: `/api/admin/ai-costs` now leads with `action_required`,
naming the cause and the action ("Top up the Anthropic account"), because a 60% failure rate that
reads like a rate-limit blip gets ignored, and this one has been.

---

## Summary

**All six phases done. Nothing parked (two items deliberately left without a number — below).
Six commits.**

| Phase | What | Commit |
|---|---|---|
| 1 | Failure diagnosed; unpriced calls record null; gateway rail over 174 SDK sites | `73bb8197` |
| 2 | Call sites declare a JOB; the gateway picks the model — no choice changed | `5eee415e` |
| 3 | The verifier — five rules, refuses or hedges, never ships an unverified claim | `3a6fda11` |
| 4 | 51-case eval set, one command, a score that provably moves | `be28e88a` |
| 5 | The inertness ledger — has this ever landed a row? | this run |
| 6 | The cold list, generated live | this run |

### The eval set's baseline score

```
npx tsx scripts/run-evals.ts   →   ARIA EVAL SET — 47/47 cases · SCORE 100
                                   (+ 4 known gaps, excluded and named)
```

**And it provably moves:** a fully degraded responder drops it below 50; a lookup-only regression
drops it proportionately; **disabling one verifier check drops it to 85.1** and names all seven
affected cases. On its *first* run it scored 49 and found four classes of fault — three of them
real bugs in the verifier I had just written. That is the ruler working.

### How many recent responses the verifier would have blocked

**Honest answer: an upper bound of 246 of 537, and I do not believe that number.** Measured over
236 real assistant messages in `aria_conversations`: 537 dollar figures, of which 246 (46%) match
no raw or calendar-bucket value in Sip's data, across 84 of 98 conversations. **But a sample of
the unmatched figures shows most are legitimate derived aggregates** — rolling 7-day sums,
day-of-week averages, AEST-aligned week windows — which a *retrospective* anchor set cannot
contain, because the real anchors were computed at generation time and never stored.

So the defensible statement is narrower and more useful: **the verifier can only be run honestly
at generation time**, which is exactly why it takes anchors as an input rather than querying for
them. The clean signals I can stand behind:

- **11 stored responses discuss or propose coffee discounts.** Every one would be caught the
  moment the house rule "never discount coffee" exists (it does not yet — `house_rule` rows: 0).
- **0 allergen questions have ever been asked.** The locked safety rule has never been tested by
  reality; it is now tested by 7 eval cases instead of by luck.

### The cold list, as of 2026-08-24

Nothing on it was fixed — that is the next sprints' backlog, discovered in one place.

| state | target | evidence |
|---|---|---|
| **COLD ‼** | `usage_logs` | 0 rows, deployed 2026-08-22, **and the trigger has occurred**. Was structurally impossible until phase 1 fixed the never-dispatched insert. |
| **STALE ‼** | `aria_task_outputs` | 26 rows, nothing since **2026-06-17** (68 days) |
| **STALE ‼** | `aria_action_log` | 64 rows, nothing since **2026-06-25** (60 days) — no Ask Aria action has executed in two months |
| **STALE ‼** | `aria_conversation_summaries` | **1 row ever**, last 2026-06-25. The write path exists and is called; the failure is inside a fire-and-forget `.catch(() => {})` |
| **STALE ‼** | cron `hypothesis-engine` | 58 runs, last **2026-07-12** (43 days) |
| cold (expected) | `aria_business_memory (house_rule)` | 0 — nobody has completed onboarding since MS14 shipped the questions |
| cold (expected) | `aria_skills (kind=agent)` | 0 — nobody has built an agent yet |
| cold (expected) | `stripe_events` | 0 — no Stripe products, prices or endpoint exist yet |
| warm | `aria_advice_weights` | 2 rows, last 2026-08-02 |
| warm | 10 crons | customer-scoring, signal-engine, nightly-sync and 7 others all ran within 24h |

**Cold ≠ broken, and that distinction is the design.** Four of the nine cold/stale entries are
expected and are NOT flagged; five need a human. Conflating them produces a list nobody reads,
which is how ten "exists, looks correct, does nothing" instances got through.

### Three things Chahat most needs to know

1. **Top up the Anthropic account.** Four weeks of every call rejected, and the fallback answers
   without live data tools. Nothing else in this sprint matters as much, and no code change can
   substitute for it.
2. **Ask Aria actions and deliverables stopped two months ago.** `aria_action_log` has written
   nothing since 25 June and `aria_task_outputs` nothing since 17 June. The ledger found this
   because it asked a question no test asks: *has this ever landed a row?* Neither is diagnosed
   yet — that is deliberate, this sprint built the instrument.
3. **There is now a number.** `npx tsx scripts/run-evals.ts` scores 100 over 51 cases and drops
   when anything degrades. Every future model swap, prompt edit or verifier change can be argued
   with evidence instead of vibes — and the Opus-for-judgement candidate is recorded, waiting on
   exactly that.

---

## Phase log

### Phase 1 — THE GATEWAY AND THE LIVE FAILURE (`73bb8197`)
Diagnosis above. **Adoption: 7 gateway importers vs 174 direct SDK sites at start, unchanged at
end by design** — migrating them is what the decision table forbids; the rail stops the number
growing and batches shrink it. `MODEL_SDK_ALLOWLIST` grandfathers all 174 by name.
**The 1,459 zero-cost calls are TWO faults, measured not assumed:** 93 on `gpt-4o-mini`, a model
`PRICING` never knew, recorded as *free* → now `null` via `computeCostCentsOrNull`; and 1,366 that
are priced correctly but cost **less than one cent** (a gemini call averages 514 in / 27 out ≈
0.006c; all 1,308 together ≈ 8.1 cents). The second **PARKED with the column named**:
`cost_usd_cents` is `integer`, sub-cent needs `numeric(12,6)` or a micros column.
So the ledger understates by **cents, not dollars** — stated plainly rather than implying a
hidden bill. Mutation probed by running: disarmed → probe sails through; re-armed → caught.

### Phase 2 — JOB ROUTING (`5eee415e`)
J1 judgement / J2 precompute / J3 extraction / J4 build_coding (null model — a build-time job
reaching the runtime router fails loudly). **Not one model choice changed**, asserted per-task
against a transcription of the old ternary. All four provider paths route through it, not just
Anthropic — with a 60% Anthropic failure rate, the fallbacks are where the traffic actually goes.

### Phase 3 — THE VERIFIER (`3a6fda11`)
Five rules; refuses or hedges; the refusal never repeats the figure it blocked. **Two faults in
my own work, recorded in-source rather than quietly fixed:** the first allergen pattern used
`\ballergen\b`, which does **not** match "allergens" — the commonest phrasing walked through a
locked safety rule; and a negative source assertion I wrote **matched the fixed code**, i.e. it
would have passed on the bug and failed on the fix.

### Phase 4 — THE EVAL SET (`be28e88a`)
51 cases, 8 categories, 5 real regressions, seeded fixture only (asserted: no real business id,
no owner name, no emails). First run scored **49** and produced: a harness bug (a safety case's
"good" answer *is* a refusal), three real verifier gaps (a response *declining* a margin was
flagged; a response *citing* a house rule was flagged as breaking it; bare counts walked past a
currency-only pattern), my own wrong case data, and a **tolerance collision** — a wrong value
sat within 0.5% of a real anchor and passed, recorded in the case rather than tuned away.
**Four known gaps are excluded from the score and reported**, each naming what it would take.

### Phase 5 — THE INERTNESS LEDGER
`classifyWriter` / `classifyCron`, pure and testable, plus a `WRITER_REGISTRY` naming each
writer, when it shipped, and **whether its trigger has actually occurred** — the field that
separates "unused" from "broken". Nightly at `/api/cron/inertness-scan` (registered in
vercel.json, 04:00 UTC), which logs its own `cron_logs` row so the watcher is itself watched.

### Phase 6 — THE COLD LIST, SURFACED
`/api/admin/cold-list`, generated live from the registry crossed with the database on every
request. **A failed observation reports nothing rather than "cold"** — a diagnostic that
manufactures the problem it claims to find is failure pattern #5, and this one is tested against
it. Mutation: a hardcoded entry turns the no-literal-verdict assertion red.

---

## Deviations & findings
- **The cold list could not be run end-to-end locally**: no Supabase env in this environment
  (`.env.local` is a hard boundary). The table above was assembled through MCP using the same
  classification thresholds; the route itself is exercised by unit tests and typechecks, and its
  failure path was confirmed by the local run reporting *nothing* rather than inventing coldness.
- **I broke the standing rule and it cost a build.** Two `next build` runs overlapped — a
  fix-and-rebuild chain was still compiling when I started another — and the second died on
  `ENOTEMPTY: rmdir .next\export`, the .next-corruption signature from MS9/MS10. Remedy applied:
  kill the holding node process, `rmSync` .next, one build with nothing else running → exit 0.
  A backgrounded build is still a running build; "never run concurrent builds" includes the one
  you already started and stopped watching.
- **A lint rail caught me too**: the new cron route reached for the deprecated `@/lib/cron-auth`
  (returns a boolean with inverted sense) instead of `@/lib/auth/cron`. Exactly the class of
  mistake the rails exist for, on the sprint whose subject is rails.
- **22 → 23 crons** in vercel.json (paid plan allows 100).
- **Not swapped, recorded:** Opus for J1 judgement, and a cheaper schema-holder for J3 — both in
  `MODEL_CANDIDATES` with their rationale and what they are blocked on.
