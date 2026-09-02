# M11 PHASE 2 — CAN A PLAN LIVE IN THE EXISTING TABLES?

**No code in this phase.** Every number below is a live query against production
(`nxfzippunqvqsvkmwtjv`), run 3 September 2026. Nothing here is read off a document.

---

## THE ANSWER IN ONE PARAGRAPH

**The steps can. The plan cannot, and the ordering cannot.** `aria_autopilot_actions` already
carries everything a *step* needs — a seven-value status CHECK that is exactly the right vocabulary,
an approval flag, an amount, an expiry, a supersede link, plain-English title and description — and
it must remain the step registry; building a second one would be the worst outcome of this sprint.
What is missing is **two things and only two things**: somewhere to put the owner's request (with
the conversation it came from), and **an order**. There is no ordinal column on any candidate table,
and the only ways to fake one are an insertion-timestamp accident or a JSONB field, both of which
this sprint explicitly forbids. **DDL is required, it is small, and it is proposed in
`M11-MIGRATION-PROPOSAL.sql`. That thread is PARKED — RULE 10a, DDL is never mine.**

---

## THE CANDIDATES, AND WHAT THEY ACTUALLY HOLD

### `aria_autopilot_actions` — 817 rows, 55 columns

The sprint's guess was right about this table's shape and wrong about one column. Column usage,
counted rather than read:

