# RUN-MS14 — ENFORCEMENT (INERT) + ONBOARDING THAT TEACHES ARIA (autonomous, 2026-08)

## Summary (read this first)

**All six phases done. Nothing parked (one limit deliberately left without a number — see below).
Six commits.** MS13 verified landed before starting: the two-tenant fixture, the agent overlay and
the seven fixed routes are all present on `main`.

| Phase | What | Commit |
|---|---|---|
| 1 | One limits table per tier, derived from `plans.ts` | `c1c08076` |
| 2 | Enforcement wired at real gates, **flag-off and provably inert** | `8a795e36` |
| 3 | Metering fixed — `usage_logs` was empty because the insert never dispatched | `67993266` |
| 4 | House Rules as versioned memory (`superseded_by`, never overwritten) | this run |
| 5 | Onboarding asks; Aria reads back what it now knows | this run |
| 6 | Every surface reads the rules — and the promo path **enforces** them | this run |

### The per-tier limits, as shipped

| tier | outlets | staff | agents | routines | AI budget / mo |
|---|---|---|---|---|---|
| starter | 1 | 5 | 2 | 2 | $20 |
| growth | 3 | 15 | 5 | 5 | $50 |
| pro | unlimited | unlimited | unlimited | unlimited | $120 |
| **autonomous** | *(alias of pro — a live tier that appears in no plan file)* | | | | |

Not one of those numbers is defined in the new module: every value is read from
`billing/plans.ts`, and a test asserts the file contains **no numeric literal for any limit**, so
a second source cannot creep in. **`reels` was deliberately left without a number** — no per-tier
reel allowance exists anywhere in `src/`, and the decision table says park rather than invent.
`PARKED_LIMITS` names it with the reason; it needs a founder number before it can be enforced.

### Enforcement is flag-off, and inert is PROVEN not asserted

`ARIA_LIMITS_ENFORCE` defaults off and this sprint does not set it. Three independent proofs:
1. the flag reads off for unset **and** for every truthy-looking value except the exact `'1'`;
2. `checkLimit` returns allowed **before any I/O** — proven by making the entitlement module
   *throw if consulted* and asserting it never was. No lookup, no latency, no behaviour change;
3. a count of 10,000 of everything is still allowed while off.

Arming it is one env var, no code change. Armed, refusals name the limit, the count and the tier
that lifts it. **It also fails open**: an entitlement error allows the action, because the failure
mode of a billing check must be "the customer keeps working", not "locked out by our outage".

**Three things Chahat most needs to know:**
1. **Nothing has ever been metered, and now it is.** `usage_logs` held zero rows despite five live
   callers because `trackUsage` dispatched its insert as `void builder` — and a PostgREST builder
   only issues its request inside `then()` (verified in the installed package source, not from
   memory). The builder was constructed and thrown away, every time, silently. It now dispatches,
   still without blocking; outlet/staff/agent/routine creation are metered, and the metadata
   sanitiser drops customer names, emails, phones and message bodies at the library rather than
   trusting call sites.
2. **Onboarding now teaches Aria, and Aria proves it heard.** Five optional questions in the
   owner's own words become House Rules; the wizard reads back exactly what it will store, using
   the same pure function the server uses to store it. Skipping is a real answer — an unanswered
   question stores nothing, no default, no guess. Aria never authors a rule.
3. **"Never discount coffee" is enforced, not just prompted.** The rules reach every surface that
   forms advice — including the council/briefing lane, which carried **no memory of any kind**
   before this run (the ASK-ARIA-AUDIT-1 finding) — and the promo judge now *rejects* a
   conflicting suggestion before the economic checks run, naming the owner's own rule back to
   them. The guard's scope is stated and narrow on purpose: it understands the never-discount
   class of rule and does not pretend to parse every English sentence into a machine check.

---

## Phase log

