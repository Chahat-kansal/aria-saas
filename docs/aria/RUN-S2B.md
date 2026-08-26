# RUN-S2B — THREADS, SEARCH, SOFT DELETE

**Run date:** 2026-08-26 · autonomous (RULE 20) · branch `main`
*(This supersedes the earlier S2B run, which correctly halted because the migration had not been
applied. It has now been applied and verified.)*

---

## THE ONE-SCREEN SUMMARY

**Five phases shipped, one parked, eight commits.** The live data loss is fixed.

| phase | commit | outcome |
|---|---|---|
| 0 — gate + reconcile | `ae53425a` | schema verified live · repo reconciled to production |
| 1 — thread list | `85c192f9` | pinned first, paged, scoped |
| 2 — soft delete | `85c192f9` | **the hard DELETE is gone** |
| 3 — rename and pin | `75cb5cf9` | one title writer, no second mechanism |
| 4 — search | `75cb5cf9` | GIN + `websearch_to_tsquery`, scoped |
| — surface wiring | `1226e225` | every new route is actually reachable |
| 5 — rendering | `2c181596` | tables survive a restore · **provenance finding** |
| — canon rail | *the fix commit* | **the hook blocked my push** — two hand-rolled resolvers replaced |
| 6 — the walk | — | **not run** — see below |

### The three things you most need to know

**1. A mis-click no longer destroys a conversation.** `/api/aria/ask/delete` did
`.delete().eq('id', id)`. It now writes a tombstone. Proven on the live database as a rolled-back
block: **list 174→173, search 1→0, row_survives=1, msgs 3→3** — the thread leaves the list and stops
being findable, while the row and every message survive.

**2. Search is scoped, and I can show you what that filter is worth.** My first cross-tenant test
used "coffee" and was **worthless** — 29 scoped, 29 unscoped, because no other business happened to
match. It would have passed with or without the filter. Re-run on "revenue", which discriminates:

```
scoped (correct)        95
unscoped would return  165
foreign rows leaked     70   from 1 other business
```

**3. Provenance is not lost on reload — it was never there.** Verified in a real browser: **0
figures on the surface carry a truth tier today.** The renderer is fine; the wire above it was never
connected. Detail below, and it is the most important thing in this report.

---

## PHASE 0 — SCHEMA VERIFICATION AND REPO RECONCILIATION

Queried live, with my own check rather than the file or the paste:

| | |
|---|---|
| `pinned_at` · `deleted_at` · `title_edited_at` | present, `is_generated = NEVER` |
| `search_tsv` | present, **`GENERATED ALWAYS`** |
| `aria_conversations_biz_recent_idx` | present, `USING btree` |
| `aria_conversations_search_idx` | present, `USING gin` |
| rows | **288** · with `search_tsv` **288** · null **0** |
| sanity | `websearch_to_tsquery('english','coffee')` → **29 threads** |

**4/4 columns, 2/2 indexes.** Matches what the paste reported.

### The repo disagreed with production, and now doesn't

`docs/aria/S2-MIGRATION-PROPOSAL.sql` described SQL **that would fail if run**, which is precisely
the git-vs-prod drift RULE 10 calls a recurring failure here. Both files fixed:

- **`supabase/migrations/20260826_aria_conversations_threads_search.sql`** — new, the record of what
  actually ran. Transcribed from `pg_get_functiondef`, `pg_get_expr` and `pg_indexes`, **not**
  reconstructed from the sprint text.
- **`docs/aria/S2-MIGRATION-PROPOSAL.sql`** — banner-marked **SUPERSEDED — DO NOT RUN**, kept rather
  than deleted so its design rationale stays readable and the mistake stays visible.

**Why they differ:** the proposal defined `search_tsv` with an **inline subquery**. Postgres rejects
that outright — a generation expression may only call immutable functions and may not contain a
subquery — so the whole transaction would have rolled back, taking the three perfectly good columns
with it. The subquery now lives in `public.aria_conv_search_tsv(text, jsonb)`, declared
`IMMUTABLE PARALLEL SAFE`.

> ⚠️ **The caveat, recorded in both files because it will bite someone.** Editing that function does
> **not** retroactively update stored `search_tsv` values. A `STORED` generated column is computed on
> write, so existing rows keep the **old** function's output until each row is rewritten. Rebuilding
> means dropping and re-adding the column. A function change alone is not enough.

**No DDL was applied by me.**

---

