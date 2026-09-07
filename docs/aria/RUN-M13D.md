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

---

## PHASE 3 — THE CRON PASSES SERVICE ROLE ✅

**Commit:** `<phase-3>` · `service-role-rule.ts` (new), `canon-rail-guard.ts`,
`service-role-rule.test.ts` (new, 8 tests).

The council's construction now reads `new AgentClass(supabaseAdmin).run(business_id)` — landed in
phase 2's commit with the rest of the injection. **Nothing else about the cron changed:** same
schedule (20:00 UTC via `h20`), same fourteen agents, same models.

### WALL 8 — only a cron may hand an agent the service-role client

The obvious repair to M13D's bug was to default `BaseAgent`'s field to `supabaseAdmin`. It was
refused twice — by M13C and again here — because these agents are built from **ten user-facing
routes**, and a service-role client inside a route makes that route bypass RLS for every read and
write the agent performs. **A silent authorisation hole in place of a silent failure is strictly
worse than the bug.** This rule is what stops that fix being made one call site at a time instead.

Legal only under `src/app/api/cron/`, plus exactly one named exception:
`src/lib/agents/proposal-council.ts` — the engine, whose only importer is
`api/cron/council-session/route.ts`. **An explicit entry, never a widened path prefix**, and a test
asserts the list has length 1: a second entry would mean the rule had been routed around.

### PROVEN IN BOTH DIRECTIONS BY OBSERVATION, with byte-identical lines

```
src/app/api/probes3/route.ts:3        new ReorderAgent(supabaseAdmin)   →  [agent-service-role-outside-cron]  FIRED
src/app/api/cron/probe4/route.ts:3    new ReorderAgent(supabaseAdmin)   →  (silent)                           ALLOWED
src/app/api/probes2/route.ts:4        runAgent(…, supabaseAdmin)        →  [agent-service-role-outside-cron]  FIRED
```

Same characters; only the path differs. All probes removed, guard clean afterwards.

### The predicate lives in `src/`, so a test can call it

`canon-rail-guard.ts` runs `main()` at module scope, so importing it runs the whole guard and no
test can drive one rule. `isAgentServiceRoleViolation()` therefore lives in
`src/lib/agents/service-role-rule.ts`; **the guard imports it and the test calls it**, so the rule
enforced in CI and the rule under test cannot drift apart. Eight tests, none of which reads source
text — including that it does **not** fire on `new BasAgent(supabase)` (the legitimate line every
route now uses; if that went red, phase 2 would be unshippable) and does not fire on an unrelated
`supabaseAdmin.from(...)`, because a rule that over-fires gets worked around.

**MUTATION:** a rule without the home check, written as a **genuinely new predicate** rather than a
reverted line — per the standing note that a diff-scanning guard cannot see a reintroduction. It
condemns every legitimate cron; the real predicate does not.

### ⚠️ The rule's own file failed the rule — the fourth time a scan has matched its own prose

The first version of `service-role-rule.ts` spelled both blocked shapes out literally in a doc
comment and the guard flagged its own definition, twice. **Literal split, guard untouched** — the
comment now describes the shapes and the exact strings are exercised in the test file, which is
exempt for good reason. M12 rule 9, M13 rule 8, M13B's stream test, and now this.

### ⚠️ VERIFY — a live run is UNVERIFIED, and here is what was proven instead

`CRON_SECRET` is not available to me and triggering a production cron unattended is not something an
autonomous run should do. **So the claim "a real council run writes `agent_decisions` and
`agent_runs`" is not verified by a run.** What is proven, in one rolled-back transaction against
production, is both halves of the diagnosis and of the fix:

```
anon     agent_decisions = REJECTED 42501      ← insufficient_privilege. 94 nights of this.
anon     agent_runs      = REJECTED 42501
anon     pos_products visible = 0
service  agent_decisions = ACCEPTED
service  agent_runs      = ACCEPTED
service  pos_products visible = 74
```

**`42501` is the whole story.** Not a bad insert, not a CHECK violation, not a missing column — an
unauthorised one, exactly as M13C reasoned and now measured directly. And the same transaction shows
the fix works: with the client a cron now passes, both writes land and the products appear.

Nothing was committed. **The first real run is tonight at 20:00 UTC**, and phase 5 says exactly what
to look at.

---

## PHASE 4 — WHAT THE THREE BLIND AGENTS CAN NOW SEE ✅ (report)

**No code in this phase.** Row counts, not conclusions — measured in one rolled-back transaction
that reads each table twice: once as `anon` (what these three agents have been seeing every night
since 4 June) and once as service role (what they will see tonight).

### Every table the three read, both ways

| table | as `anon` — what they saw | as service role — what they get |
|---|---|---|
| `pos_products` (active) | **0** | **74** |
| `pos_sales` (completed) | **0** | **1,802** |
| `pos_sale_items` | **0** | **3,510** |
| `pos_suppliers` | **0** | **2** |
| `pos_outlets` | **0** | **2** |
| `pos_staff` (active) | **0** | **5** |
| `staff_members` | **0** | **4** |
| `pos_rosters` | 0 | **0** — genuinely empty, not hidden |
| `competitor_price_cache` | 0 | **0** — genuinely empty, not hidden |

**Every zero in the left column is a lie the database was telling them.** The two zeros in the right
column are true.

### Can each one now complete its own logic?

**`reorder` — YES, fully unblocked.** Its first line is
`if (!products?.length) return { decisions: [] }`, and that guard has fired on every single run for
94 days. It now sees **74 products, 1,802 completed sales, 3,510 sale items and 2 suppliers** — its
statistical safety-stock path (Z·σ_D·√LT, built in June) has never once had data to run on.

**`pricing` — YES, via its own documented fallback.** Its product guard now passes (74). Its
competitor cache is **genuinely empty (0 rows, both roles)**, and the agent already handles that:
*"Fallback: internal margin+velocity pricing when competitor cache is empty"*, computed from
`pos_sale_items` — 3,510 rows now visible. So it completes, on the internal path rather than the
competitive one.

**`schedule` — YES.** Both read gates pass: `pos_outlets` (2) and `pos_staff` (5). `pos_rosters` is
**not a read gate** — it is a *write target*.

### ⚠️ ONE NEW WRITE TO SURFACE, and it is the thing to watch tonight

`schedule-agent.ts:178` upserts into **`pos_rosters`**, a table with **0 rows**. That write has
never succeeded — it went through the same rejected client. Tonight it can. The rows it creates are
`generated_by_agent: true` and **`published: false`**, so they are drafts and nothing reaches staff
until a human publishes them. **Reported, not acted on**, per the decision table.

### Nothing can execute, and that is verified rather than assumed

The sprint's rule is *"if an agent now produces a proposal, say what it is and do not execute it."*
**I cannot run the agents** — no model key, no local environment — so there is no proposal to name
yet. What I can verify is the safety property behind that rule, from live data:

```
agent_settings for Sip — all 9 configured agents:  enabled = true,  mode = 'suggest',
                                                   auto_approve_below_cents = 0
```

`proposal-council.ts` executes only inside `if (mode === 'auto')`, and **no agent is in `auto`**. So
tonight's run can propose a great deal and **`executeProposal` still will not be called** — which is
also consistent with M13C's finding that it has never been called in its life. Propose-then-approve
is intact.

### What this means for tonight

For the first time, the three agents that read through the broken client will see a real café: 74
products, 1,802 sales, 3,510 line items, 5 staff across 2 outlets. **A first run on 94 days of
unseen data may well produce a lot of proposals.** That is the point, it is not a fault, and none of
it executes.
