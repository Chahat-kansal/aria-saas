# RUN-M13D · THE AGENTS CAN'T SEE OR WRITE

**7 September 2026 · autonomous run, RULE 20 · five phases, five done, none parked as work, five
commits. All pushed. Build verified green.**

**The agents can write again.** Ninety-five days after the last `agent_runs` row, one landed —
**twenty-four minutes after phase 2 deployed**, from a real production cron, while this sprint was
still running.

## THE THREE THINGS YOU MOST NEED TO KNOW

**1. ⚠️ IT IS FIXED, AND IT IS OBSERVED, NOT ARGUED.** Phase 2 was pushed at 11:36 UTC. At 12:00:47
UTC `/api/cron/[task]/reorder-daily` ran and wrote:

```
agent_type reorder · triggered_by cron · decisions_count 0 · errors null · 2026-09-07 12:00:47 UTC
```

**`agent_runs` rows written since 5 June: exactly this one.** Under the old code `logRun` wrote
through the anon cookie client, RLS answered `42501`, and no row could appear — which is why the
table stopped dead on 4 June. Under the new code the cron passes `supabaseAdmin` and the write lands.
Nothing else changed between those two states, so **the row's existence is the proof.** Phase 3's
verification came from production in the end, not from the fallback probe.

**2. The whole diagnosis, measured in one rolled-back transaction.** Not inferred — run against
production as both roles:

```
anon     agent_decisions = REJECTED 42501     ← insufficient_privilege
anon     agent_runs      = REJECTED 42501
anon     pos_products visible =     0
service  agent_decisions = ACCEPTED
service  agent_runs      = ACCEPTED
service  pos_products visible =    74
```

**`42501` is the whole story.** Never a bad insert, never a missing column — an unauthorised one.

**3. ⚠️ It was not six call sites, it was 26.** M13C recommended this fix and said *"six call sites
to audit"* — that came from a partial grep, and this sprint would have been built on it. Measured:
**ten user-facing routes and fifteen crons, 26 `new …Agent()` lines.** The good news inside that
correction: **the split is perfectly clean.** Every route already builds a session client, every cron
already holds `supabaseAdmin`. Both sides always held exactly the client they should pass — they had
simply never passed it.

## WHAT CHANGED

```ts
// was
protected supabase = createServerSupabaseClient();   // anon key + cookies. A cron has no cookies.
// is
protected supabase: SupabaseClient;
constructor(supabase: SupabaseClient) { if (!supabase) throw …; this.supabase = supabase }
```

**No default — neither one.** `supabaseAdmin` as a default makes ten routes bypass RLS; the session
client as a default is the original bug verbatim. **`tsc` found the two call sites I had missed**
(both `runAgent`, the orchestrator called from both sides), which is the phase's verification working.

**WALL 8** now blocks a service-role client reaching an agent outside `src/app/api/cron/`, with one
named exception (`proposal-council.ts`, whose only importer is the council cron). Proven both ways
with byte-identical probe lines — fired in a route, silent under `cron/` — and the predicate lives in
`src/` so the test **calls** it rather than grepping the guard.

## PROOF THE TEN ROUTES BEHAVE IDENTICALLY

**One changed line each**, every one of the form `new XAgent()` → `new XAgent(supabase)`, where
`supabase` is `createServerSupabaseClient()` — **the identical factory the old field called for
itself.** Same session, same user, same RLS; the agent now shares the route's instance instead of
building a second one from the same cookie store. Nothing else in those files changed. That is a
diff, not a claim.

## WHAT THE THREE BLIND AGENTS CAN NOW SEE

| table | as `anon` | as service role |
|---|---|---|
| `pos_products` (active) | **0** | **74** |
| `pos_sales` (completed) | **0** | **1,802** |
| `pos_sale_items` | **0** | **3,510** |
| `pos_suppliers` · `pos_outlets` | **0** · **0** | **2** · **2** |
| `pos_staff` (active) · `staff_members` | **0** · **0** | **5** · **4** |
| `pos_rosters` · `competitor_price_cache` | 0 · 0 | **0** · **0** — genuinely empty |

