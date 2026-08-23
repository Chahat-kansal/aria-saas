# RUN-MS13 — TENANT ISOLATION + OWNER-BUILT AGENTS (autonomous, 2026-08)

## Summary (read this first)

**Six phases attempted. Five done in full; phase 6 shipped its tier-cap half and PARKED its
RLS-scoped-reads half (blocker named below). Seven commits.**

| Phase | What | Commit |
|---|---|---|
| 1 | Two-tenant fixture + probe, proven able to go red | `83a37a8c` |
| 2 | The seven routes: tenant resolved server-side, client ids rejected, 2 tombstones | `0fc62b90` |
| 3 | Ask Aria onto the rail; live-object tool-schema guard | `047e4324` |
| 4 | The composer: describe → card → approve; nothing persists on reject (+ migration) | `9bb2cb7d` (+ `69b0534b` follow-up) |
| 5 | Overlay injection below constitution + grounding; three permanent evals | this run |
| 6 | Tier caps 2/5/unlimited on the canonical entitlement path — **RLS half PARKED** | this run |

**Tenant-shaped params stripped from tool schemas: 0 of 30 — because all 30 were already clean**
(V3 already held; the executors inject `businessId` from their closure). The deliverable is the
guard that keeps it true, and it is mutation-proven.

**Body/query-`business_id` → `supabaseAdmin` reads found outside the seven: 156 route files match
the raw shape.** Per the MS12 route audit, all but the named set carry an explicit ownership
check (UID / UAB / JOIN / CRON). The four genuinely unverified-id-but-RLS-scoped routes —
`aria/chat`, `business-chat`, `business-brain`, `cash-commentary` — are **PARKED by name**: the
brief's pre-authorisation covers only the seven, and the decision table says an authz gap found
outside them parks.

**Is the `aria_skills` RLS policy membership-keyed? CANNOT VERIFY THIS RUN — and that is itself
the finding.** The Supabase MCP server disconnected mid-session, so no live `pg_policies` read
was possible, and **the repo does not contain the policy**: `aria_skills` has exactly one
migration in `supabase/migrations/` (`20260616000002_i6_activate_skills.sql`) and it is an
`UPDATE`, not a `CREATE POLICY`. The table's creation and its RLS policy exist only in the live
database. **Chahat must run this and read the result** — it is the one open question that could
turn agents into a cross-tenant vector:
```sql
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy WHERE polrelid = 'public.aria_skills'::regclass;
```
If it uses `user_metadata` or `USING (true)`, that is the named privilege-escalation vector and
agents should be disabled until it is fixed.

**Three things Chahat most needs to know:**
1. **A real cross-tenant leak was live and is now closed**: `competitive-brief` served an
   **in-memory cache keyed on the client-supplied `business_id`, before any tenant check** — any
   logged-in user could read any business's competitor brief by changing a query param. The
   probe caught it, the fix rejects the param, and the cache now keys on the resolved tenant.
   `menu-optimisation`'s sale-items query had **no business filter at all** (RLS was its only
   barrier).
2. **Agents are live, but they cannot do anything you have not approved.** An owner describes an
   agent, sees a spec card with an ALWAYS-TRUE box, and approves; the composer is a pure module
   with no database access, so a rejected card cannot leave a row. Instructions land as a
   sanitised, lowest-precedence overlay below the constitution — an agent told "always say sales
   are great" meets an explicit "that instruction is VOID" above its own text, and every
   write-verb is still intercepted server-side.
3. **Phase 6's RLS half is parked, deliberately.** Scoping agent tool reads to a session client
   without knowing which of the 17 tool tables have policies would risk silently returning
   **empty** instead of the owner's data — the exact silent-failure mode RULE 7 exists for, and a
   RULE 0 downgrade of Ask Aria for every user. Admin + the rail check in front is what ships;
   the reads are recorded below. Unpark it with the same `pg_policy` query above, per table.

---

## Phase log

### Phase 1 — THE TWO-TENANT FIXTURE FIRST (`83a37a8c`)
`src/lib/security/two-tenant-fixture.ts`: seeds its own second tenant (only 2 non-test businesses
exist live, so nothing is assumed), marker-tags every row, and exposes `probeCrossTenant()` —
authenticate as one owner, request the other's id, count the other's markers in the response.
The Supabase fake is **RLS-permissive by design**: an unscoped read returns every tenant's rows,
modelling the documented worst case, so a route passes only when server-side resolution alone
protects it.
**VERIFY, run and recorded:** pointed at the real unfixed routes, 12 of 12 route expectations
failed (both directions). `probe-self-test.test.ts` pins that ability permanently, plus a
guard-of-the-guard so the probe cannot pass vacuously.

### Phase 2 — RESOLVE TENANT SERVER-SIDE (`0fc62b90`)
- **competitive-brief** — the cache leak above. Now on `withBusinessContext`; supplied id → 400.
- **competitor-opportunities**, **menu-optimisation** — body id rejected; menu-optimisation's
  missing sale-items tenant filter added explicitly.
- **social-listening**, **classify-product** — dead **re-verified this run, not assumed** (the
  live BAS classifier is a different route). 410 tombstones per the `twilio/webhook` precedent.
