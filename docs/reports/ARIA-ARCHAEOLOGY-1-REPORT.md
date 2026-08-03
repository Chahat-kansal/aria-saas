# ARIA-ARCHAEOLOGY-1 — Root-Cause Investigation

Read-only sprint. No source files edited, no commits, no deployments. All counts below were run
against `c:\Users\kansa\aria-saas-audit` (remote `Chahat-kansal/aria-saas`) on 2026-07-17 via direct
grep/git and 4 parallel research passes; a handful of counts were independently re-verified by hand
after the fact (noted where relevant).

---

## PART 0 — wrong stack, or right stack used wrong?

The stack is not the problem. Every count below is about usage discipline, not Next.js/Supabase/Vercel
capability.

### 0(a) — Canonical data-access layer: exists in theory, ignored in practice, for every fact checked

| Fact | Canonical helper | Created | Adopters | Non-adopters (still ad-hoc) |
|---|---|---|---|---|
| Revenue sums | `getRevenueSnapshot()` / `revenue-snapshot.ts` | 2026-07-15 | **3 files** import it | ~50 files inline-sum `total_amount` directly; 191 files touch `pos_sales` at all |
| Typed compute result | `ComputeResult<T>`/`Provenance`/`Grounding` (`src/lib/aria/compute/provenance.ts`) | 2026-07-16 (**one day** before this investigation) | **7 files** | ~160+ candidate revenue/stock/customer call sites return ad-hoc inline shapes |
| business_id resolution | *(see below — not one helper, but six)* | — | 33 + 18 = **51 files** across the two most-adopted versions | **~329-341 files** still define their own local `getBid`/`getBusinessId`/`getBiz` |
| Business health / composite score | none ever built | — | — | **3 non-agreeing computation sites** (below) |

**business_id resolution is worse than "one ignored helper" — it's six independently-invented
resolvers, built by different sprints, largely unaware of each other:**
1. `src/lib/community/resolveOwnerBusinessId.ts` (2026-06-19) — its own header comment: *"replaces 16
   divergent inline getBid() copies."* Adopted by 18 files, scoped only to `api/community/owner/*`.
2. `src/lib/auth/get-bid.ts` (2026-07-13) — its own header comment: *"canonical replacement for the
   getBid()/getBiz() helper independently copy-pasted into 362 route files."* Adopted by 33 files.
   **Its own header comment does not mention #1 exists.**
3. `src/lib/active-business.ts` (`getActiveBusinessId`, 2026-04-26)
4. `src/lib/auth/verify-business-access.ts` (2026-06-15)
5. `src/lib/aria/get-business-context.ts` (2026-05-12)
6. `src/lib/aria/ask/business-context.ts` (2026-05-18)

Meanwhile **329 files today** still define `async function getBid(...)` (or equivalent) inline —
down only slightly from the 362 counted by fix #2's own commit four days ago, because new routes keep
adding fresh inline copies faster than any migration effort retires old ones.

**Business-health has three computation sites that would disagree on the same business by
construction:**
- `src/app/api/aria/business-health-quick/route.ts:44-164` — deterministic: `100 −` fixed deductions
  for stockouts/lapsed customers/unanswered reviews/visa expiry/revenue drop, clamped 0-100, graded
  A-D by fixed thresholds. Pure arithmetic, no LLM.
- `src/lib/aria/business-brain.ts:53-306` (feeds `MorningCommandCentre.tsx`'s "Business Health Score"
  panel) — `business_health_score` is **not computed by any formula in code at all**. It's a raw
  number an LLM returns in free-form JSON, only clamped `Math.max(0, Math.min(100, value))`. No
  weights, no enumerated inputs, no run-to-run consistency guarantee.
- `src/lib/aria/get-business-context.ts:654-675` — a *third*, same-named `health_score` field, sourced
  from `aria_seo_context.health_score` — an unrelated technical-SEO-crawl metric, not a business
  composite at all. Same field name, different domain — a collision risk if any caller conflates them.

