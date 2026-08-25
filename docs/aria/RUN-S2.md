# RUN-S2 — CONVERSATION PERSISTENCE

**Run date:** 2026-08-26 · autonomous (RULE 20) · branch `main`

---

## THE ONE-SCREEN SUMMARY

**Phase 0 gate passed. Cross-tenant isolation proven. The migration is written but NOT applied —
and that is a locked-rule outcome, not a judgement call.**

### The thing you need to decide

`docs/aria/S2-MIGRATION-PROPOSAL.sql` is ready and waiting for you. **CLAUDE.md forbids me applying
it unattended** — RULE 10a ("you do not write schema… all DDL is applied after the founder approves
the SQL") and RULE 20's NEVER-UNATTENDED list, which names DDL first with "no exceptions, not even
with a decision table". The sprint asks phase 1 to land a migration; the locked rules say a migration
is not mine to run. CLAUDE.md settles the conflict itself: *"If a paste contradicts this file, this
file wins — stop and say so."* This is me saying so.

**Approve it and everything below unparks.** It adds four columns and two indexes, drops nothing,
and rewrites no rows.

### Cross-tenant isolation: PROVEN, against the live database

Impersonating each owner at the database level, exactly as Supabase evaluates RLS:

```
SIP_OWNER    own=173  foreign=0  total_visible=173
SMOKE_OWNER  own=112  foreign=0  total_visible=112
```

Neither owner can see a single row belonging to the other. `total_visible` equalling `own` is the
part that matters — a `WHERE` clause can hide a leak, but a total cannot. The policies are
`business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())`, i.e. **business-scoped, not
user-scoped**, which is the right shape for a business that will one day have two logins.

> ⚠️ **But RLS is the backstop, not the door.** Every Ask Aria route uses `supabaseAdmin` — the
> service role — which **bypasses RLS entirely**. In production the isolation that actually holds is
> the `.eq('business_id', …)` in the query. That is the layer that regresses when someone adds a
> route in a hurry, so `conversation-isolation.test.ts` guards it: every route touching
> `aria_conversations` must scope by business, and no conversation may be fetched by id alone.

---

## THE ISOLATION FINDING — HARDENED, NOT A LEAK

Worth reading in full, because the honest answer is narrower than the alarming one.

**Three `supabaseAdmin` reads of message CONTENT were keyed on an id with no business filter**
(`ask/route.ts`, the conversation-summariser paths), plus the write that followed one of them. The
service role bypasses RLS, so in those three queries there was no isolation at all except the id.

**Was it exploitable? Not demonstrably — and I am not going to claim it was.** The id comes from
`savedConvId`, which starts as the CLIENT-SUPPLIED `conversation_id`; but `upsertConversation`
re-scopes with `.eq('business_id', businessId)`, so a foreign id finds nothing, falls through to an
INSERT, and `savedConvId` becomes a fresh id belonging to the caller's own business. The path was
safe **by accident of an upstream call**, which is exactly the shape that becomes a real leak the
first time someone reorders or refactors that function.

So the sprint was NOT stopped — no test showed another business's rows being returned — and the four
queries were given an explicit `.eq('business_id', bid)` anyway. Defence in depth costs nothing here.

### My first version of this test cried wolf, and I checked before reporting

It flagged **11 blocks**. None were leaks:
- the **delete route** SELECTs by id in order to *read* `business_id`, then gates on a 403 ownership
  check — the select IS the check;
- the **action route** uses `supabase`, the **RLS-bound** client, where the policy does the work.

Reporting those as a cross-tenant leak would have been a false alarm of exactly the kind the standing
rules call a measurement error in your own diagnostic. The rail now separates the two clients
(`supabaseAdmin` bypasses RLS; `supabase` does not) and only cares about reads of message *content*,
not ownership probes. A probe proves each of its three filters is doing work.

**Mutation:** reverting one hardened read → RED, naming the file and offset.

---

## WHAT THE PREFLIGHT FOUND ALREADY BUILT

The decision table says extend, never create a second store. There was plenty to extend.

| thing | state before S2 |
|---|---|
| conversation store | **`aria_conversations`, 287 rows, 3 businesses, 0 orphans.** RLS on, business-scoped |
| messages | **a JSONB array on the conversation row** — 712 messages, longest thread 12. There is no messages table |
| thread list + open | **already built** — MS17's `ThreadsPanel` over `/api/aria/ask/history` |
| delete | **already built — and it is a HARD DELETE** (`/api/aria/ask/delete` → `.delete().eq('id', id)`) |
| titles | S1 phase 6 writes one exactly once, at creation |
| message status | S1 already persists `incomplete` / `stopped_by`, and `superseded_at` / `superseded_by` / `edited_from` |
| pin | does not exist |
| soft delete | does not exist |
| search | does not exist |

**The finding that matters most: delete is already hard.** MS17's thread list calls a route that
does `.delete()`. Phase 3 says a hard DELETE from the UI is a failed phase — so this is not a
missing feature, it is an **existing defect**, and it needs `deleted_at`, which needs the migration.

---

## PHASE 1 — THE SCHEMA

**Proposed, not applied.** `docs/aria/S2-MIGRATION-PROPOSAL.sql`.

| addition | why |
|---|---|
| `pinned_at timestamptz` | a timestamp, not a boolean, so pinned threads can order among themselves |
| `deleted_at timestamptz` | soft delete. The row and its messages survive |
| `title_edited_at timestamptz` | records that the OWNER renamed it, so any future titling code has an explicit signal |
| `search_tsv tsvector` GENERATED | full text over title + every message's content, kept in step automatically — no trigger to forget and no way for the index to drift from the data |
| `aria_conversations_biz_recent_idx` | hot path 1: a business's live threads, pinned first then by recency, `WHERE deleted_at IS NULL` |
| `aria_conversations_search_idx` GIN | hot path 2: search |

**Nothing is dropped and no row is rewritten.** The generated column backfills on `ALTER`, so all
287 rows become searchable immediately — which is why there is no row-by-row migration and no data
to lose.

### Why no separate messages table — flagged, not silently skipped

Phase 1 describes "conversation + message tables". A messages table is the right shape at scale and
it is **not** proposed here, deliberately: 712 messages across 287 threads, longest thread 12.
Splitting them means rewriting all 8 routes that read the JSONB array, re-implementing S1's
supersede logic against rows, and migrating 712 records — a large blast radius for a table that fits
in memory many times over. If you want the split it deserves its own sprint and its own
verification, not to ride along with a pin flag.

---

## WHAT SHIPPED WITHOUT THE MIGRATION, AND WHAT PARKED

Rather than stopping the whole sprint on the DDL, everything that works on today's schema was built.

| phase | outcome |
|---|---|
| 1 — schema | **PARKED on approval.** SQL written, isolation proven, rails in place |
| 2 — thread list | see below |
| 3 — rename / pin / delete | rename ships; **pin and soft-delete park** on `pinned_at` / `deleted_at` |
| 4 — search | **parks** on `search_tsv` + the GIN index |
| 5 — drafts | ships — local to the device, no schema needed |
| 6 — rendering | ships — verified in a real browser again |
| 7 — the walk | ships, against real data |

---

## GATES

- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — recorded in the final commit
- **Cross-tenant isolation proven live**, and guarded by a source rail
- `npx next build` — `BUILD_EXIT` read from the log, never the wrapper
