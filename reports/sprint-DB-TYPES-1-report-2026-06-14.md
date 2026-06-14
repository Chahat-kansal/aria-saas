# DB-TYPES-1 — generated DB types + typed clients (run 2026-06-14)
**Status:** ⚠️ STRUCTURAL CHANGE BLOCKED — typing the clients surfaces **1068 errors across 399 files**. Per the sprint's >20 rule + DO-NOT ("don't mass-rewrite 20+ unattended — list & stop"), Part 2 was **reverted to keep the build green**; this report is the deliverable. RULE 0. (A prior `sprint-DB-TYPES-1-report.md` from Jun 11 is left untouched.)

> **Bottom line:** typing the Supabase clients with `<Database>` **works** — it is a very live guard (it immediately caught the missing RPCs and wrong tables). But it is **not** an unattended change: it surfaces ~1068 pre-existing type conflicts, ~98% of which are the codebase's own `as Record<string, unknown>` insert/update casts colliding with the generated `Insert` types. This is a **supervised, multi-file refactor**, not a one-shot sprint.

---

## Pre-flight
1. `pwd` = `C:\Users\kansa\aria-saas-audit` ✓
2. `git log origin/main..HEAD --oneline` → empty (clean base on `80fd2ec2`).
3. **Client factories:** `src/lib/supabase-admin.ts` (service-role `supabaseAdmin` — used in ~all server/cron code), `src/lib/supabase-server.ts` (`createServerSupabaseClient`, SSR), `src/lib/supabase.ts` (browser `supabase` + a service-role `supabaseAdmin`, both with `: null as any` fallbacks → already `any`), plus ad-hoc `createClient` in `admin.ts`, `aria/brain.ts`, `aria/council.ts`, `images/pixabay.ts`, `pos/auto-fetch-image.ts`, `track-usage.ts`.
4. **Existing types file:** `src/types/database.types.ts` (830 KB, **Jun 11**, 3 days old). Properly shaped (`__InternalSupabase.PostgrestVersion: "14.5"`, `public.Tables.<table>.{Row,Insert,Update}`).

## Part 1 — generate fresh types — ⚠️ CLI BLOCKED, used existing current file
`npx supabase gen types typescript --project-id nxfzippunqvqsvkmwtjv` →
```
{"_tag":"Error","error":{"code":"LegacyGenTypesUnexpectedStatusError","message":"failed to retrieve generated types: {\"message\":\"Unauthorized\"}"}}
```
No `SUPABASE_ACCESS_TOKEN`/DB-url password available; `--linked` needs the same token. The Supabase **MCP** `generate_typescript_types` works but returns ~830 KB into context (untenable mid-session). **Decision:** use the existing `src/types/database.types.ts` — a generated file, 3 days old, **verified against the live DB** in `db-wiring-audit-2026-06-14.md` (MCP `information_schema`), no migrations since. Not hand-edited; no second `database.ts` forked (RULE 0).

**First lines of the types file (proof it's real):**
```ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: { Tables: { activity_log: {
    Row:    { action_type: string; business_id: string | null; created_at: string | null; description: string; id: string; metadata: Json | null }
    Insert: { action_type: string; business_id?: string | null; ... }
    Update: { action_type?: string; ... } } ... } }
```

## Part 2 — type the clients — DONE, then REVERTED (see Part 3)
Parameterised `createClient<Database>` / `createServerClient<Database>` / `createBrowserClient<Database>` on all factories. Confirmed `.from` IS narrowed in `@supabase/supabase-js@2.104.0` (`from<TableName extends string & keyof Schema['Tables']>(relation: TableName)`), `strict: true`.

## Part 3 — tsc triage — **1068 errors / 399 files → STOP (revert), do not mass-mark**
> **Correction:** several mid-run `tsc` checks reported "0 errors" — those were **silent OOMs** (this long session exhausted the default ~4 GB heap; the harness reported the trailing `grep`'s exit, not tsc's). Only with `NODE_OPTIONS=--max-old-space-size=6144` did tsc complete and reveal **1068**.

| category | count | nature |
|---|---|---|
| `as Record<string, unknown>` insert/update casts vs `RejectExcessProperties` Insert | ~1047 | **friction, not bugs** — casts that were workarounds for the untyped client |
| `Json \| undefined` (jsonb columns getting cast objects) | 332 | friction |
| `assignable to type 'never'` (jsonb/update) | 175 | friction |
| wrong/over-narrow `.from()` table refs | ~62 | mix |
| **`.rpc()` not in the typed function union** | **17** | **REAL drift** — e.g. `.rpc('increment')`; `increment_numeric`/`decrement_stock_quantity` absent from `pg_proc` (matches db-wiring-audit) |

By TS code: TS2339 ×334, TS2345 ×278, TS2769 ×237, TS2322 ×92, TS2352 ×37, TS2538 ×33, TS18047 ×24, TS2353 ×14. **399 files.**

**Why I did NOT add 1068 `// @ts-expect-error` markers:** that's a mass unattended rewrite of 399 files — exactly what the DO-NOT forbids, it would **mask** the 17 real bugs, and bloat the tree with ~1000 suppressions. At this magnitude "list & stop" governs. Committing the typed clients would also leave `main` red (1068 errors) — CLAUDE.md forbids committing a broken build. → **Reverted Part 2.**

## Part 4 — proof the guard is live
The 1068 errors are the proof. Representative catches:
```
src/app/api/agents/council/proposals/[id]/route.ts(57,55): error TS2345:
  Argument of type '"increment"' is not assignable to parameter of type
  '"create_product_draft" | "decrement_outlet_inventory" | ... | "wh_rls_disabled_count"'.
src/lib/supabase-admin.ts: from('this_table_xyz_does_not_exist') → not a known table name.
```
The typed client catches **wrong RPC names** and **wrong table names** at compile time — precisely the bug class that broke earlier sprints. The guard works; the 1000+ defensive casts are what's in the way.

## Build gate
- After revert, the 5 client files are **unmodified vs `80fd2ec2`** (green HEAD) → build state = green pushed state. No broken build committed.
- No new deps. No DB writes/migrations. Function configs unchanged.
- **Deliverable commit:** this report only. **STOP before push.**

## Recommendation — SUPERVISED migration, not an unattended sprint
1. **Fix the 17 `.rpc()` drift bugs first** (separately) — create the missing functions or remove dead calls (see db-wiring-audit). Independent of the casts.
2. **Type the clients incrementally**, directory-by-directory, removing the `as Record<string, unknown>` insert/update casts as you go (they're redundant once the client is typed). Each dir: type → fix its handful → commit. ~399 files = multi-session.
3. Optionally a **codemod** to strip `as Record<string, unknown>` on `.insert(...)`/`.update(...)` payloads — clears the bulk (~1047) mechanically, leaving real drift to fix by hand.
4. Set `SUPABASE_ACCESS_TOKEN` and regenerate `database.types.ts` at the start of that migration.

**TO FIX WHEN BACK:** the structural win is real and worth it — it just can't be done blind in one pass. Set the access token, fix the 17 RPC bugs, then run the incremental typing migration.