The `neq('voided')`/RULE-6 filter bug (a special case of "no canonical helper" for the "is this sale
real" fact): **120 occurrences across 77 distinct files.** Of those 77, only **7 show any evidence of
prior remediation** — and even those 7 are *half-fixed*: one query in the file was corrected, sibling
queries in the *same file* were left broken (e.g. `src/lib/aria-tools.ts` fixed line 462, left 10 more
`neq('voided')` calls at lines 633-1629; `pos/reports/[type]/route.ts` fixed one query, left 3 more).
**70 of 77 files have never been touched at all.**

### 0(b) — supabaseAdmin: the default, not the exception

| Metric | Count | % |
|---|---|---|
| Total `route.ts` under `src/app/api/**` | **1,180** | — |
| Import `supabaseAdmin` (either of 2 export surfaces — see below) | **602** | **51.0%** |
| Import `createServerSupabaseClient` (RLS-respecting) | 927 | 78.6% |
| Import `supabaseAdmin` with **zero RLS-aware path in the same file** | **180** | **15.3%** of all routes |

Over half of all API routes use the service-role, RLS-bypassing client. 180 files (15%) have no
RLS-respecting code path in the file at all — for those, correctness depends 100% on a manual
ownership check, with no database-level backstop of any kind. BUG-HUNT-1/2/3 (prior sprints) found and
fixed the subset of these that were provably exploitable; this count says the underlying *pattern* is
roughly 12x larger than the 14 confirmed-exploitable findings those sprints fixed.

Also found: **two separate modules export a variable literally named `supabaseAdmin`**
(`src/lib/supabase-admin.ts`, documented; `src/lib/supabase.ts`, an undocumented duplicate wrapping the
same lazy service-role factory) — 4 files (`pos/customer-greet`, `visa/monitor`, `widget/chat`,
`widget/config`) import the undocumented one. Same bypass, a second, unaudited import surface.

### 0(c) — Race conditions: some fixed correctly, siblings left broken (same pattern as 0a/0b)

The canonical stock mover (`src/lib/inventory/outlet-stock.ts`) and loyalty earn/reverse
(`earnOnSale`/`reverseEarnOnSale`) already use atomic Postgres RPCs
(`increment_numeric`/`decrement_numeric`/`set_numeric`) — proof the team knows how to do this
correctly. The gift-card charge path (`pos/payments/gift-card/route.ts`) was *explicitly* fixed this
way after a specific incident (comment references a prior cross-sale race).

Against that baseline, **5 genuinely-vulnerable read-modify-write sequences** (plain JS
`current + delta` then `.update()`, no atomic RPC, no row lock):

| # | File:line (read → write) | Column | Real-world impact of a lost update |
|---|---|---|---|
| 1 | `api/loyalty/redeem/route.ts:23 → 50-53` | `points_balance`, `stamps_count` | Customer effectively redeems twice for one deduction — real $ loss |
| 2 | `api/pos/loyalty/redeem/route.ts:30 → 55-61` | same columns, independently reimplemented | Same lost-update exposure on the POS-facing twin of #1 |
| 3 | `api/pos/balances/route.ts:41 → 46` | `pos_customers.balance` (store credit) | Same lost-update shape as gift-card, but this sibling "balance" column was never given the same fix |
| 4 | `api/quotes/[id]/view/route.ts:14 → 27` | `view_count` | Low severity — analytics undercounting only |
| 5 | `api/pos/stock/adjust/route.ts:53 → 55` | `pos_products.stock_quantity` (legacy display cache) | Canonical `items_on_hand` is already atomic in the same function; this is a stale secondary mirror that can drift under concurrent adjusts |

**Verdict**: not a knowledge gap (the atomic-RPC pattern is proven and used elsewhere) — an
enforcement gap. Exactly the same shape as 0(a)/0(b): a correct fix exists, applied to some call
sites, never propagated to siblings.

---

## PART 1 — origin of the pattern

**The repo did not start as this app.** Origin commit `97e158af` "Initia Commit" (2026-04-12) was an
unrelated Mongo/NextAuth "screenshot-to-code" tool. The pivot to Supabase-backed Aria OS happened at
`4dc33810` (2026-04-21). Supabase-backed API routes begin the next day.

**Patient zero, exact commit**: `0ca411e2` "Add AriaPOS module — full point-of-sale system"
(2026-04-22T16:22:03+10:00) defines `getBusinessId()` **independently in two files in the same
commit** (`pos/customers/route.ts`, `pos/products/route.ts`):
```ts
async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}
```
There was never a moment this logic existed in exactly one place — the copy-paste habit started on
the very first commit that introduced the concept, not later as codebase size grew.

Renamed `getBusinessId` → `getBid` 5.5 hours later (`f0061f1b`), pasted into a third file. The
`user_active_business` fallback (multi-business-per-user) is a separate lineage, first appearing
`392e85e8` (2026-04-23) as a plain switcher-UI upsert.

**The single most consequential commit**: `448646a7` "fix: correct active business lookup in all 15
POS API routes" (2026-04-27T14:05:50+10:00) merged the two lineages into today's familiar pattern
(`user_active_business` first, `businesses` fallback) — **and did so by pasting the same ~10-line
inline block into all 15 files, rather than extracting a shared function.** This is the moment the
codebase's *remediation style* — "fix the bug by copying the corrected code into every affected
file" — was established, and it is the exact style every subsequent fix sprint has followed since
(see below). `git log -S"async function getBid" --all` shows **178 commits** have touched that
signature string — i.e., roughly 178 separate times a file-local copy was (re)introduced or edited.

**The revenue-side twin bug**, first instance `f74e174e` (2026-05-06), ten days after the getBid
mass-copy fix. `CLAUDE.md` itself didn't exist until `6077f98f` (2026-05-31) — 25 days *after* the
bug's first instance — and when written, **it codified the wrong filter as correct**
(`status filter != 'voided'`). That wrong rule stood for 45 more days until `c8316dc2` (2026-07-15)
corrected it, roughly 2 hours after `getRevenueSnapshot()` was created the same day. **Gap between
first bad instance and first canonical fix: ~70 days.** Individual file-level cleanup was still
draining as late as 2026-07-16 — the day before this investigation.

**Timeline in one line**: copy-paste-per-file was the pattern from commit #1 of this feature area →
the first attempted *fix* for a duplication bug entrenched copy-paste further (15x, not 1x) → the
twin revenue bug ran for ~2.3 months before any canonical helper existed, partly *reinforced* by a
project-rules file that got the rule wrong for 45 of those days → the getBid duplication was
independently "fixed" twice (2026-06-19 and 2026-07-13) by sprints that didn't reference each other →
current state, one day after the newest canonical layer (`ComputeResult`/`Provenance`) was built, is
329 inline getBid copies and ~50 inline revenue sums still active.

---

## PART 2 — deeper than "many files have similar code"

### Finding 1 — the missing layer exists, but it's one day old and covers 7 of ~1,180 files
`src/lib/aria/compute/provenance.ts` was created 2026-07-16 — literally the day before this
investigation. It hasn't had time to propagate on its own merits, which is expected. The deeper
problem (Finding 3b) is that nothing will force it to propagate going forward either.

### Finding 2 — patient zero for getBid: not "never fixed," but "fixed twice, blind to itself"
This is the most damning single finding. Two independent canonical fixes
(`resolveOwnerBusinessId.ts`, 2026-06-19; `get-bid.ts`, 2026-07-13) were built roughly four weeks
apart. The second sprint's own header comment claims the definitive duplicate count (362 files) and
positions itself as *the* canonical replacement — with no reference to the first fix already existing.
Each is adopted only within its own narrow slice (18 files scoped to `community/owner/*`; 33 files
scoped to `pos/*`/`staff/*`). The raw duplicate count went **16 → 362 → 329 today**: consolidation
sprints migrate files slower than new routes add fresh inline copies. Six total independently-invented
"resolve this user's business" shapes exist in the repo today.

### Finding 3 — three structural reasons wiring keeps getting missed, all confirmed
**(a) No integration test asserts a cross-route outcome.** Every `e2e/*.spec.ts` and `tests/*.spec.ts`
found tests one layer in isolation (a sale row has correct totals; a chat response isn't an error
page). Zero tests assert "route A writes a row, route B was supposed to react to it downstream, does
it." This is exactly the shape of bug that let `onActionExecuted` sit disconnected for an entire
sprint cycle (INTEL-OUTCOME-1/2) — a test in this shape would have caught it same-day.

**(b) No single registration point.** `find` for any route manifest/registry/central router returns
nothing. Next.js file-based routing means a new `route.ts` requires zero references to any other file
in the codebase — no manifest entry, no router config, nothing that would put the other 167 existing
`aria/*` routes (or the compute layer, or the 5 other business-id resolvers) in front of the developer
adding a new one. This is *why* two sprints could build the identical fix twice without collision —
there is no artifact whose diff would have surfaced the collision.

**(c) Shared type exists, coverage is negligible.** `ComputeResult<T>`/`Provenance`/`Grounding` are a
real, well-designed shared type (confirmed via INTEL-TRUTH-1/INTEL-CONTRACT-1's own work building on
top of it) — used by 7 files against ~160+ plausible candidates.

### Finding 4 — the schema does force re-derivation, but the fix was already half-written and abandoned
`src/middleware.ts` (315 lines) resolves `user_active_business → businesses` **twice, inline, within
itself** — once for the `/dashboard` trial-gate block (~line 140), and again, near-verbatim, for the
`/pos/terminal` + `/api/pos/sale` block (~line 195). Both correctly compute the resolved business id
into a local variable — and then only use it to set trial/subscription-status response headers.
`grep -n "x-business-id" src/middleware.ts` → **zero matches**. `grep -rl "headers.get('x-business-id')"
src/app/api` → **zero files**. No git history shows this was ever attempted and reverted — it was
simply never tried.

The multi-business-per-user schema (`businesses.user_id` + `user_active_business` for "which one is
active right now") is a legitimate product requirement, not a mistake — but it does mean every route
needs the resolution. The codebase's own middleware already runs that exact resolution on nearly
every request path and throws the result away. Propagating it (one `requestHeaders.set('x-business-id',
resolved)` call, already computed, already in scope) would have made the entire 329-file getBid
duplication structurally unnecessary — this was one line away, on a path already executing per-request,
and it was never attempted.

---

## PART 3 — FORCED VERDICT + SIZE OF FIX

**One root cause, not N issues sharing a style.** Every duplicated-fact symptom investigated — revenue
sums, business_id resolution (×6 resolvers), business-health scoring, the `neq('voided')` filter, and
the un-atomic balance/stamp updates — traces to the identical structural gap, confirmed by the
identical failure signature recurring across all of them: **a correct, importable canonical helper
gets built in response to an incident, adoption never exceeds ~9-15%, and the raw duplicate count
keeps growing because nothing in the codebase's structure forces, tests for, or even flags a new file
skipping it.** The getBid saga is the sharpest proof: the same remediation approach was applied twice,
four weeks apart, by sprints unaware of each other's existence, because Next.js's file-based routing
gives every `route.ts` total freedom with zero forced touchpoints to any other file (Finding 3b) — the
same reason no test would ever catch a downstream wiring miss (Finding 3a), and the same reason
`middleware.ts` computes the fix's exact input twice per request and discards it both times
(Finding 4). The introducing decision was `448646a7` (2026-04-27): the first fix for a duplication bug
chose to copy the correction into 15 files rather than extract it once — establishing "fix in place"
as this codebase's default remediation style, which every later sprint (INTEL-COMPUTE-1,
resolveOwnerBusinessId, get-bid.ts, ComputeResult/Provenance) has faithfully continued, each building a
correct helper and none pairing it with a mechanism that makes non-adoption impossible or visible.

**Size: finishable on the current stack. This is not a framework or schema rewrite.** Three concrete
proofs this is tractable, not a rewrite-scale problem: (1) INTEL-COMPUTE-1 already proved the "build a
canonical compute function, call it everywhere" move works mechanically for revenue — the gap is
adoption, not capability; (2) `withErrorCapture` — a required wrapper convention already used by 926
of 1,180 route files (78.5%) — proves this codebase already has a forcing-mechanism pattern that
achieves far higher adoption than any plain importable helper has ever reached (9-15%), simply because
routes are structurally required to pass through it; (3) the atomic-RPC inventory/loyalty functions
prove the team already knows the correct pattern for every fact type in question — nothing here needs
new expertise, only a forcing mechanism paired with the helpers that already exist.

### Ranked structural fixes (not symptom patches)

1. **Extend `withErrorCapture` into a mandatory request-context wrapper** (e.g. `withBusinessContext`)
   that resolves + ownership-verifies `business_id` once (reusing `get-bid.ts`'s already-correct logic,
   or middleware's already-computed value) and injects it into the handler's arguments. Because 78.5%
   of routes already pass through `withErrorCapture`, extending that single chokepoint reaches an order
   of magnitude more files than a tenth new importable helper ever would.
2. **Add one CI/lint guard** that fails a build introducing a new inline `async function getBid`,
   `.neq('status','voided')`, or an ad-hoc `total_amount` sum outside the canonical helpers. This is the
   single most important gap across every fix attempted so far — every prior sprint built the helper,
   none built the guard rail that makes skipping it visible or blocked. Without this, fix #1 regresses
   exactly like #2-#6 already have.
3. **Consolidate the six existing business-id resolvers** into the wrapper from #1, explicitly retiring
   the other five (with #2 preventing a seventh from appearing).
4. **Same mandatory-wrapper treatment for `getRevenueSnapshot`/`ComputeResult`** — the compute layer
   already works when called; it needs #1's forcing mechanism, not a redesign.
5. **Finish propagating the atomic-RPC pattern** to the 5 remaining races (loyalty/redeem ×2,
   pos/balances, quotes/view, pos/stock/adjust's legacy mirror) — small and mechanical; the correct
   pattern is already proven three times over elsewhere in this same codebase.
6. **Reconcile business-health into one canonical formula** (the deterministic
   `business-health-quick` shape, not the LLM-free-form one with no code-visible weights) — same
   "extend an already-proven compute move" as #4, scoped to one more fact.
7. **(Process, not code) Add one integration test asserting a real cross-route outcome** — e.g. "an
   action reaching `executed` produces an outcome row a later process reads." This is the only
   mechanism that would catch the next "correct code, never wired in" instance before an audit finds it
   a sprint or two later, matching the pattern this bug class has already shown 3+ times
   (`onActionExecuted`, the dead Fair Work engine, the dead CLV input, the derived-unused ownership var).

A tempting quick fix was visible and deliberately not applied per this sprint's read-only rule: adding
`x-business-id` to middleware's two existing (currently-discarded) resolutions would look like an
instant win, but without #2's guard rail it would become a seventh resolver alongside the other six,
not a replacement for them — the guard rail, not another helper, is the actual missing piece.
