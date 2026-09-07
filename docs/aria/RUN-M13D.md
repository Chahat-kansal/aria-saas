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

---

## PHASE 2 — INJECT ✅ ← *the sprint*

**Commit:** `<phase-2>` · `base-agent.ts`, `orchestrator.ts`, `proposal-council.ts`, **24 call
sites**, `base-agent-injection.test.ts` (new, 5 tests).

### The one field

```ts
// was
protected supabase = createServerSupabaseClient();   // anon key + request cookies

// is
protected supabase: SupabaseClient;
constructor(supabase: SupabaseClient) {
  if (!supabase) throw new Error('[BaseAgent] a Supabase client is required…')
  this.supabase = supabase;
}
```

**No default — neither one.** A default of `supabaseAdmin` makes ten user-facing routes bypass RLS;
a default of the session client is the original bug verbatim. Either way the next agent added to the
registry inherits it silently and nothing goes red. **An explicit argument at all 26 sites is not
overhead; it is the fix.**

### `tsc` found the call sites I had not, which is exactly the VERIFY

After updating the 22 direct sites, the compiler failed on precisely two:

```
src/app/api/cron/[task]/route.ts(127,9):        error TS2554: Expected 3 arguments, but got 2.
src/app/api/pos/agents/[type]/route.ts(232,11): error TS2554: Expected 3 arguments, but got 2.
```

Both are `runAgent()` — the orchestrator, the one function called from **both** sides of the split.
It now takes the client and threads it through, because it is the single place that genuinely cannot
choose: `cron/[task]` passes `supabaseAdmin`, `pos/agents/[type]` passes its owner's session client.

**That is the phase's verification, observed rather than asserted:** a call site with no client does
not compile.

### PROOF the ten routes behave identically — the whole diff, not a claim

```diff
### agents/acquisition/content     - new CustomerAcquisitionAgent()    + new CustomerAcquisitionAgent(supabase)
### agents/acquisition/run         - new CustomerAcquisitionAgent()    + new CustomerAcquisitionAgent(supabase)
### agents/bas/draft               - new BasAgent()                    + new BasAgent(supabase)
### agents/clv/trigger             - new CLVAgent();                   + new CLVAgent(supabase);
### agents/financing/run           - new InventoryFinancingAgent()     + new InventoryFinancingAgent(supabase)
### agents/flash-revenue           - new FlashRevenueAgent();          + new FlashRevenueAgent(supabase);
### agents/menu-engineering/actions- new MenuEngineeringAgent();       + new MenuEngineeringAgent(supabase);
### agents/negotiation/briefs      - new SupplierNegotiationAgent()    + new SupplierNegotiationAgent(supabase)
### finance/generate               - new ReconciliationAgent()         + new ReconciliationAgent(supabase)
### pos/agents/[type]              - runAgent(type, bid),              + runAgent(type, bid, supabase),
```

**One changed line per route.** And in every one of the ten, `supabase` is
`const supabase = createServerSupabaseClient()` — **the identical factory the old `BaseAgent` field
called for itself.** So the agent receives the same anon-plus-cookies client it used to construct
internally; the only difference is that it shares the route's instance instead of building a second
one from the same cookie store. Same session, same user, same RLS.

**Nothing else in those files changed.** That is the proof the sprint asked for, and it is a diff,
not an assertion.

### The rail — it builds agents and watches what happens

Five tests, none of which reads source text:

- the client handed in **is** the client the agent uses — asserted by tag, both directions
- **two agents built with different clients do not share one** — the pre-M13D field was a
  module-scope initialiser, so every agent in the process resolved the *same* anon client no matter
  who built it. This is the assertion that would have caught the original defect.
- a missing client **throws**, and the message names what to pass — this catches the callers `tsc`
  cannot see: plain JS, an `as any`, a hand-built mock, a dynamic registry
- **MUTATION:** a subclass with a default parameter is built and shown to construct happily with no
  argument — the defect reproduced — while the real base class refuses. **A genuinely new class, not
  a reverted line**, per the standing note that a diff-scanning guard cannot see a reintroduction.
- **ANTI-VACUITY:** the probe is a real `BaseAgent` (`instanceof`, has `run`, has `type`) and
  `BaseAgent.length === 1`, so a zero-arity constructor would make every assertion above vacuous.

### Not done, and named

**No branded client type**, because the codebase has none to build on — both factories return plain
`SupabaseClient` (phase 1). The compiler can force *a* client to be passed and phase 3's guard can
enforce *which*; no type can. Reported, per the phase's own instruction.