### Phase 1 — WHAT EACH PLAN ACTUALLY ALLOWS (`c1c08076`)
`src/lib/billing/limits.ts`, derived entirely from `plans.ts`, resolved through `normalizePlan` so
the live `autonomous` tier — a real row that exists in no plan file — gets a **complete** set
rather than an undefined one. Under enforcement, an unresolved tier is an account lockout.
`tierThatLifts()` skips a tier that would still be too small: telling an owner "growth lifts this"
when growth caps at 3 and they need 10 is a lie they pay for.
**Mutation:** removing a tier's limits → 4 assertions red.
*Recorded:* one test assertion contradicted its own comment and failed — the **code** was right;
the test was corrected, with the episode left in the file.

### Phase 2 — ENFORCEMENT, FLAG-OFF (`8a795e36`)
Wired at two real gates (outlet creation, staff creation — staff counted **active only**, so an
archived leaver never consumes a seat). NOT-SCOPE honoured: nothing enabled, no paywall UI.
MS13's agent cap stays armed and unchanged (RULE 0) — it is the one limit that provably cannot
gate anyone out today, because zero `kind='agent'` rows exist.
**Mutation:** defaulting the flag on → 5 assertions red.

### Phase 3 — METERING (`67993266`)
The `void`-on-a-lazy-builder bug above, fixed with `.then()` plus a mandatory rejection handler
(without one a failed insert becomes an unhandled rejection, i.e. telemetry crashing the action it
measures). Metered at the creation points, **after** each error check so a failed insert is never
counted. AI spend deliberately **not** double-metered — `aria_ai_calls`/`aria_monthly_spend`
already measure it, and a second source drifts.
**Mutation:** making the write blocking → 2 assertions red.
*Recorded:* the first source-level assertion I wrote **matched the fixed code** (a `[^;]*` ran
past the `.then`) — it would have passed on the bug and failed on the fix. Replaced with a
positive assertion, episode left in the test.

### Phase 4 — HOUSE RULES AS MEMORY
A `kind='house_rule'` in `aria_business_memory` — **no new table**, as the brief established.
Editing **supersedes**: the new wording is inserted first (so there is never a gap with no rule in
force), then the old row is retired with the *exact* shape the pattern-memory cron already uses
(`is_active=false` + `deleted_at` + `deleted_reason='superseded'` + `superseded_by`), which means
every existing reader hides old versions automatically with **zero reader changes**. The previous
wording stays readable — "we used to round to $0.05" is exactly what an owner needs to look up.
**Mutation:** overwriting in place → 4 assertions red.

### Phase 5 — ONBOARDING ASKS, AND ARIA READS IT BACK
Five optional questions appended as a **fifth** wizard step — appended last so every existing step
keeps its index and an in-progress wizard resumes where it was; an existing business is never sent
back through onboarding. Derivation is a pure module: free-text answers are stored **verbatim**,
the one numeric answer becomes the owner's number in a plain sentence, and an unanswered question
(or the placeholder echoed back) produces nothing. Persistence happens once, server-side at
provisioning, is idempotent against retries, and is non-fatal — a business must never fail to
provision because a memory row did not write.

### Phase 6 — EVERY AGENT READS THE RULES
Rules now reach: the **ask** lane (fetched in their own right so they never lose a top-15
importance slot to an inferred pattern; injected below the IRON RULES and grounding, above any
agent overlay), the **council/briefing** lane (which had no memory at all before), and the
**promo** path — where they are *enforced* by `house-rule-guard.ts` in the judge, before the
economic checks, because a rule the owner set outranks a suggestion that would merely be
profitable. The guard fails **open** on a lookup error: a silent, unexplained refusal is worse
than the suggestion it was meant to stop.
**Mutation:** dropping rules from context assembly → red.

---

## Deviations & findings
- **Verification standard, stated plainly:** the new onboarding step compiles and its logic is
  tested through the same pure functions the server uses, but it was **not rendered in a browser**
  in this environment. What Chahat should eyeball: the fifth step's five inputs and the "ARIA"
  readback panel beneath them.
- No DDL. `house_rule` is a value in an existing column; no migration was needed or written.
- The metering fix means `usage_logs` will start filling immediately on deploy — the first rows
  ever. Expect it to be the evidence base for whether the phase-1 limits are the right numbers.
