# RUN-S2B — THREADS, SEARCH, SOFT DELETE

**Run date:** 2026-08-26 · autonomous (RULE 20) · branch `main`
**Outcome: STOPPED AT PHASE 0. The migration has not been applied. Nothing was built.**

---

## THE ONE-SCREEN SUMMARY

**`docs/aria/S2-MIGRATION-PROPOSAL.sql` has not run against the database.** All four columns and
both indexes are absent. Phase 0 says stop and report exactly which, so that is what this is.

### Phase 0 verification — queried live, not read from the file

| required | present? |
|---|---|
| `pinned_at` | ❌ **missing** |
| `deleted_at` | ❌ **missing** |
| `title_edited_at` | ❌ **missing** |
| `search_tsv` | ❌ **missing** |
| `aria_conversations_biz_recent_idx` | ❌ **missing** |
| `aria_conversations_search_idx` | ❌ **missing** |

**Six of six missing.** Not a partial application — nothing ran at all.

### I checked my own query before reporting, because that matters here

S2's first isolation rail flagged 11 blocks and none were leaks, so a bare empty result was not
good enough to stop a sprint on. Three independent confirmations:

1. **Listing every column** on `aria_conversations` returns exactly the **same 14 it had before S2**:
   `id, business_id, role, content, created_at, last_message_at, title, user_id, messages,
   pending_action, message_count, has_escalated, last_intent, pending_action_expires_at`.
   The table is untouched — my filter wasn't wrong, there is nothing to find.
2. **Listing every index** returns only the three pre-existing ones — `aria_conversations_pkey`,
   `idx_aria_conversations_business_id`, `idx_aria_conversations_created_at`. Neither new index.
3. **The repo agrees.** `supabase/migrations/` has had nothing new since 24 Aug, and no migration
   file anywhere mentions `pinned_at`, `search_tsv` or `title_edited_at`. The proposal file itself is
   byte-unchanged since S2 committed it (`0209bbd4`, 26 Aug 02:17).

Right project, too: `nxfzippunqvqsvkmwtjv` — the one carrying Sip's 173 conversations, which every
query this session has read.

**I did not apply it, did not work around it, and have not re-proposed it.** The decision table's
first row and RULE 20's NEVER-UNATTENDED list both say the same thing, and the file is already
written and waiting — re-writing it would just create a second copy to keep in step.

---

## ⚠️ THE URGENT CONSEQUENCE: LIVE DATA LOSS IS STILL SHIPPING

The sprint calls phase 2 the urgent one, and it is right. **`/api/aria/ask/delete` still does a hard
`.delete()`**, and MS17's thread list calls it. Today, on production:

> An owner who mis-clicks the 🗑 on a thread **permanently destroys that conversation and every
> message in it.** There is no tombstone, no undo, and no recovery short of a database backup.

That is unchanged by this run, and it stays true on every deployment until the migration lands.

**I could not fix it without the column.** A tombstone has to be written somewhere, and the honest
options were: a new column (DDL — forbidden), or smuggling a marker into `last_intent` /
`pending_action` / the `messages` JSONB (abusing a column for a meaning it does not have, which is
how schemas rot and how the next reader gets misled).

### One decision available to you right now, if you want it

If you would rather delete were **disabled** than **destructive** while the migration waits, that is
a one-line change to the delete route — return a "not available yet" response instead of destroying
the row. I have deliberately **not** done it: the sprint says do not work around a missing schema
object, and disabling a working control is a product decision, not mine. Say the word and it takes a
minute.

---

## PREFLIGHT — WHAT EXISTS TODAY (unchanged from S2, re-verified)

| thing | state |
|---|---|
| conversation store | `aria_conversations` — **287 rows, 3 businesses, 0 orphans**, RLS on and business-scoped |
| messages | a **JSONB array on the conversation row** — 712 messages, longest thread 12. No messages table |
| thread list + open | **built** (MS17 `ThreadsPanel` → `/api/aria/ask/history`) |
| delete | **built, and HARD** — the defect above |
| rename | **not built** — the `title` column exists, no route writes it |
| pin | **not built**, needs `pinned_at` |
| soft delete | **not built**, needs `deleted_at` |
| search | **not built**, needs `search_tsv` + GIN |
| drafts | **built in S2** — local, per thread |
| isolation rail | **built in S2** — guards every service-role read |

**Nothing here is half-built in a way that would surprise a later phase.** The three unbuilt
features each map to exactly one missing column, which is why the migration unblocks all of them in
one pass rather than piecemeal.

---

## WHAT EACH PHASE NEEDS

| phase | blocked on |
|---|---|
| 1 — thread list | `pinned_at` for "pinned first". The list itself already works |
| 2 — soft delete | **`deleted_at`.** The urgent one |
| 3 — rename and pin | `pinned_at`; rename also wants `title_edited_at` so S1's auto-titler has an explicit signal rather than an inferred one |
| 4 — search | `search_tsv` + `aria_conversations_search_idx` |
| 5 — rendering on restored/searched threads | phase 4 — a search result cannot be rendered before search exists |
| 6 — the walk | phases 1–4 |

**Every one of the six is downstream of the same six schema objects.** There is no useful subset to
build first, which is why this run produced no code rather than a partial sprint that would need
rewriting the moment the columns arrive.

---

## TO UNBLOCK

Apply `docs/aria/S2-MIGRATION-PROPOSAL.sql`, then re-run this sprint. The proposal ends with RULE
10's verification queries; running them should return **4 columns, 2 indexes, 287 rows, and 287
non-null `search_tsv`** — the generated column backfills on `ALTER`, so every existing thread becomes
searchable immediately without a data migration.

## GATES

Nothing was built, so nothing new was gated. `src/` is untouched: the tree is exactly as S2 left it —
tsc 0 errors, vitest 861/861, `BUILD_EXIT=0`.
