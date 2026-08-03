# CANON-RAIL-1 — The Enforcement Rail for Business-Context Resolution

Foundation sprint per ARIA-ARCHAEOLOGY-1's forced verdict: every duplicated-fact bug in this
codebase (6 business-id resolvers, 329 inline copies, 120 `neq('voided')` instances, 3
non-agreeing business-health scores) traces to one structural gap — canonical helpers get built
after an incident and adoption never exceeds ~9-15%, because nothing forces a new file to use
them. `withErrorCapture` — a required wrapper — sits at 78.5% adoption by contrast. This sprint
builds the rail (the forcing mechanism), the guard (the piece every prior fix skipped), and proves
both on a small, honest beachhead. **It does not mass-migrate the other ~320+ files — that is a
separate, later sprint**, exactly as scoped.

No divergence from ARIA-ARCHAEOLOGY-1-REPORT.md was found; this sprint followed its top-ranked fix
as written.

---

## Part 1 — the canonical primitive, and which resolver becomes it

**Primitive: business-id resolution** (per the report — the sharpest, most duplicated, and the one
SECURITY-CRITICAL-1..4 kept patching by hand at individual call sites).

**Resolver chosen: `resolveOwnerBusinessId()`** (`src/lib/community/resolveOwnerBusinessId.ts`,
2026-06-19), **not** `get-bid.ts` (2026-07-13), despite `get-bid.ts` having more current adopters
(33 files vs 18). Both check `user_active_business` first and fall back to the caller's oldest
active business — but only `resolveOwnerBusinessId()` **re-validates that the active-business row
still exists, is owned by this user, and is active** before trusting it:

```ts
if (active?.business_id) {
  const { data: valid } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', active.business_id as string)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (valid?.id) return valid.id as string
}
```

`get-bid.ts` trusts `user_active_business.business_id` directly with no such check — a stale or
foreign active-business row (e.g. left over after a business is deactivated or reassigned) would
be returned unvalidated. This is exactly the class of bug RULE 7 exists to prevent. Adoption count
does not override correctness when choosing what every future route will inherit through a
wrapper — a wrapper used by more files makes a resolution bug worse, not better, if the resolver
itself has a gap. `get-bid.ts` is not deleted (extend-never-remove) and is one of the five
resolvers a later migration sprint should retire.

---

## Part 2 — the rail

**`withBusinessContext()`**, added to `src/lib/api/with-error-capture.ts` alongside the existing
`withErrorCapture()` (which is **untouched** — not one line of its original body was edited; the
new function is purely additive in the same file). `withBusinessContext` composes
`withErrorCapture` (100% of its error-capture/logging/Sentry behavior is inherited, not
duplicated) and additionally:

1. Creates the request's Supabase client and reads the session.
2. Returns the standard `{ error: 'Unauthorized' }, 401` if there's no user.
3. Resolves `businessId` via `resolveOwnerBusinessId()`.
4. Returns the standard `{ error: 'No business' }, 400` if there's no business.
5. Calls the handler with a third argument, `{ supabase, userId, businessId }`.

A migrated route looks like:
```ts
async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  // straight to business logic — bid is already resolved and verified
}
export const POST = withBusinessContext('route/name', _POST)
```

This collapses the exact 4-line boilerplate (auth check → 401 → `getBid()` call → 400) that
appears in essentially every route this codebase has — the "path of least resistance" the sprint
asked for, riding the same import (`@/lib/api/with-error-capture`) every route already knows.

**Why this doesn't just become a 7th resolver nobody uses**: because it's *not* a new importable
helper competing for attention — it's additional capability on the wrapper 78.5% of routes already
call. A route reaching for `withErrorCapture` to get error capture now sees `withBusinessContext`
sitting right next to it in the same import, offering the same error capture *plus* resolved
business context, for the same one import. Part 3's guard is what prevents regression to option 1
(writing a local resolver instead).

**Existing-caller safety**: `withErrorCapture`'s function body is byte-identical to before this
sprint (verified — the diff for that function is empty; all new code is a separate, additional
exported function below it). All 926 existing `withErrorCapture` callers get unchanged behavior by
construction, not by testing a sample — there is nothing in their code path that changed.

---

## Part 3 — the guard