| column | non-null rows | what that tells you |
|---|---|---|
| `description` | 816 / 817 | the step text. Universal. |
| `domain` | 815 | CHECK: money \| people \| growth \| supply \| compliance |
| `title` | 795 | |
| `kind` | 452 | free text, no CHECK |
| `action_type` | 120 | free text |
| `agent_type` | 46 | |
| `expires_at` | 24 | the decision window (TS-1 phase 2's sweep reads it) |
| `amount_cents` | 20 | |
| `created_by <> 'aria'` | 16 | |
| `requires_stepup` | **3 true** | the approval flag already exists |
| `approved_at` | 2 | |
| `resolved_by` | 2 | |
| **`proposal_id`** | **0** | **the sprint's hypothesis. See below.** |
| **`outcome_data`** | **0** | |
| **`executed_at`** | **0** | **see the defect below.** |

**`aria_autopilot_actions_status_check`** allows exactly
`pending | approved | rejected | executed | dismissed | expired | superseded`. That is a better
step vocabulary than anything a new table would invent, and it is already enforced.

**`proposal_id` is NOT the plan grouping the sprint hoped for.** It is a `uuid` column with **no
foreign key**, **no index**, and **NULL on all 817 rows** — it has never been written successfully,
so it groups nothing and never has. It is free to take, and it is literally named for this job, but
it is a bare column, not an existing mechanism.

> ### ⚠️ WHY IT IS EMPTY — a second "exists, looks correct, does nothing"
>
> `src/lib/agents/council-executor.ts:17` inserts into `aria_autopilot_actions` with
> `proposal_id`, `agent_type`, `outcome_data`, `executed_at` and `status: 'executed'` on **every**
> proposal it executes. Live: `proposal_id` 0, `outcome_data` 0, `executed_at` 0. **That insert has
> never once landed.** Its error is never read — `await supabase.from(...).insert({...})` inside a
> `try` that only catches throws, and Supabase returns `{ error }` rather than throwing. RULE 7,
> exactly.

> ### ⚠️ AND A SECOND, SHARPER ONE — 5 rows claim to have executed with no execution time
>
> ```
> status      rows   with executed_at   with approved_at   with resolved_at
> pending      797          0                  0                  0
> expired       12          0                  0                  5
> executed       5          0                  0                  0
> approved       2          0                  2                  1
> rejected       1          0                  0                  1
> ```
>
> **Every row that says `executed` has a NULL `executed_at`.** The column that records *when*
> something ran is empty on 100% of the rows that claim to have run. Whatever sets the status does
> not set the timestamp. (The 5 `resolved_at` on `expired` are TS-1 phase 2's sweep, yesterday; the
> other 7 expired rows were set by something that did not record when.)
>
> **Recorded, not fixed.** It is a write-path change on paths this sprint does not own, and M120
> already exists for exactly this class (`TS-DEFECT-1`).

### `aria_actions` — 448 rows

A **different, weaker** table. No status CHECK at all — live values are
`auto_rejected | completed | dismissed | executed | expired | pending`, six variants that nothing
constrains. No expiry, no amount, no step-up flag, no supersede link. It has `rollback_data` and
`rolled_back_at`, which `aria_autopilot_actions` does not.

> **This is where `'completed'` is legal and `aria_autopilot_actions` is where it is not** — which
> is very likely the whole origin of TS-DEFECT-1: three writers using one table's vocabulary
> against the other table's constraint. Worth carrying into M120.

`/api/aria/plan`'s `save` branch writes `status: 'proposed'` here. **Live: 0 rows have status
`'proposed'` and 0 rows have `source = 'morning_loss_radar'`.** That save path has never produced a
row in production either.

### `agent_council_sessions` + `agent_council_proposals` — the closest existing thing, and it is dead

This pair is a **genuine plan/step split** and the sprint did not mention it:

| plan side (`agent_council_sessions`) | step side (`agent_council_proposals`) |
|---|---|
| `plan jsonb`, `plan_narrative text` | `session_id` → the plan |
| `status`, `completed_at`, `executed_actions` | `proposal_type`, `proposal_data jsonb` |
| `projected_revenue_impact`, `projected_cost_saving` | `council_decision`, `council_reasoning` |
| `proposals_count`, `conflicts_detected` | `executed_at`, `outcome_data` |
| `owner_priority`, `session_date` | `conflicts_with[]`, `synergises_with[]` |

**Live: 92 sessions. 91 of them produced ZERO proposals. 2 proposals exist in total. 0 have ever
been executed. All 92 sessions are marked `completed`.** Latest session 1 September 2026, so it is
running nightly and completing with nothing in it.

It is also the wrong shape for M11 regardless: it is keyed on `session_date` (a *daily* council,
not a delegated job), it has no field for the owner's own words, `council_decision` is the
council's verdict rather than the owner's approval, and there is no link to a conversation.

### `aria_action_log` — 64 rows, and the one piece that genuinely works

The undo ledger, and the only execution substrate here with real production history:

```
64 rows · last executed 25 Jun 2026 · 8 carry a conversation_id · 0 have ever been rolled back
action types actually used: adjust_stock | apply_category_discount | bulk_price_update
                          | create_promotion | update_promotion
```

`before_state` / `after_state` / `entity_ids` / `rolled_back_at`, written by
`src/lib/aria/ask/action-executor.ts` and read by `action-rollback.ts`. **This is the decision
table's "execute it, and record how to undo it", already built and already exercised on real data.**
M11's executor must call into this, not beside it.

---

## WHAT ALREADY EXISTS THAT THE SPRINT DID NOT MENTION

Reports here systematically understate what exists — failure pattern #3, five instances. Found in
preflight, before writing anything:

| thing | where | state |
|---|---|---|
| **`/api/aria/plan`** — a route literally called plan, with `preview` / `save` / `execute` / `undo` | `src/app/api/aria/plan/route.ts` (224 lines) | **live, called from the daily briefing in 4 places** |
| **`buildPlan()` returning `steps: string[]`** | `src/lib/aria/radar/plan-builder.ts` | live |
| **`executeProposal()`** — a real executor, switch over `price_change`, `send_campaign`, `create_reorder`, … | `src/lib/agents/council-executor.ts` | live, but its audit insert has never landed |
| **`action-executor.ts` / `action-rollback.ts`** — execute-with-undo | `src/lib/aria/ask/` (826 + 57) | live, 64 real rows |
| **`aria_task_outputs.conversation_id`** — deliverables already link to the Ask thread | 28 rows, 7 linked | live |

> **`/api/aria/plan` is NOT the loop M11 is asked for, and the difference is the point.**
> `RadarPlan.steps` is `string[]` — **display prose**. The whole plan executes as ONE
> `action_type` with one payload. There is no per-step status, no per-step approval, and no
> per-step outcome. It is also triggered by a `LossSignal` from the Morning Loss Radar, never by an
> owner describing an outcome.
>
> **So: the loop's SHAPE exists (propose → save → execute → log → undo) for a single detector-fired
> action. M11 is that loop for a multi-step plan from a request.** It is an extension, not a second
> thing — and per the decision table, extended rather than duplicated.

---

## WHAT A PLAN NEEDS, AND WHERE EACH PIECE LANDS

| a plan needs | fits today? | in what |
|---|---|---|
| step text an owner can read | ✅ | `title` + `description` (816/817 rows use it) |
| per-step status | ✅ | `status` — the 7-value CHECK is exactly right |
| "this step needs approval" | ✅ | `requires_stepup` (already used, 3 rows) |
| money on a step | ✅ | `amount_cents` |
| a step that replaces another | ✅ | `superseded_by` (TS-1 phase 5) |
| a step's outcome | ✅ | `outcome_note`, `outcome_data`, `resolved_at`, `resolved_by` |
| how to undo a step | ✅ | `aria_action_log.before_state` — already built, already exercised |
| **grouping steps into one plan** | ⚠️ | `proposal_id` is free, unindexed, FK-less, never written |
| **the ORDER of the steps** | ❌ | **nothing. No ordinal column on any candidate table.** |
| **the owner's request, in their words** | ❌ | nothing. `description` is the step's text |
| **which conversation it came from** | ❌ | no `conversation_id` on either action table |
| **plan-level status / the report** | ❌ | nothing |

### The two ways to fake an order, and why neither is taken

1. **`order by created_at`.** Technically works *if* every step is inserted in a separate
   statement, because each gets its own `now()`. It fails silently the moment anyone batches the
   insert — `now()` is the transaction timestamp and is **identical for every row in one
   statement** — and it cannot express a re-ordered plan at all. An ordering that exists only as an
   accident of insertion is one edit away from being wrong, with nothing to notice. This is the
   codebase's #1 failure pattern in advance.
2. **A `step_index` inside `action_data` jsonb.** The sprint forbids this by name: *"Never smuggle
   a plan into a JSONB column to avoid the conversation."* It is also unindexable and
   unconstrainable.

Repurposing a named column (`target_count`, `target_date`) is worse than either — a column whose
name lies about its contents is how the next person is sent down the wrong path.

---

## THE VERDICT, AND WHAT IT PARKS

**DDL is required: one small table and two columns.** Proposed byte-for-byte in
`docs/aria/M11-MIGRATION-PROPOSAL.sql`, and **PARKED** pending founder approval — RULE 10a.

The proposal deliberately does **not** create a second step registry. Steps stay in
`aria_autopilot_actions`; they gain a `plan_id` and a `step_index` and nothing else. The one new
table holds only what has nowhere to live today: the owner's request, the conversation it came
from, the plan's own status, and the report.

### The dependency chain this creates

| phase | depends on the parked DDL? | outcome |
|---|---|---|
| **3 — the plan** | **No.** The plan is produced and shown *before* anything runs; nothing needs to be stored to show it | **BUILD** |
| **4 — execute one step at a time** | **Yes.** Idempotency ("a double-approve must never run a step twice") needs a step record with an id and a status to claim. There is no unique index anywhere that could stand in | **PARKED — chain** |
| **5 — the report** | **Yes.** A report *of recorded outcomes* needs the outcomes recorded | **PARTIAL — the renderer is a pure function of recorded outcomes and is built and tested; it has nothing real to render until the DDL lands** |
| **6 — history** | **Yes.** Reopening a past job needs the job to exist | **PARKED — chain** |

**This is the decision table applied literally**, not a scope reduction chosen for convenience:
*"They genuinely cannot → propose the DDL and PARK that thread. Build what does not depend on it."*

---

## HOW THIS WAS CHECKED

`information_schema.columns`, `pg_constraint`, `pg_indexes`, and direct counts against
`aria_autopilot_actions` (817), `aria_actions` (448), `agent_council_sessions` (92),
`agent_council_proposals` (2), `aria_action_log` (64), `aria_task_outputs` (28), `aria_campaigns`
(0), `aria_ai_calls` (11,029 with cost). Code read: `council-executor.ts`, `council.ts`,
`plan-builder.ts`, `aria/plan/route.ts`, `action-executor.ts`, `action-rollback.ts`,
`ask/history/route.ts`.

**One thing I could not settle and am not guessing at:** `aria_ai_calls` has **no** linking column —
no `conversation_id`, no `request_id`, no `trace_id` (columns confirmed by query). So the cost of a
delegated job cannot be attributed to it today by any means except a time-window heuristic, which
would be a fabricated number. Phase 6's "the owner sees what it cost" therefore has no honest
source yet. That is recorded in the migration proposal as a separate, optional column rather than
solved by inference — GROUNDING-TEETH: unknown beats plausible.