## PHASE 2 — EVERY HARD-DELETE PATH FOUND

| path | table | verdict |
|---|---|---|
| `src/app/api/aria/ask/delete/route.ts:33` | `aria_conversations` | **FIXED** — now a tombstone |
| `src/app/api/conversations/route.ts:26` | `conversations` | **reported, not touched** |

The second is a **different table** — the CX/widget store, not Ask Aria. It is outside this sprint's
scope, and that table has no `deleted_at` column, so "fixing" it would need DDL I am not permitted
to apply. Flagged here so it is on the record rather than quietly skipped.

**Both read paths exclude tombstones**, and the single-thread read matters most: without
`deleted_at IS NULL` on read-by-id, a deleted thread would vanish from the list but still **reopen by
id** — worse than not deleting it, because the owner would believe it was gone.

The tombstone write carries its own `.eq('business_id', …)` even though an ownership check sits three
lines above it. `supabaseAdmin` bypasses RLS, and a destructive-looking write is the last place to
lean on a check further up the function.

---

## THE CROSS-TENANT RESULT

**RLS layer** (S2, re-confirmed): impersonating each owner, `SIP_OWNER own=173 foreign=0
total_visible=173` · `SMOKE_OWNER own=112 foreign=0 total_visible=112`.

**Query layer** (the one that matters, because `supabaseAdmin` never reaches RLS): every query
written this sprint carries its own `business_id` filter — list, single read, rename, pin, delete,
search. The "revenue" numbers above are what that filter is worth: **70 foreign threads**.

---

## PHASE 4 — THE INDEX AND QUERY SHAPE

```
index   aria_conversations_search_idx  GIN (search_tsv)
column  search_tsv GENERATED ALWAYS AS (aria_conv_search_tsv(title, messages)) STORED
query   WHERE business_id = $bid AND deleted_at IS NULL
          AND search_tsv @@ websearch_to_tsquery('english', $q)
        ORDER BY pinned_at DESC NULLS LAST, last_message_at DESC
```

`websearch_to_tsquery`, not `to_tsquery`: it accepts what a person actually types — bare words,
"quoted phrases", OR, minus-signs — and never throws on punctuation. `to_tsquery` raises a syntax
error on an unbalanced quote, turning a typo into a 500.

### The index is used — but not by the full query, and I would rather say so

| query | plan | time |
|---|---|---|
| tsquery alone | **Bitmap Index Scan on `aria_conversations_search_idx`**, 29 rows | **0.250 ms** |
| the full route query | Index Scan on `aria_conversations_biz_recent_idx`, tsquery as a Filter, 131 rows removed | 12.3 ms |

Both indexes are correct. At 288 rows the planner prefers the btree because it already satisfies the
`ORDER BY`, and filtering 131 rows is cheaper than a bitmap scan plus a sort. It will switch to GIN
as the table grows. Nothing to fix — but *"uses the GIN index"* would have been the wrong sentence
to put in a report.

**Which message matched** is located in TypeScript, not SQL: the whole thread is **one** tsvector, so
the index knows the thread matched but not the line. `bestMatchingMessage()` is a pure, tested
locator that also excludes S1's superseded branches — something SQL over the raw JSONB could not do —
and returns `-1` honestly when the thread matched on its **title**.

**No embeddings, no vector column**, asserted by test. Right at this scale.

---

## PHASE 5 — DID PROVENANCE SURVIVE RELOAD AND SEARCH?

**A restored thread renders correctly:** 1 real `<table>`, 3 headers, 6 cells, 0 raw pipes. Markdown
survives the round trip through history and replay.

**But provenance did not survive — because it was never there.**

```
figures carrying a truth tier, as the surface renders today:  0
the same content with anchors supplied:                       2, click-to-source resolving
```

Two causes, both **upstream of the renderer**:

1. `AskAriaTransition` calls `<AnswerMarkdown>` with **no `provenance` prop**, so `segmentFigures`
   runs with zero anchors.
2. `/api/aria/ask` **never sends anchors to the client**. They exist server-side (`anchorValues`,
   `route.ts:1110`) but sit inside one deeply-nested intent branch and reach the response only as
   `_anchor_values` buried in `augCtx`.