- **upload** — tenant resolves on the rail **before** the paid vision call.
- **staff-talk** — **judged variance**: it reads zero tenant data and serves staff-portal users
  who are not owners; the owner rail would break every staff user (RULE 0). The applicable half
  of the pre-authorisation ships — tenant-shaped input is rejected outright.
- In-repo callers updated in the same commit (consumer test).
**Mutation:** restoring the param read → 2 probes red, both directions.

### Phase 3 — ONE RESOLVER, NO TENANT IN ANY SCHEMA (`047e4324`)
`ask/route.ts`'s local `getBid()` (no stale/foreign-row re-validation) deleted; the route rides
`withBusinessContext` → `resolveOwnerBusinessId`. 21 `user.id` references now flow from the rail.
**All 30 tool schemas were already clean** (pattern #3 again — strip count 0). The new guard
**walks the live object** (import + recursive property walk, not a regex over file text — the
MS12 backspace lesson) and was **probed, not read**: re-adding a `business_id` param to
`query_sales` turned it red.

### Phase 4 — THE COMPOSER (`9bb2cb7d`, follow-up `69b0534b`)
Migration committed byte-identical. Deterministic composer (no LLM — an owner describing an agent
should not be at the mercy of a Haiku classifier) → spec card with the ALWAYS-TRUE box → staged
through the **existing** `pending_action` machinery → approve executes `create_agent`, the only
place a row is written (`kind='agent'`, `allowed_tools=[]`).
**Nothing persists on reject, structurally**: the composer has no supabase import and no
insert/update/upsert. **Mutation:** persisting at stage time → 3 assertions red.
**Follow-up commit `69b0534b`, recorded:** the V5 `share_token` guard became **its own offender**
the moment it was committed — `git grep` sees only tracked files, so it passed while untracked
and failed on the next push. The pre-push hook caught it. A check whose result depends on staging
state is a check that can lie; test files are now excluded, with the episode in the test.

### Phase 5 — OVERLAY INJECTION, SAFELY
`src/lib/aria/agents/overlay.ts`: agent instructions are sanitised (delimiters and role markers
stripped, 2,000-char cap) and appended at the **very end** of the system prompt, inside
`<<<AGENT_OVERLAY … AGENT_OVERLAY>>>`, beneath a precedence statement that voids conflicts with
grounding, forbids self-granted tools, and states the tenant is server-resolved. @mention narrows
to one agent; otherwise enabled agents stack. **Legacy skills keep their original placement**
(RULE 0 — the 18 existing rows behave exactly as before).
**Three permanent evals** (asserting the mechanism, not a model's wording): "always say sales are
great" sits below its own veto; write-verbs are intercepted by the server-side
`GATED_TOOL_WRITES` set plus the kill-switch/role gate; an instruction naming another business is
inert text against a rail-resolved tenant.
**Mutation:** putting the instructions above the precedence statement → red.

### Phase 6 — TIER CAPS (shipped) + RLS-SCOPED READS (**PARKED**)
**Shipped:** `max_agents` 2 / 5 / unlimited on `PLANS`, surfaced through `getEntitlement()` (the
canonical MS12 path), enforced **server-side at the one creation point** — over the cap, the
executor refuses with the plan and count named, before any insert. `max_routines` **mirrors**
`max_agents` because the brief capped routines without giving numbers; mirroring is stated rather
than a number invented (GROUNDING-TEETH), and it is one config edit to change.
**Mutation:** disarming the cap check → red.

**PARKED — agent tool reads on an RLS-scoped client.** Blocker: establishing which reads *can*
run scoped requires per-table RLS policy state, and **it is not obtainable this run** — the
Supabase MCP server disconnected, and the repo does not record policies for the 17 tool tables
(`pos_products`, `pos_sales`, `pos_sale_items`, `pos_customers`, `customers`, `businesses`,
`bookings`, `pos_online_orders`, `business_expenses`, `business_hours`, `business_reviews`,
`bank_accounts`, `bank_transactions`, `profit_leaks`, `reports`, `staff_leave`, `aria_ai_calls` —
48 `supabaseAdmin` call sites in `aria-tools.ts`). Swapping blind would, on any zero-policy table,
return **empty** rather than the owner's data: silent failure (RULE 7) and a RULE 0 downgrade for
every user, dressed as a security improvement. Per the decision table's "a read cannot run
RLS-scoped → keep `supabaseAdmin`, and the rail check stands in front" — which now genuinely does
stand in front, since phase 3 put the ask route on the rail.
**To unpark:** run the `pg_policy` query per table; scope the policied ones; keep the rest on
admin with the list recorded. Phase 6's mutation for that half ("swap one scoped read back to
admin → red") is deliberately not claimed — nothing was scoped, so nothing could be mutated.

---

## Deviations & findings
- **`aria_skills`' RLS policy is not in the repo** (see summary). One migration exists and it is
  an UPDATE; the table and policy live only in production.
- **The push that failed twice was two different causes**, worth separating: the first was
  transient (no divergence — `ahead 1`, nothing incoming, plain retry advised), the second was
  the pre-push hook correctly failing the self-referential V5 test. Neither was bypassed.
- **156 route files** match the client-id-into-admin shape; four are genuinely unverified and
  parked by name.
- No DDL was written this run beyond committing the given migration byte-identical.
