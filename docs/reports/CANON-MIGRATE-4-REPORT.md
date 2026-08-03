# CANON-MIGRATE-4 — Migrating Bucket A Batch 4 Onto the Rail

## Pre-flight correction (read this first)

The sprint brief this session started from was worded as "CANON-MIGRATE-3 — batch 3 of Bucket A,"
expecting ~154 un-migrated Bucket-A handlers left after batches 1-2. Pre-flight found that
**CANON-MIGRATE-3 already ran and is already on `main`** (commit `71993eec`, 48 files / 67 handlers,
merged before this session started — `CANON-MIGRATE-3-REPORT.md` already exists in the repo with a
full write-up). The brief was stale, not the repo.

Rather than either (a) blindly re-running a completed sprint over already-migrated files, or (b)
silently doing something different from what was asked without saying so, this sprint verified the
real current state and executed **the next batch CANON-MIGRATE-3 itself identified as ready**
(its own Part 5: "batch 4... the entire `splits` → `xero-sync/prepare` slice"). This report is
therefore numbered **4**, matching what actually exists on `main`, not 3.

Confirmed unchanged since batch 3 (both the exact commit that introduced them, `3aa4369a`, with no
edits since):
- `src/lib/api/with-error-capture.ts` (`withBusinessContext`) — byte-identical.
- `scripts/canon-rail-guard.ts` — byte-identical.

Confirmed honest current count (fresh `grep`, not inherited from any report):
- **247 files** repo-wide still define a local `getBid`/`getBusinessId`/`getBiz` resolver before
  this sprint (**143 under `pos/*`**, **116 outside `pos/*`** across `aria/*` (49), `loyalty/*` (15),
  `integrations/*` (10), `training/*` (7), `tickets/*` (7), `social/*` (5), `delivery/*` (4),
  `settings/*` (3), `bookings/*` (3), and a long tail of 1-2-file folders — same shape CANON-MIGRATE-3
  Part 5 reported, confirms nothing drifted between sprints).
- The pre-classified, ready-to-migrate group per CANON-MIGRATE-3's own Part 5: the `splits` →
  `xero-sync/prepare` alphabetical slice, **32 files total** in that directory range (CANON-MIGRATE-3's
  headline count of "24 files, 34 handlers" was itself an approximation — this sprint re-read every
  file in the range fresh, per the standing re-classify-as-you-go instruction, rather than trust it).

## This batch: 25 files, 35 Bucket-A handlers

Every file in the `splits` → `xero-sync/prepare` range was re-read in full immediately before
editing (RULE 2), not migrated from the CANON-MIGRATE-3 summary. Of 32 files in range, 25 had at
least one Bucket-A handler; 7 had none (all pure id-ownership-check files with no local resolver —
see exclusions below, not part of any handler count).

| File | Handlers migrated | Left on Bucket B (resolver stays) |
|---|---|---|
| `pos/splits` | POST | GET (200 `{splits:[]}` on no-business) |
| `pos/splits/[id]/pay` | POST | — (resolver deleted) |
| `pos/splits/ai-suggest` | POST | — (resolver deleted) |
| `pos/splits/ai-suggest/confirm` | POST | — (resolver deleted) |
| `pos/splits/ocr` | POST | — (resolver deleted) |
| `pos/splits/ocr/from-scan` | POST | — (resolver deleted) |
| `pos/staff-leave` | POST, PATCH | GET (200 `{leave:[]}`) |
| `pos/staff-shifts` | POST, PATCH, DELETE | GET (200 `{shifts:[]}`) |
| `pos/staff` | POST, PATCH, DELETE | GET (200 `{staff:[]}`) |
| `pos/stock-takes` | POST | GET (200 `{stock_takes:[]}`) |
| `pos/store-credits` | GET, POST | — (resolver deleted) |
| `pos/surcharge-rules` | POST | GET (200 empty); PATCH/DELETE excluded, see below |
| `pos/tax-codes` | POST | GET (200 `{tax_codes:[]}`) |
| `pos/tax-codes/[id]` | PATCH, DELETE | — (resolver deleted) |
| `pos/tax-holidays` | POST | GET (200 `{holidays:[]}`) |
| `pos/timed-prices` | POST, PATCH, DELETE | GET (200 `{schedules:[]}`) |
| `pos/transfers` | POST | GET (200 `{transfers:[]}`, multi-mode) |
| `pos/transfers/[id]/items` | POST | DELETE excluded, see below |
| `pos/transfers/[id]/transition` | POST | — (resolver deleted) |
| `pos/variant-groups` | POST | GET excluded, see below |
| `pos/variant-groups/[id]` | PATCH, DELETE | — (resolver deleted) |
| `pos/waste` | POST | GET (200 `{entries:[],total_cost_cents:0}`) |
| `pos/xero-sync` | POST | — (resolver deleted) |
| `pos/xero-sync/approve` | POST | — (resolver deleted) |
| `pos/xero-sync/prepare` | POST | — (resolver deleted) |
| **Total** | **35 handlers / 25 files** | |