With no anchors `segmentFigures` marks **every** figure `plain` — not underlined, not clickable. That
is that function behaving **correctly** by its own rule ("a turn whose ground truth was never
captured cannot vouch for its numbers"), which is exactly why nothing *looks* broken. It quietly
promises nothing.

**MS16's phase-8 work is intact.** The same run proves it: handed the same content with anchors, the
renderer tiers 2 figures and click-to-source resolves to *"Where this came from · Completed sales,
18-24 Aug."*

**Parked, not bodged.** A real fix threads anchors out of that nested branch into the response **and**
persists them per assistant message in the JSONB, so a restored thread has them too. That is a phase
of its own inside a 2,500-line route — and a half-version would put blue underlines under numbers
whose backing had not actually been checked, which is worse than plain text, because an underline is
a promise.

---

## PHASE 6 — THE WALK: NOT RUN

**I did not click through the surface as a café owner**, and I am not going to present the checks I
did run as if I had. The route sits behind `DashboardShell` and Supabase auth, and `.env` is not
readable in this environment, so there is no logged-in session to walk.

What *was* exercised, and how:

| action | how it was verified |
|---|---|
| delete a thread | **live database**, rolled back: list 174→173, search 1→0, row survives, messages intact |
| search | **live database**: 29 hits for "coffee", 95 vs 165 for "revenue", real query plans |
| restore a thread | **real Chromium**: table renders, 0 raw pipes |
| rename / pin | route + rail only — **not clicked** |
| stop mid-answer and return | **not exercised** |

**What you should check on the deployed site:** open `⋯`, rename a thread and send another message
(the name must survive), pin one and reload, delete one and search for a phrase that was in it, then
stop a stream mid-answer and reopen the thread.

### Anything that rendered plausibly but did nothing

**One, and it is the provenance gap above** — numbers render as ordinary text with no tier and no
click-to-source, on a surface whose whole design premise is that every figure carries its
provenance. Nothing looks wrong, which is what makes it worth reporting.

Otherwise nothing: every route this sprint built is reached from `ThreadsPanel`, asserted by a rail
that checks **both** halves of the thread route, that search is called and debounced, and that every
button in the panel has a handler.

---

## THE GATE CAUGHT ME, AND IT WAS RIGHT

The first push of this sprint was **BLOCKED** by the pre-push hook. Recorded here because a report
that only lists the gates it passed is worth very little.

```
[canon-rail-guard] 2 new violation(s) found
  src/app/api/aria/ask/search/route.ts:43  [inline-business-id-resolver]
  src/app/api/aria/ask/thread/route.ts:33  [inline-business-id-resolver]
```

Both new routes shipped with their own five-line `getBid`. That is **failure pattern #4 — "N copies
drift"** — in a codebase that already had six independently-invented business-id resolvers, and I
wrote two more without noticing.

**The fix is a correctness gain, not a tidy-up**, which is the part worth knowing. Both routes now
resolve through `withBusinessContext`, whose resolver `resolveOwnerBusinessId()` re-validates that
the active-business row still **exists**, is **owned by this user**, and is **active** before
trusting it. My inline version trusted `user_active_business.business_id` **directly** — a stale or
foreign row would have been believed. In a sprint whose whole subject is cross-tenant scoping, I had
hand-rolled the weaker of the two resolvers at the very top of the query.

**Two error-path response shapes changed**, and by the consumer test (RULE 18 as settled 2026-08-18)
this proceeds unattended: the only consumer of either route is `ThreadsPanel.tsx`, inside this repo,
found by the sweep, and Ask Aria is not one of the cached-PWA surfaces.

| route | before | after |
|---|---|---|
| search | `401 {results:[]}` · no business `200 {results:[]}` | `401 {error}` · `400 {error:'No business'}` |
| thread | no business `403 {error}` | `400 {error:'No business'}` |

The panel treats any non-`ok` response as an error either way, so nothing on screen changes. The
success shapes are untouched.

A test now asserts both routes use the rail and declare **no** local resolver, with a mutation probe
proving the `` assertion can go red — it is a regex literal, not `new RegExp('…')`, where ``
would be a backspace character.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **907 passed / 907** across 74 files
- **Mutations, all RED:** hard delete restored (4 tests) · list business filter dropped · tombstone
  reopened by id · search business filter dropped · tombstones into search · auto-titler title
  UPDATE · unreachable search route
- **Live proofs:** soft delete (rolled back, nothing left behind: 0 tombstoned, 0 leftovers, 288
  rows) · cross-tenant search · both query plans
- `npx next build` — **BUILD_EXIT=0**, read from the log, never the wrapper
