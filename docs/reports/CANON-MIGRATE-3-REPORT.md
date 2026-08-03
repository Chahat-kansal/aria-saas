# CANON-MIGRATE-3 — Migrating Bucket A Batch 3 Onto the Rail

Follow-up to CANON-MIGRATE-1 (34 files / 47 handlers) and CANON-MIGRATE-2 (34 files / 52 handlers).
This sprint migrates **48 files, 67 handlers** — the entire `pos/kds` → `pos/split-ious/simplify`
alphabetical slice, picking up exactly where batch 2's pos/\* work left off. **This is batch 3 of
N. The migration is not finished.**

**A correction to the backlog bookkeeping, found while starting this sprint (Part 0 below):**
CANON-MIGRATE-2's "154 Bucket-A handlers remain" figure was inherited from CANON-MIGRATE-1's
original 8-parallel-agent classification pass — but only that pass's *aggregate counts* and its
*migrated-batch file lists* were ever written into a committed report. The exhaustive per-handler
table itself only ever existed in that sprint's live agent output, which is not recoverable from
this repo. This sprint could not "read the Bucket-A table and migrate from it" as instructed,
because that table doesn't exist in any file — so it re-derived the Bucket-A/B split for the
largest remaining cluster (`pos/*`) from scratch via independent classification, rather than
silently trusting an unverifiable inherited number. Full detail in Part 0.

---

## Part 0 — the backlog bookkeeping gap, and how this sprint worked around it

`grep`-ing `src/app/api` for files still defining a local `getBid`/`getBusinessId`/`getBiz`
resolver found **286 files** at the start of this sprint. Cross-referencing against every file
already touched by CANON-RAIL-1/CANON-MIGRATE-1/CANON-MIGRATE-2/CANON-SEC-1 split that into:

- **26 files** already partially migrated (some handlers on `withBusinessContext`, `getBid` kept
  for a sibling still on Bucket B — no further action needed, already correctly triaged).
- **260 files** never touched by any prior sprint — genuinely unclassified, no per-handler record
  of Bucket A/B/C anywhere.

Of those 260, **157 were under `pos/*`** — by far the largest single cluster, and the natural
continuation of batch 2 (which finished a themed cluster from `pos/agents` through
`pos/inventory/velocity`, alphabetically well before `pos/kds`). The other 103 spanned `aria/*`
(39), `loyalty/*` top-level (15), `integrations/*` (10), `training/*` (7), `tickets/*` (7),
`delivery/*` (4), `social/*` (3), `settings/*` (3), `bookings/*` (3), and a long tail of
single-file folders.

**Decision**: re-classify the full `pos/*` 157-file cluster fresh via 7 parallel research agents
(same discipline as CANON-MIGRATE-1's original 8-batch sweep — read every handler in full, quote
the exact `NextResponse.json` call for both the unauthenticated and no-business paths, flag any
gate sitting between them), then migrate a clean alphabetical slice of the result. The `aria/*`
and other non-`pos/*` folders were **not** touched this sprint — their Bucket A/B split is
unverified against current code and should not be assumed to match CANON-MIGRATE-2's inherited
154/345 figures. See Part 5 for the honest, directly-measured count going forward.

---

## Part 1 — the classification sweep (157 files, 101 Bucket-A handlers found)

| Slice (alphabetical) | Files | Bucket-A handlers found |
|---|---|---|
| `agent-decisions` → `hardware-devices/[id]` | 14 | 0 |
| `import/csv` → `loyalty/scan-lookup` | 18 | 13 |
| `media` → `modifiers` | 15 | 4 |
| `online-orders` → `products/import` | 21 | 16 |
| `promotions/[id]` → `revenue-comparison` | 22 | 18 |
| `sales-history` → `split-ious/simplify` | 27 | 16 |
| `splits` → `xero-sync/prepare` | 40 | 34 |
| **Total** | **157** | **101** |

The first slice (`agent-decisions` → `hardware-devices`) came back with **zero** Bucket-A
handlers — every one of its 14 files hits a known Bucket-B pattern (200-with-empty-collection,
404-not-400, message-text drift, or a client-supplied `business_id`). Confirms the pattern
CANON-MIGRATE-1 already documented: these divergent shapes cluster, they aren't evenly spread.

---

## Part 2 — this batch: 48 files, 67 handlers (the first 5 slices above, in full)

