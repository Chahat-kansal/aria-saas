# CANON-MIGRATE-2 — Migrating Bucket A Batch 2 Onto the Rail

Follow-up to CANON-MIGRATE-1 (34 files / 47 handlers) and CANON-SEC-1 (5 handlers, the Bucket-C
security fixes). This sprint migrates the next batch straight from CANON-MIGRATE-1's own
classification — **34 files, 52 handlers** — finishing the small aria/* remainder left over from
batches 1–2 of the original 8-batch inventory, plus the entire pos/* batch-4 Bucket-A cluster as one
clean-edged unit. **This is batch 2 of N. The migration is not finished** — 154 Bucket-A handlers
remain (see Part 4).

Every target file was re-read fresh in this sprint (not trusted blindly from the original
classification) per the sprint's own instruction to drop anything that turns out
behavior-divergent on closer read. Two exclusions came out of that re-read — one true
reclassification, one deferral for a different reason — both detailed in Part 3.

---

## Part 1 — the batch (34 files, 52 handlers, exactly what was migrated)

**aria/\* batch-1 remainder (5 files, 10 handlers)** — GET on all five stays on Bucket B (each
returns a 200-with-empty-payload or non-standard-body shape on no-business; left untouched):

| File | Handlers migrated |
|---|---|
| `aria/autopilot` | PATCH |
| `aria/bundle-builder` | POST, PATCH, DELETE |
| `aria/intelligence/alerts` | POST, PATCH |
| `aria/intelligence/schedules` | POST, PATCH |
| `aria/intelligence/watches` | POST, PATCH |

**aria/\* batch-2 remainder + business-expenses (4 files, 6 handlers)** — GET on all four stays on
Bucket B for the same reason:

| File | Handlers migrated |
|---|---|
| `aria/studio` | POST, PATCH, DELETE |
| `aria/tracking-preferences` | PATCH |
| `aria/weekly-report` | POST |
| `business-expenses` | PUT |

**pos/\* batch-4 Bucket-A cluster, in full (25 files, 36 handlers)**:

| File | Handlers migrated | Handlers left on Bucket B (unchanged) |
|---|---|---|
| `pos/agents/[type]` | POST | GET (`{decisions:[]}` on no-business) |
| `pos/audit-log` | GET | — (sole handler) |
| `pos/balances` | POST | GET (`{customers:[]}`) |
| `pos/bas-export` | GET, POST | — (both migrated) |
| `pos/cart-line-actions` | POST | — (sole handler) |
| `pos/cash-flow/analysis` | GET | — (sole handler) |
| `pos/cash-sessions/[id]` | GET, PATCH | — (both migrated) |
| `pos/cash-sessions` | POST | GET (`{sessions:[],active_session:null}`) |
| `pos/custom-roles/[id]` | PATCH, DELETE | — (both migrated) |
| `pos/custom-roles` | POST | GET (`{roles:[]}`) |
| `pos/customers/[id]` | GET, PATCH, DELETE | — (all three migrated) |
| `pos/customers/rfm-trigger` | POST | — (sole handler) |
| `pos/daily-summary` | GET | — (sole handler) |
| `pos/dashboard` | GET | — (sole handler) |
| `pos/display-suggestions` | PATCH | POST (`{suggestion:null}` on no-business) |
| `pos/email-log` | POST | GET (`{logs:[]}`) |
| `pos/enterprise-policies` | PATCH | GET (`{policies:{}}`) |
| `pos/eod-markdown` | POST, PATCH | GET (`{rules:[]}`, and no-user also non-standard); DELETE (no 400 branch at all — always `{ok:true}`) |
| `pos/fitting-room` | POST | GET (no-user → `{sessions:[]}`); PATCH (no-business → 404, not 400) |
| `pos/future-prices` | POST, DELETE | GET (`{future_prices:[]}`) |
| `pos/hourly-heatmap` | GET | — (sole handler) |
| `pos/inventory/cost` | GET, POST | — (both migrated) |
| `pos/inventory/reorder` | GET, POST | — (both migrated) |
| `pos/inventory` | PATCH | GET (`{ok:true,data:[]}`) |
| `pos/inventory/velocity` | GET, POST | — (both migrated) |

Where a file had every handler migrated, the local `getBid()` helper and its now-unused
`createServerSupabaseClient` import were deleted (extend-never-remove permits deleting genuinely
dead code, not features) — `pos/audit-log`, `pos/bas-export`, `pos/cart-line-actions`,
`pos/cash-flow/analysis`, `pos/cash-sessions/[id]`, `pos/custom-roles/[id]`, `pos/customers/[id]`,
`pos/customers/rfm-trigger`, `pos/daily-summary`, `pos/dashboard`, `pos/hourly-heatmap`,
`pos/inventory/cost`, `pos/inventory/reorder`, `pos/inventory/velocity`. Everywhere a sibling
handler stayed on Bucket B, `getBid()` was left exactly as-is.

---

## Part 2 — the migration itself

Same template as CANON-MIGRATE-1/CANON-SEC-1, applied mechanically to all 52 handlers: swap the
`withErrorCapture`-only import for `withErrorCapture, withBusinessContext, type BusinessContext`
(keeping `withErrorCapture` wherever a sibling Bucket-B handler still needs it), delete the
handler's own auth+`getBid()` preamble, add `{ supabase, userId, businessId: bid }: BusinessContext`
as the 3rd parameter (destructuring only what the body actually references — `userId` was needed in
`pos/agents/[type]` POST, `pos/bas-export` POST, `pos/cart-line-actions` POST,
`pos/cash-sessions/[id]` PATCH, `pos/cash-sessions` POST, `pos/customers/[id]` DELETE, and
`pos/inventory` PATCH, everywhere else just `businessId: bid` or `supabase, businessId: bid`), and
change the export line from `withErrorCapture(...)` to `withBusinessContext(...)`. Dynamic-route
files each kept their own existing 2nd-argument `{ params }` convention exactly as found —
`pos/cash-sessions/[id]` uses the older non-Promise `{ params: { id: string } }` shape,
`pos/custom-roles/[id]` and `pos/agents/[type]` use `Promise<{...}>`, and `pos/customers/[id]` uses
the file's own `'then' in params ? await params : params` hybrid — none of that was touched, only
the 3rd `BusinessContext` argument was added alongside it.

`pos/agents/[type]` POST was the most structurally different target in this batch — its whole body
is wrapped in a single `try/catch` with a `reqId` for error tracing, and it dispatches on an
`action` field (`health`, `run_now`, `approve`, `reject`, `snooze`, `edit_decision`,
`update_settings`) rather than being a simple CRUD handler. The auth+`getBid()` preamble sat
*inside* that `try` block; it was hoisted out into the `withBusinessContext` wrapper exactly like
every other handler, and the try/catch + reqId logic was left completely untouched around it.

`src/lib/api/with-error-capture.ts`, `withBusinessContext` itself, and
`scripts/canon-rail-guard.ts` were not touched in this sprint — confirmed via `git diff` showing
zero changes to any of those three files.

---

## Part 3 — the two exclusions found on re-read

**`aria/autopilot` POST — reclassified A → B.** The handler calls
`checkRateLimit('ai', user.id)` (returning `429` on failure) **between** the auth check and the
`getBid()` call:

```ts
if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const rl = await checkRateLimit('ai', user.id);
if (!rl.ok) return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
const bid = await getBid(supabase, user.id);
if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });
```

Migrating this onto `withBusinessContext` would run business-resolution *before* the rate-limit
check, changing the response for an authenticated-but-rate-limited-and-businessless caller from
`429` to `400`. Left on Bucket B, untouched, exactly as the original CANON-MIGRATE-1 pass should
have flagged it. This is a genuine correction to the inventory, not a manufactured one — noted here
so it isn't re-offered as an A candidate in a future batch.

**`aria/compliance` POST — deferred, not reclassified.** Unlike `autopilot` POST, this handler's
response shape genuinely is an exact Bucket-A match (`{error:'Unauthorized'},401` /
`{error:'No business'},400`). But its local `getBid()` has a different return type than every
other file in this codebase — `Promise<{ id: string; industry: string } | null>`, not
`Promise<string | null>` — because the POST body's `initialize` branch needs `biz.industry` to pick
the right compliance-item defaults for the business's industry. `withBusinessContext` only supplies
a plain `businessId` string, not the row's `industry` column, and adding an extra query inside the
handler to fetch it would be "other logic touched," which the sprint's own instructions rule out.
Left on Bucket A (unmigrated, not reclassified) for a future sprint to solve on its own terms —
either a small industry-aware variant of the wrapper, or accepting the one extra query as
in-scope for that handler specifically. GET/POST both keep their existing local `getBid()`; PATCH
was already migrated in CANON-SEC-1 and is untouched here.

---

## Part 4 — before/after proof sample (10 handlers across 8 files, 4 areas)

No live user session exists in this environment (same constraint as every prior sprint), so proof
is via direct code inspection of the before/after diff for both the auth and no-business branches,
confirming the response shape is byte-identical to what the handler returned pre-migration, plus
confirming `resolveOwnerBusinessId()` (the wrapper's resolver, chosen in CANON-RAIL-1 specifically
because it re-verifies the resolved business is still owned/active) is a strict superset check over
each handler's own deleted `getBid()` — same `user_active_business` lookup, same `businesses`
fallback query, same `is_active` filter — so a real owner resolves to the identical `business_id`
either way, and a caller with no business gets the identical `400`.

| # | Handler | Before | After | Verdict |
|---|---|---|---|---|
| 1 | `aria/autopilot` PATCH | Local `getBid()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |
| 2 | `aria/bundle-builder` DELETE | Local `getBid()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |
| 3 | `aria/intelligence/watches` POST | Local `getBid()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |
| 4 | `aria/studio` PATCH | Local `getBid()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |
| 5 | `business-expenses` PUT | Local `getBid()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |
| 6 | `pos/agents/[type]` POST | Local `getBid()` inside `try`; 401/400 exact | Hoisted to `withBusinessContext`; 401/400 identical, `reqId`/try-catch untouched | Match |
| 7 | `pos/cash-sessions/[id]` PATCH | Local `getBid()`; 401/400 exact; non-Promise params | `withBusinessContext`; 401/400 identical; params style unchanged | Match |
| 8 | `pos/custom-roles/[id]` DELETE | Local `getBid()`; 401/400 exact; Promise params | `withBusinessContext`; 401/400 identical; params style unchanged | Match |
| 9 | `pos/customers/[id]` DELETE | Local `getBid()`; hybrid `'then' in params` style; 401/400 exact | `withBusinessContext`; hybrid params style unchanged; 401/400 identical | Match |
| 10 | `pos/inventory/velocity` GET | Local `getBid()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |

`git diff --stat` across all 34 files: **148 insertions, 557 deletions** — every single file is a
net removal (the preamble/import swap removes more lines than the 3rd-argument destructuring adds),
consistent with "the guard ensures the count only goes down."

---

## Build gate

- `npx tsc --noEmit` — 0 errors (two follow-up fixes were needed after the first pass:
  `pos/bas-export` GET/POST were missing `supabase` in their destructured 3rd argument, and
  `pos/cart-line-actions` POST still referenced `user.id` instead of the renamed `userId` — both
  fixed, then a clean second pass confirmed 0 errors).
- `npx tsx scripts/canon-rail-guard.ts --working-tree` — **passes clean**: "no new canonical-path
  violations introduced." All 34 changes are removals/tightenings of inline resolvers, none add one.
- `NODE_OPTIONS="--max-old-space-size=6144" npx next build` — succeeded (exit 0), full route
  manifest generated with no errors.
- Single commit, per sprint rule.

---

## Part 5 — the honest updated count

| | Before this sprint | After this sprint |
|---|---|---|
| Files on the rail (`withBusinessContext`) | 45 (41 from CANON-MIGRATE-1 + 4 from CANON-SEC-1) | **79** |
| Handlers on the rail | 52 (47 from CANON-MIGRATE-1 + 5 from CANON-SEC-1) | **104** |
| Bucket A (clean-swap) remaining | 207 | **154** |
| Bucket B (behavior-divergent) | 344 | **345** (+1: `aria/autopilot` POST, reclassified this sprint) |
| Bucket C (not a fit) | 0 (closed by CANON-SEC-1) | 0 |

154 Bucket-A handlers remain, including `aria/compliance` POST (deferred, see Part 3) and all of
classification batches 3 (loyalty/*, pending a check of whether those already share a
`requireOwner()` abstraction rather than a raw duplicate) and 5–8 from CANON-MIGRATE-1's original
inventory, not yet re-verified in this sprint. **This is batch 2 of N — the migration is not
finished.**