**`scripts/canon-rail-guard.ts`** — a git-diff scanner, not a whole-repo scanner. It only inspects
**added** lines (`git diff`'s `+` lines), so the ~329 pre-existing inline resolvers, ~120
`neq('voided')` instances, and existing ad-hoc revenue sums are grandfathered and never trip it —
this sprint's mandate was to enforce going forward, not to migrate the backlog.

Blocks three patterns in new lines:
1. A new file-local `function getBid(...)` / `getBusinessId(...)` / `getBiz(...)` (function or
   const-arrow form).
2. A new `.neq('status', 'voided')`.
3. A new hand-rolled revenue sum — conservative on purpose: only flags a file whose new lines
   contain **both** a `total_amount` reference **and** a `.reduce(` call, to avoid flagging a line
   that merely reads/displays `total_amount` without summing it.

Six paths are exempted (the canonical files themselves, which legitimately implement these
patterns under their own name): `resolveOwnerBusinessId.ts`, `get-bid.ts` (pending its own
retirement — a separate sprint, not blocked here), `with-error-capture.ts` (the rail itself calls
the resolver), `revenue-snapshot.ts`, `compute/`, and the guard script itself.

**Wired into CI**: `.github/workflows/canon-rail-guard.yml`, triggered on any PR touching
`src/**/*.ts(x)`, running `npx tsx scripts/canon-rail-guard.ts --base=origin/${{ github.base_ref }}`
— no Supabase/Vercel secrets needed, pure git-diff scan.

### Proof (run in this environment, both directions)

```
$ npx tsx scripts/canon-rail-guard.ts --working-tree
[canon-rail-guard] no new canonical-path violations introduced. Pass.
```

Then a deliberate violation file was added (`src/app/api/_scratch-canon-rail-test/route.ts`,
containing a fresh `async function getBid(...)`):
```
$ npx tsx scripts/canon-rail-guard.ts --working-tree
[canon-rail-guard] 1 new violation(s) found — these are NEW lines only, pre-existing code is grandfathered:

  src/app/api/_scratch-canon-rail-test/route.ts:5  [inline-business-id-resolver]
    async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {

EXIT CODE: 1
```

The scratch file was then deleted and the guard re-run, confirming a clean pass (exit 0) again.
Neither the scratch file nor any trace of it is part of this sprint's commit.

---

## Part 4 — beachhead (7 files, not a mass migration)

Every migrated handler was checked against its **exact** pre-migration failure-response shape
before moving it — a handler was only migrated if its unauthenticated/no-business responses
already matched `withBusinessContext`'s standard `{error:'Unauthorized'},401` /
`{error:'No business'},400` exactly. Where a handler in the same file had a *different* no-business
shape (returning an empty list with 200, say), that handler was left on its own local `getBid()` —
migrating it would have been a behavior change, which the sprint explicitly forbids.

| File | Handlers migrated | Handlers kept on local getBid (different response shape) | Notes |
|---|---|---|---|
| `aria/roster/notify/route.ts` | POST (only handler) | — | **SECURITY-CRITICAL-4's highest-severity finding** (B.1.2, cross-tenant staff PII → real SMS). The rail now provides the same business_id the manual fix relied on — this demonstrates the rail *subsumes* a fix that was previously hand-patched per-route. |
| `pos/production-plan/route.ts` | POST, PATCH | GET (`{plans:[]}` on no-business, not the standard 400) | PATCH is **SECURITY-CRITICAL-4 finding 1.4**, the `pos_production_plans` cross-tenant write. |
| `aria/roster/route.ts` | POST, PATCH, DELETE | GET (`{rosters:[]}` on no-business) | Same finding family as roster/notify. |
| `aria/booking-insights/route.ts` | GET (only handler) | — | Full migration, local `getBid()` deleted entirely. |
| `aria/auto-review/route.ts` | POST (only handler) | — | Full migration, local `getBid()` deleted entirely. |
| `aria/barcode-lookup/route.ts` | GET (only handler) | — | Full migration, local `getBid()` deleted entirely. |
| `aria/cashup-intelligence/route.ts` | POST (only handler) | — | Full migration, local `getBid()` deleted entirely. |

**11 handlers migrated across 7 files; 3 handlers (each in a file with other migrated handlers)
deliberately left on their pre-existing local `getBid()`** because their no-business response
contract differs from the standard shape — extending that behavior to match would be a scope
change beyond "prove the rail," not a beachhead.

**Verification (this environment has no live user session, so per this session's established
method — same one used in INTEL-OUTCOME-2/BUG-HUNT-3/SECURITY-CRITICAL-4 — verification is via
direct code inspection plus build/typecheck, not a live HTTP request):**
- Every migrated handler's business logic body is byte-identical to before, except the removed
  auth/getBid preamble — confirmed by direct diff read of all 7 files, reproduced in Part 4's table
  above.
- `resolveOwnerBusinessId()`'s resolution order (`user_active_business` first, then oldest active
  business) matches every migrated file's own prior local `getBid()` resolution order exactly, so
  the same business resolves for the same user in every migrated case — the only behavioral
  addition is the extra re-validation step (Part 1), which only changes outcomes for the
  stale/foreign-row edge case that `get-bid.ts`-style resolvers already had a gap on.
- `npx tsc --noEmit` — 0 errors across the full repo after all 7 migrations.
- `npm run build` — completed successfully (exit 0), full production build, no route errors.
- `npx tsx scripts/canon-rail-guard.ts --working-tree` — passes clean against the real migration
  diff (removing inline resolvers doesn't trip the guard; only *adding* new ones would).

---

## Adoption count — honest, not overclaimed

| | Count |
|---|---|
| Files using `withBusinessContext` after this sprint | **7** (11 handlers) |
| Files still defining their own local `getBid`/`getBusinessId`/`getBiz` | **~322-334** (329 measured by ARIA-ARCHAEOLOGY-1 one day earlier, minus the up-to-7 files this sprint touched, net of any drift from new commits in between) |
| `get-bid.ts` adopters not yet migrated | 33 |
| `resolveOwnerBusinessId.ts`'s pre-existing `community/owner/*` adopters (unaffected by this sprint) | 18 |

**The migration is not done, and this sprint does not claim it is.** What changed: the rail and the
guard now exist, are proven correct on a real, honest slice including the highest-severity prior
manual fix, and are wired into CI so every *new* route from this point forward either uses the rail
or fails its PR check. The ~322-334 remaining files are the explicit follow-up sprint's job, not
this one's.

## Build gate

`npx tsc --noEmit` — 0 errors. `npm run build` — succeeded (exit 0). Single commit, per sprint rule.
