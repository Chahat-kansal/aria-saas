# RUN-M13C · THE COUNCIL THAT SAYS STEADY STATE

7 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE

### ✅ The DDL premise checks out exactly

`aria_ai_calls.retry_of` — **column present, index `aria_ai_calls_retry_of_idx` present, 13,366 rows
intact.** M13B's parked item is closed. Verified against `information_schema` / `pg_indexes`, not
assumed.

### ⚠️ FOUR PREMISE CORRECTIONS, ALL PROVEN AGAINST PRODUCTION

**1. `business_events` CANNOT be the interim home, and writing there would have reproduced this
sprint's own bug.** The brief says *"log to `business_events` in the meantime so the information is
not lost again."* That table carries

```
CHECK (entity_type = ANY (ARRAY['decision','job']))
CHECK (event_type  = ANY (ARRAY['proposed','approved','declined','expired',
                                'job_created','job_completed','job_failed']))
```

An `entity_type='council_session'` row is **REJECTED with SQLSTATE 23514** — measured inside a
rolled-back `DO` block, not inferred. Supabase resolves with `{ error }` rather than throwing, so it
would have failed **silently**: information lost again, by the very fix meant to stop losing it.

**`agent_runs` is the right home and already exists** — one row per agent run, with an `errors`
jsonb column built for exactly this. The same probe confirmed both the `logRun` row shape and an
errors-array row **ACCEPTED**.

**2. ⚠️ `logRun` is NOT failing. It is not being reached — and neither are the agents' data reads.**
The brief says *"`logRun` has failed silently since [4 June], inside a `try/catch` that cannot catch
a resolved `{ error }`."* The `try/catch` observation is true and the conclusion is not: **the exact
insert `logRun` performs was ACCEPTED by production** in the rolled-back probe.

The real cause is one line, and it explains the entire feature:

```ts
// src/lib/agents/base-agent.ts:11
protected supabase = createServerSupabaseClient();   // ← ANON KEY + cookies
```

`createServerSupabaseClient()` is `createServerClient(url, supabaseAnonKey, { cookies })`. **In a
cron there are no cookies**, so it is unauthenticated. RLS is enabled on `agent_runs` (2 policies)
and `agent_decisions` (1 policy). Both of `BaseAgent`'s own writes go through it:

| line | write | client |
|---|---|---|
| `base-agent.ts:46` | `agent_decisions` insert | `this.supabase` — **anon** |
| `base-agent.ts:52` | `agent_runs` insert | `this.supabase` — **anon** |
| `base-agent.ts:94` | `aria_ai_calls` insert | `supabaseAdmin` — **service role** |

**That table is the whole diagnosis.** It is why `aria_ai_calls` rows keep landing every night while
`agent_runs` and `agent_decisions` have been frozen since **4 June** — and why the agents *find*
nothing to propose: their **reads** go through the same anon client, and an RLS-protected read
returns a silent empty `[]` (RULE 7, verbatim). The date boundary fits: 4 June is the day the
agents were run **manually from the dashboard**, where a real user session existed and the cookies
were there.

**3. ⚠️ There is nothing to remove from the W6 override list.** The brief says *"Remove them from the
W6 override list in the same commit."* `READ_THE_ERROR_ALLOWLIST` has **three** entries —
`database.types.ts`, `supabase-admin.ts`, `supabase-server.ts` — and **neither
`proposal-council.ts` nor `base-agent.ts` is on it.** W6 is a *diff-scan* rule: pre-existing lines
are grandfathered by not appearing in the diff, not by a list. **Override count before: 3. After: 3.**
Touching those lines makes them new, so they must satisfy the rule — which is the ratchet working as
designed, without a list edit.

**4. `agent_council_sessions` has no `metadata` or `errors` JSONB.** Its columns are
`id · business_id · session_date · status · proposals_count · conflicts_detected · plan ·
plan_narrative · projected_revenue_impact · projected_cost_saving · owner_priority ·
executed_actions · actual_revenue_impact · completed_at · created_at`. See phase 1 for where the
health block goes and what is parked.

### The presence-test census (phase 4's worklist)

Every `it()` under the wall files classified by whether its assertions read **source text** or a
**returned value**:

| file | presence-only | exercises a function |
|---|---|---|
| `src/lib/ai/gateway.test.ts` | **2** | 7 |
| `src/lib/ai/gateway-truncation.test.ts` | **8** | 3 |
| `src/lib/ai/w1-allowlist.test.ts` | 0 | 5 |
| `src/lib/aria/cost-truth.test.ts` | **7** (3 guard W1) | 9 |
| `src/lib/agents/council-executor-silence.test.ts` | **3** | 6 |

