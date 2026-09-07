# RUN-M13D · THE AGENTS CAN'T SEE OR WRITE

7 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — GATE

### ⚠️ THE 20:00 UTC RUN HAS NOT HAPPENED YET. There is no per-agent picture to report.

The sprint asks me to run M13C's two closing queries and put the result at the top. **It is 11:07
UTC.** The council fires at 20:00 UTC, nine hours from now, and M13C's phases 1–3 shipped after
yesterday's run. Both queries return the old world:

```
session_date  status    proposals  narrative                                              health
2026-09-06    complete  0          No agent proposals today — all systems are in steady…  null
2026-09-05    complete  0          No agent proposals today — all systems are in steady…  null
2026-09-04    complete  0          No agent proposals today — all systems are in steady…  null
```

`agent_runs` for Sip: **7 rows, newest 2026-06-04 09:52** — unchanged, as expected.

**So this sprint proceeds on M13C's diagnosis rather than on a fresh observation, and says so.** The
`agent_health` block is `null` on every row because no run has executed the code that writes it. That
is not a fault; it is the clock.

### The consumer map — ⚠️ it is not six routes, it is 26 construction sites

M13C's phase 5 recommended the fix and said *"six call sites to audit"*. **Measured: 26.** That
number came from a partial grep and this sprint would have been built on it. The real map:

| kind | entry points | construction sites | auth today | client held today |
|---|---|---|---|---|
| **user-facing routes** | **10** | 9 direct + `pos/agents/[type]` via the orchestrator | `getUser()` | `createServerSupabaseClient()` |
| **crons** | **15** | 13 direct + `cron/[task]` via the orchestrator + `cron/council-session` via the registry | `verifyCronAuth` | `supabaseAdmin` |
| | | **26 `new …Agent()` lines in total** | | |

**Routes (10)** — every one authenticates a user and already builds a session client:
`agents/acquisition/content` · `agents/acquisition/run` · `agents/bas/draft` · `agents/clv/trigger` ·
`agents/financing/run` · `agents/flash-revenue` · `agents/menu-engineering/actions` ·
`agents/negotiation/briefs` · `finance/generate` · `pos/agents/[type]`

**Crons (15)** — every one verifies cron auth and already holds `supabaseAdmin`:
`cron/bas-monitor` · `cron/clv-weekly` · `cron/customer-acquisition` · `cron/flash-revenue` ·
`cron/inventory-financing` · `cron/labour-optimisation` · `cron/menu-engineering` ·
`cron/reconciliation` · `cron/reputation-requests` · `cron/supplier-negotiation` ·
`cron/waste-noon-check` · `cron/waste-prep-guide` · `cron/waste-reconcile` · `cron/[task]` ·
`cron/council-session`

**The split is perfectly clean, and that is the finding that makes this sprint safe.** Not one route
lacks a session client and not one cron lacks a service-role client. **Both sides already hold
exactly the client they should pass** — they have simply never passed it. Injection is a plumbing
change, not a decision about who may do what.

### Two shared paths, which the sprint's table does not mention

- **`src/lib/agents/orchestrator.ts`** — `runAgent()` builds `reorder`, `pricing` or `schedule` and
  is called from **both** a cron (`cron/[task]`) and a route (`pos/agents/[type]`). It must take a
  client and pass it through; it cannot pick one.
- **`proposal-council.ts:512`** — `new AgentClass().run(business_id)`, the dynamic registry
  construction that runs all fourteen agents nightly. **This is the one that has been broken since
  4 June.**

### ⚠️ There is no type-level distinction between the two clients, and there cannot be one today

`supabaseAdmin` is `makeLazyServiceRoleClient()` and `createServerSupabaseClient()` is
`createServerClient(...)`; **both are plain `SupabaseClient`.** Phase 2's instruction is to use such
a distinction *if the codebase already has one* — it does not. **Reported as worth having and moved
on**, per the instruction.

What that means concretely: the compiler can force *a* client to be passed (phase 2) and a guard can
enforce *which* one (phase 3), but no type can. A branded type — `ServiceRoleClient` vs
`SessionClient`, applied at the two factories — would make phase 3's guard redundant and is the
better end-state. It touches every Supabase call site in the repo, so it is its own sprint.