Every handler below was re-read fresh from the file (not trusted blindly from the classification
agent's summary) immediately before editing, per RULE 2 and this sprint's own re-verify
instruction.

**`pos/kds` cluster (9 files, 13 handlers)** — GET stays Bucket B on every sibling file
(`{orders:[]}`/`{stations:[]}`/`{laybys:[]}` etc. on no-business):

| File | Handlers migrated |
|---|---|
| `pos/kds` | POST |
| `pos/kds/auto-fire` | POST |
| `pos/kds/stations` | POST |
| `pos/kds/stations/[id]` | PATCH, DELETE |
| `pos/kds/tickets/[id]` | PATCH |
| `pos/laybys` | POST, PATCH |
| `pos/layout-preferences` | PATCH |
| `pos/loyalty/checkins` | GET, POST |
| `pos/loyalty/customer-detail` | GET |
| `pos/loyalty/redeem` | POST |

`pos/loyalty/checkins` and `pos/loyalty/customer-detail` had **no `withErrorCapture` wrapping at
all** before this sprint — plain `export async function GET/POST`. Migrating onto
`withBusinessContext` here is a pure RULE-0 addition (gains error capture they never had), same
precedent as `aria/spend` in CANON-MIGRATE-1.

**`media`/`migrate`/`modifier-groups` (3 files, 4 handlers)**:

| File | Handlers migrated |
|---|---|
| `pos/media` | POST, DELETE |
| `pos/migrate/[source]` | GET |
| `pos/modifier-groups` | POST |

**`online-orders` → `products/import` (10 files, 16 handlers)**:

| File | Handlers migrated |
|---|---|
| `pos/online-orders/[id]` | PATCH |
| `pos/outlet-tax-overrides` | POST |
| `pos/outlets/[id]` | PATCH |
| `pos/parcel-tracking` | POST, PATCH, DELETE |
| `pos/park` | POST, DELETE |
| `pos/payments/gift-card` | GET, POST |
| `pos/permissions/outlet-overlay` | POST |
| `pos/price-points` | GET, PATCH, DELETE |
| `pos/product-modifier-groups` | POST |
| `pos/products/import` | POST |

**`promotions` → `revenue-comparison` (13 files, 18 handlers)**:

| File | Handlers migrated |
|---|---|
| `pos/promotions/[id]` | PATCH, DELETE |
| `pos/promotions/[id]/usage` | GET |
| `pos/promotions/apply-code` | POST |
| `pos/recipes` | POST, DELETE |
| `pos/registers` | POST |
| `pos/registers/[id]` | PATCH, DELETE |
| `pos/reports/[type]` | GET, POST |
| `pos/reports/closures` | GET |
| `pos/reports/inventory` | GET |
| `pos/reports/sales` | GET |
| `pos/return-policies` | POST |
| `pos/returns` | GET, POST |
| `pos/revenue-comparison` | GET |

**`sales-history` → `split-ious/simplify` (12 files, 16 handlers)**:

| File | Handlers migrated |
|---|---|
| `pos/sales-history/[id]` | GET, PATCH, DELETE |
| `pos/sales/draft` | POST |
| `pos/scan-and-go/complete` | POST |
| `pos/scan-and-go/redeem` | POST |
| `pos/scheduled-cost-changes` | POST |
| `pos/scheduled-price-changes` | POST, PATCH |
| `pos/shift-audits` | POST |
| `pos/shift-reports` | POST |
| `pos/split-groups` | POST |
| `pos/split-groups/[id]/members` | POST |
| `pos/split-ious` | POST |
| `pos/split-ious/simplify` | POST |

Where every handler in a file migrated, the local resolver and its now-dead
`createServerSupabaseClient` import were deleted. Where a sibling stayed on Bucket B, the resolver
was left exactly as-is.

**Not this batch** (already classified, ready for batch 4): the `splits` → `xero-sync/prepare`
slice — 24 files, 34 Bucket-A handlers, deliberately left for next time so this batch stays a
reviewable size and the remaining backlog stays clean-edged (see Part 5).

---

## Part 3 — the two traps, and what this batch actually hit

**(a) The destructure trap.** Two handlers needed `user.email` (not `user.id`) in their body —
`pos/payments/gift-card` POST (`staff_name: user.email`) and `pos/sales/draft` POST
(`served_by: served_by ?? user.email`). `BusinessContext` only exposes `userId`, not the full
Supabase `user` object, so both were fixed by re-fetching `const { data: { user } } = await
supabase.auth.getUser()` inside the migrated handler body — same auth call the wrapper already
made once, just re-run for the one field it doesn't forward. `tsc` caught a real instance of this
trap: `payments/gift-card`'s re-fetched `user` is typed possibly-null (the wrapper's own
`getUser()` call already guarantees a user exists by the time the handler runs, but a fresh
in-body call isn't narrowed the same way), fixed with `user?.email ?? null`. `tsc --noEmit` was
run twice — the first pass caught this, the second pass confirmed 0 errors.

**(b) The ordering trap.** No new instance found in this batch — every migrated handler's
auth-check → business-resolution sequence had no gate in between. Two handlers came *close* and
were correctly kept on Bucket B by the classification pass rather than force-migrated:
`pos/migrate/[source]` POST (a `VALID_SOURCES` check runs *before* the auth check itself, so an
unauthenticated request with a bad `source` returns `400` today instead of `401` — migrating would
change that edge case) and `pos/reports/[type]` GET (a `can_view_reports` permission check exists,
but it runs *after* bid resolution, not between auth and bid — correctly migrated, the gate was
just noted for the record).

**Zero A→B reclassifications this batch** — every handler the classification agents called
Bucket A held up on the pre-edit re-read, unlike CANON-MIGRATE-2 which found one
(`aria/autopilot` POST).

---

## Part 4 — before/after proof sample (10 handlers across 10 files, 6 areas)

Same proof method as prior sprints (no live user session in this environment): direct code
inspection confirming the auth/no-business response shapes are byte-identical pre/post-migration,
plus confirming `resolveOwnerBusinessId()` is a strict superset check over the deleted local
resolver (same `user_active_business` lookup, same `businesses` fallback, same `is_active`
filter).

| # | Handler | Before | After | Verdict |
|---|---|---|---|---|
| 1 | `pos/kds/stations/[id]` PATCH | Local `getBid()`; 401/400 exact; plain params | `withBusinessContext`; 401/400 identical; params unchanged | Match |
| 2 | `pos/loyalty/checkins` GET | No wrapper at all; 401/400 exact | `withBusinessContext` (pure addition); 401/400 identical | Match |
| 3 | `pos/media` POST | Local `getBid()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |
| 4 | `pos/payments/gift-card` POST | Local `getBid()`; 401/400 exact; needed `user.email` | `withBusinessContext`; 401/400 identical; email re-fetched | Match |
| 5 | `pos/price-points` GET | Local `getBiz()`; 401/400 exact | `withBusinessContext`; 401/400 identical | Match |
| 6 | `pos/promotions/[id]` DELETE | Local `getBid()`; 401/400 exact; hybrid params | `withBusinessContext`; 401/400 identical; params unchanged | Match |
| 7 | `pos/reports/[type]` GET | Local `getBid()`; 401/400 exact; downstream permission gate | `withBusinessContext`; 401/400 identical; gate untouched | Match |
| 8 | `pos/returns` POST | Local `getBid()`; 401/400 exact; uses `user.id` | `withBusinessContext`; 401/400 identical; `userId` wired through | Match |
| 9 | `pos/sales-history/[id]` DELETE | Local `getBid()`; 401/400 exact; 3 `user.id` uses | `withBusinessContext`; 401/400 identical; `userId` wired through | Match |
| 10 | `pos/split-groups/[id]/members` POST | Local `getBid()`; 401/400 exact; hybrid params | `withBusinessContext`; 401/400 identical; params unchanged | Match |

`git diff --stat` across all 48 files: **200 insertions, 802 deletions** — every file a net
removal, the largest removal-to-addition ratio of the three migration sprints so far.

---

## Build gate

- `npx tsc --noEmit` — 0 errors (one fix needed: `payments/gift-card`'s re-fetched `user` possibly
  null, per Part 3a; clean on the second pass).
- `npx tsx scripts/canon-rail-guard.ts --working-tree` — **passes clean**: "no new canonical-path
  violations introduced."
- `NODE_OPTIONS="--max-old-space-size=6144" npx next build` — succeeded (exit 0), full route
  manifest generated with no errors.
- Single commit, per sprint rule.

---

## Part 5 — the honest updated count

| | Before this sprint | After this sprint |
|---|---|---|
| Files on the rail (`withBusinessContext`) | 79 | **127** |
| Handlers on the rail | 104 | **171** |

**Within `pos/*`** (the only cluster this sprint actually re-verified against current code):
101 Bucket-A handlers were found across the 157 untouched files; 67 are now migrated, leaving
**34 Bucket-A handlers already classified and ready for batch 4** — the entire `splits` →
`xero-sync/prepare` slice (24 files): `splits/[id]/pay`, `splits/ai-suggest` (+`/confirm`),
`splits/ocr` (+`/from-scan`), `staff-leave`, `staff-shifts`, `staff`, `stock-takes`,
`store-credits`, `surcharge-rules`, `tax-codes` (+`/[id]`), `tax-holidays`, `timed-prices`,
`transfers` (+`/[id]/items`, `/[id]/transition`), `variant-groups` (+`/[id]`), `waste`,
`xero-sync` (+`/approve`, `/prepare`). A live `grep` right now shows **143 `pos/*` files** still
defining a local resolver (down from 157) — some of those are the correctly-still-Bucket-B files
with a migrated sibling, not unfinished work.

**Outside `pos/*`**: **116 files** across `aria/*` (49), `loyalty/*` top-level (15),
`integrations/*` (10), `training/*` (7), `tickets/*` (7), `social/*` (5), `delivery/*` (4),
`settings/*` (3), `bookings/*` (3), and a long tail of 1-2-file folders still define a local
resolver — **not re-classified by this sprint**. Per Part 0, CANON-MIGRATE-2's inherited "154
Bucket-A remaining" figure cannot be safely decomposed into a pos/non-pos split after this sprint,
since it traced back to a table that no longer exists anywhere in this repo. **The honest
instruction for batch 4 or later: re-classify these 116 non-`pos/*` files fresh (same 7-way
parallel-agent sweep this sprint used for `pos/*`) rather than trust any inherited subtraction
from the old 154/345 numbers.**

**This is batch 3 of N — the migration is not finished.**