`scripts/` contains **no** test files. Phase 4 converts the ones guarding W1/W6 and reports the rest.

---

## PHASE 1 — READ `agentErrors` ✅

**Commit:** `<phase-1>` · `proposal-council.ts`, `council-agent-health.test.ts` (new, 11 tests).

### The line

```ts
// proposal-council.ts:271, before
const agentErrors: string[] = []      // pushed to at :288 and :300, READ AT NEITHER
```

Ninety-four nights of failures went in and nothing came out — not logged, not stored, not returned.
That single unread array is why *"12 of 14 agents did not report"* was unanswerable from production.

### What it is now

`AgentFailure { agent_type, kind: 'not_registered' | 'timed_out' | 'threw', reason }`, collected
alongside `agentsReported` and `agentsSkipped`, and summarised into a `CouncilAgentHealth` block that
is **persisted and returned**.

A fourth state was found while wiring it and is now recorded rather than lost: an agent whose `run()`
**resolves without a decisions array** — not an exception, and not a report either. That is precisely
the state that used to be indistinguishable from calm.

**A timeout is kept distinct from a crash.** One says the agent is too slow for the 25-second window
it is given; the other says it is broken. Reported as one category they stay indistinguishable —
which is how this feature got here.

### Where it is persisted

| what | where | why |
|---|---|---|
| per-agent failure | **`agent_runs`** — one row each, `errors` jsonb, `triggered_by: 'council'` | the table built for it; `business_events` is CHECK-rejected (phase 0) |
| session health | **`agent_council_sessions.plan.agent_health`** | no metadata column exists; `plan` is written on **every** run, including zero-proposal ones |
| caller | returned on `CouncilSession.agent_health` | so a surface can render it without a second query |

**⚠️ Written with `supabaseAdmin`, and that is the point.** The council holds a service-role client,
so it records **on the agents' behalf** — no authorisation change to `BaseAgent`, whose own anon
client is the parked finding below.

### ⚠️ PARKED — the column, and the client

**(a) `agent_council_sessions.agent_errors jsonb` — DDL, not mine to write.** The clean end-state; a
dedicated column beats a key inside `plan`.

```sql
alter table public.agent_council_sessions add column if not exists agent_errors jsonb;
create index if not exists agent_council_sessions_agent_errors_idx
  on public.agent_council_sessions using gin (agent_errors) where agent_errors is not null;
```

**(b) `BaseAgent`'s anon client — PARKED AS AN AUTHORISATION CHANGE, and it is the real bug.**
Switching `protected supabase = createServerSupabaseClient()` to `supabaseAdmin` would make every
agent read and write **bypass RLS**, including in the six user-facing API routes that also construct
these agents (`/api/agents/bas/draft`, `/api/agents/clv/trigger`, `/api/agents/financing/run`,
`/api/finance/generate`, and two crons). RULE 18 and this sprint's own decision table both say
authorisation parks. **Recommended fix, for a human:** give `BaseAgent` an injected client —
service-role when constructed by a cron or the council, the caller's client when constructed by a
route — rather than one shared default. That is a one-file change with six call sites to audit, and
it is the difference between this feature working and not.

**This sprint makes the failure visible; it does not make it absent.** That is the decision table's
instruction, and after this commit the failure is visible for the first time.

### Verification — mechanism proven at the SQL layer, end-to-end deferred to phase 5

Rolled-back `DO` block against production, writing the exact rows the new code writes and reading
them back:

```
[session-row: 12/14 reported; failures=reorder(timed_out), pricing(threw)]
[agent_runs:  reorder -> timed_out: timeout | pricing -> threw: Cannot read properties of undefined]
```

**The session row names the agent and says why.** Nothing committed. The first *real* run is phase 5,
which is where the live per-agent report comes from.

### Rails — they call the functions

11 tests driving `classifyAgentFailure`, `summariseAgentHealth` and `readStoredAgentHealth` **by
calling them**, per this sprint's new standing rule. No assertion in the file reads source text.

**Mutation:** the pre-M13C behaviour reproduced — collect the failures, return a summary that forgets
them. Red, on the count and on the array.

**⚠️ GROUNDING-TEETH, in the reader.** The 96 historical sessions have no `agent_health` block.
`readStoredAgentHealth` returns **-1 (unknown)**, never 0. A session that never recorded its agents
did not run zero agents — rendering that as "0 of 0" would be the same fabrication the narrative is
being fixed for, and phase 3 refuses to build a sentence from -1.