**Every zero on the left was a lie the database was telling them.** All three can now complete their
logic: `reorder` fully, `pricing` through its own documented empty-competitor-cache fallback,
`schedule` on both its read gates.

**⚠️ One new write to watch:** `schedule-agent.ts:178` upserts `pos_rosters`, a table with 0 rows, and
that write has never once succeeded. The rows are `published: false` drafts, so nothing reaches staff
until a human publishes.

**Nothing can execute.** All nine configured agents are `mode = 'suggest'`,
`auto_approve_below_cents = 0`, and `executeProposal` runs only inside `if (mode === 'auto')`.
Verified from live data, not assumed.

## WHAT IS STILL UNPROVEN, SAID PLAINLY

That 12:00 run wrote its row and produced **0 decisions with no model call**. Reading the agent,
that means it stopped either at a per-product `continue` (nothing needed reordering) **or** at the
`if (!products?.length)` guard. **Those two produce an identical row and I cannot tell them apart
from this observation.** The reasoning says it saw the 74 products; reasoning is not observation.

**Tonight's 20:00 UTC council distinguishes them**, because M13C's health block records per-agent
outcomes and a rejected save now throws instead of returning `[]`. Four queries to run tomorrow are
at the end of phase 5.

**M13C's recommendation — fix, don't retire — still holds, and more strongly:** part of it has
stopped being a prediction and become an observation.

## TWO THINGS FOUND ON THE WAY, NEITHER IN SCOPE

- **`docs/aria/ARIA-ARCHITECTURE-AUDIT.md` now exists** — dated 5 Sep, 13 KB, **untracked**. Three
  sprints reported it missing and re-measured everything from the code instead. Not committed: it is
  the founder's file to place.
- **⚠️ `canon-rail-guard --working-tree` runs `git add -N .`**, intent-to-adding every untracked file
  in the repo — about forty here, including `pw-report*-extracted/` and four `vt*.log`s. Deliberate
  (it is how the guard sees new files) but it primes the index with exactly the junk CLAUDE.md warns
  has been swept into a commit before. **I cleared the index after each use and verified every
  commit's file list** — phase 3 committed 4 files, phase 4 committed 1.

## MY OWN ERROR THIS RUN