12 files had every handler migrate — local resolver and its now-dead
`createServerSupabaseClient` import deleted. 13 files kept a sibling on Bucket B — resolver left
exactly as-is, per the established pattern.

## Re-classifications and exclusions found on the fresh re-read (9 handlers/files, logged)

Per the standing "re-classify as you go" instruction — none of these were force-migrated:

1. **`pos/splits/[id]` (GET, PATCH, DELETE)** — no explicit no-business 400. `bid` (possibly null)
   is passed straight into `.eq('business_id', bid ?? '')`; a missing business silently resolves to
   404 (GET/DELETE) or a no-op 200 `{ok:true}` (PATCH), never the canonical 400 shape. Not a clean
   401/400 match — kept on Bucket B.
2. **`pos/splits/ocr/[scan_id]` (GET, PATCH, DELETE)** — identical pattern to #1 (`bid ?? ''`, no
   explicit 400). Kept on Bucket B.
3. **`pos/splits/[id]/combine`, `/reassign-item`, `/receipt`, `/void`** — no local resolver at all.
   These four use a different, already-correct ownership pattern (fetch the row by id, then check
   `row.business_id` against a `businesses` row owned by `user.id`) — not a fit for this migration,
   not counted as Bucket A or B.
4. **`pos/surcharge-rules` PATCH, DELETE** — same `bid ?? ''` silent-pass pattern as #1 (only GET/POST
   in this file have the explicit 400 check). Excluded; POST migrated, PATCH/DELETE left on the
   local resolver.
5. **`pos/transfers/[id]/items` DELETE — ordering trap.** `item_id` is read from `searchParams` and
   validated (400 if missing) **before** the auth check runs. An unauthenticated request missing
   `item_id` currently gets 400, not 401. `withBusinessContext` always checks auth first, so
   migrating would silently change that edge case's status code. Excluded; POST (whose order is
   auth → bid → body, unaffected) migrated normally.
6. **`pos/variant-groups` GET** — returns 200 `{groups:[]}` even when the user is **unauthenticated**
   (never checks `error`/`!user` for a 401 at all). Not a 401/400 shape mismatch — it doesn't 401 at
   all. Clearly not Bucket A; excluded.