**The rule's own file failed the rule.** `service-role-rule.ts` spelled both blocked shapes out
literally in a doc comment, and the guard flagged its own definition — twice. **Literal split, guard
untouched.** That is the fourth time in this series a scan has matched its own prose (M12 rule 9,
M13 rule 8, M13B's stream test, this).

---

Written incrementally as the run went — a halted run still leaves a readable log.

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

---

## PHASE 5 — THE MORNING AFTER ✅

**No code in this phase.**

### ⚠️ IT ALREADY HAPPENED. THE FIRST `agent_runs` ROW SINCE 4 JUNE LANDED WHILE THIS SPRINT WAS RUNNING.

I did not have to wait for tonight's council. Phase 2 was pushed at **11:36 UTC**; twenty-four
minutes later, with the deploy live, `/api/cron/[task]/reorder-daily` was invoked and this appeared:

```
business_id      ff5055a0-…  (Sip Café)
agent_type       reorder
triggered_by     cron
decisions_count  0
errors           null
started_at       2026-09-07 12:00:47 UTC
```

**`agent_runs` rows written since 5 June: 1. That is it.** Ninety-five days of nothing, then this,
twenty-four minutes after the fix deployed.

**The row's existence IS the proof.** Under the old code `logRun` wrote through the anon cookie
client, RLS answered `42501`, and no row could appear — which is precisely why the table stopped on
4 June. Under the new code `cron/[task]` passes `supabaseAdmin` and the write lands. Nothing else
changed between those two states.

**This is phase 3's VERIFY satisfied by a real production run rather than by the rolled-back probe I
fell back to.** I am glad to withdraw the "unverified" caveat on the write path.

### ⚠️ WHAT THAT RUN DOES *NOT* PROVE, stated plainly

`decisions_count: 0`, `errors: null`, and **no `aria_ai_calls` row anywhere near 12:00** — so reorder
completed cleanly and never reached its model call.

Reading the agent, 0 decisions with no model call means it stopped at one of the per-product
`continue`s — `avgDaily30 < MIN_AVG_DAILY` (too slow-moving) or `current >= reorderPoint` (enough
stock) — **or** at the `if (!products?.length)` guard on line 67.

**Those two produce an identical row, and I cannot tell them apart from this observation.** The chain
of reasoning says it saw the products — the new code ran (the row proves it), that path passes
`supabaseAdmin` (the code proves it), and service role sees 74 products (the probe proves it) — but
**reasoning is not observation, and this row does not distinguish the two.**

**Tonight's council will**, because M13C's health block records per-agent outcomes and phase 2 of
M13C makes a rejected save throw rather than return `[]`. That is the run to read.

### Against M13C's six sentences

M13C gave the narrative six cases. Before today it could only ever have reached `quiet` or
`unknown`, because agents that fail by returning an empty array are counted as having *reported*.
**After M13D it can reach the others**, because a rejected `agent_decisions` insert now throws and is
recorded as a failure with its Postgres reason.

If tonight reads *"All 14 overnight checks reported and nothing needs you today"*, that sentence is
now **earned** rather than fabricated — and the health block's `agents_failed: 0` is what makes the
difference checkable. That was the tell M13C phase 5 named, and it still is.

### Does "fix, don't retire" still hold? **Yes — more strongly than when it was written.**

M13C recommended it on the strength of the machinery being complete. One thing has changed since:
**the machinery has now demonstrably written to the database for the first time in 95 days.** The
recommendation is no longer a prediction about what a fix would do; part of it is an observation.

What remains unproven is the *output* — whether these agents, with sight restored, actually produce
useful proposals. **Tonight answers that**, and it costs about twenty cents a quarter to find out.

### What to run tomorrow morning

```sql
-- 1. the sentence the owner reads, and the health block behind it
select session_date, plan_narrative,
       plan->'agent_health'->>'agents_reported' as reported,
       plan->'agent_health'->>'agents_failed'   as failed,
       plan->'agent_health'->'failures'         as failures
from agent_council_sessions
where business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
order by session_date desc limit 2;

-- 2. per-agent, the first real picture in 95 days
select agent_type, triggered_by, decisions_count, errors, started_at
from agent_runs where started_at > now() - interval '1 day' order by started_at desc;

-- 3. anything proposed — read it, do not execute it. mode is 'suggest' on all nine agents.
select p.agent_type, p.proposal_type, p.urgency, p.projected_impact_dollars, p.proposal_data
from agent_council_proposals p
join agent_council_sessions s on s.id = p.session_id
where s.session_date = current_date order by p.projected_impact_dollars desc;

-- 4. the write that has never once succeeded
select count(*) from pos_rosters where generated_by_agent;
```

**Nothing in tonight's run can execute.** All nine configured agents are `mode = 'suggest'` with
`auto_approve_below_cents = 0`, and `proposal-council.ts` calls `executeProposal` only inside
`if (mode === 'auto')`.

### Two things found while working, neither in scope

- **⚠️ `docs/aria/ARIA-ARCHITECTURE-AUDIT.md` now exists** — dated 5 Sep, 13 KB, **untracked**. Three
  sprints (M13, M13B, M13C) reported it missing and re-measured every number from the code instead.
  It is in the working tree but not in git, so nothing here depends on it and I have not committed
  it — it is the founder's file to place.
- **⚠️ `canon-rail-guard.ts --working-tree` runs `git add -N .`**, which intent-to-adds **every**
  untracked file in the repo — about forty of them here, including `pw-report*-extracted/`,
  `canopy/` and four `vt*.log`s. It is best-effort and deliberate (it is how the guard sees new
  files), but it leaves the index primed with exactly the junk CLAUDE.md warns has been swept into a
  commit before. **I cleared the index after each use and verified every commit's file list**; phase
  3 committed 4 files and phase 4 committed 1. Worth knowing before someone runs the guard and then
  `git commit -a`.