No new instance of the "gate between auth and business resolution" ordering trap was found in a
migrated handler — the one instance found (#5 above) was correctly excluded, not migrated around.

## VERIFY

**Resolver equivalence**, traced against real Sip Café data (`ff5055a0-c351-4ada-817a-1804961035f3`)
via Supabase MCP:
- Sip's owner (`user_id fd33fcbd-a533-47a7-b557-b1e652a279e0`) has a `user_active_business` row
  pointing at `ff5055a0...`, and that business is owned by the same user and `is_active=true`.
  `resolveOwnerBusinessId()`'s extra re-validation step (`businesses` lookup with
  `id`+`user_id`+`is_active` all matching) therefore succeeds and returns the same
  `ff5055a0-c351-4ada-817a-1804961035f3` the local `getBid()` resolvers returned directly from the
  `user_active_business` row alone — identical result for this real, live case (the two resolvers can
  only diverge on a stale/foreign active-business row, which this account doesn't have).
- **`pos/tax-codes/[id]` DELETE** (secondary id in path): confirmed a real system tax code exists for
  Sip (`GST`, `id b5a99d17-52d1-4eb6-8788-2087b6875e4d`, `is_system=true`). The migrated handler's
  `existing.business_id !== bid` check and `is_system` guard are unchanged code, now fed the
  correctly-resolved `bid` — would still return 400 "Cannot delete system tax code" for this real row.
- **`pos/transfers/[id]/transition`** (secondary id in path): confirmed a real transfer exists for Sip
  (`id 1b823551-370a-4606-8f62-ef9c89a3060b`, `status='draft'`). The migrated handler's
  `.eq('id', id).eq('business_id', bid)` lookup, unchanged, resolves this row correctly with the new
  `bid`.
- **`pos/xero-sync/prepare`** (no secondary id): straightforward `business_id`-scoped insert against
  `xero_sync_previews`, correctly scoped by the resolved `bid`.

**Build gate:**
- `npx tsc --noEmit` — **0 errors**, clean on the first pass (no destructure-trap or ordering-trap
  fixes needed this batch — both known traps from CANON-MIGRATE-3 were checked for and not present
  in any migrated handler here).
- `npx tsx scripts/canon-rail-guard.ts --working-tree` — **passes clean**: "no new canonical-path
  violations introduced."
- `NODE_OPTIONS="--max-old-space-size=6144" npx next build` — succeeded (exit 0), full route
  manifest generated, only pre-existing lint warnings (all in files this sprint never touched).
- `git diff --stat` across all 25 files: **107 insertions, 403 deletions** — every touched file a
  net removal.
- Single commit, per sprint rule.

## Honest updated count

| | Before this sprint | After this sprint |
|---|---|---|
| Files on the rail (`withBusinessContext`) | 127 | **152** |
| Handlers on the rail | 171 | **206** |
| `pos/*` files still defining a local resolver | 143 | **131** |
| Total files repo-wide still defining a local resolver | 259 | **247** |

**Within `pos/*`**: the `splits` → `xero-sync/prepare` slice is now fully worked through — every
file in that alphabetical range has been read and classified (25 migrated, 7 correctly excluded).
`pos/*` has no more pre-classified, ready-to-migrate Bucket-A groups left over from CANON-MIGRATE-3;
the 131 remaining `pos/*` files are either correctly-Bucket-B siblings of already-migrated files, or
have never been read by any sprint (CANON-MIGRATE-3's own classification sweep only covered
`agent-decisions` → `xero-sync/prepare` alphabetically — everything after `xero-sync/prepare` and
before `agent-decisions` alphabetically wrapping was never touched by that sweep either, i.e. the
picture is genuinely incomplete, not "0 Bucket-A handlers left").

**Outside `pos/*`**: unchanged from CANON-MIGRATE-3's honest assessment — **116 files** across
`aria/*` (49), `loyalty/*` (15), `integrations/*` (10), `training/*` (7), `tickets/*` (7), `social/*`
(5), `delivery/*` (4), `settings/*` (3), `bookings/*` (3), and a long tail, still never
re-classified against current code by any sprint.

**Recommended next batch**: a fresh 7-way-parallel classification sweep of the full `pos/*` cluster
NOT covered by CANON-MIGRATE-3's alphabetical slice (`agent-decisions` → `hardware-devices` already
swept and returned 0 Bucket-A — see that report's Part 1 — so start past `xero-sync/prepare`
alphabetically, or classify `aria/*` fresh instead, matching CANON-MIGRATE-3's own recommendation).
**This is batch 4 of N — the migration is not finished.**
