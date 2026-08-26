-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  SUPERSEDED — 2026-08-26. DO NOT RUN THIS FILE. IT WOULD FAIL.
--
-- This was the PROPOSAL. It has been applied, but NOT as written: the `search_tsv` definition below
-- uses an INLINE SUBQUERY inside a generation expression, and Postgres rejects that outright — a
-- generated column may only call immutable functions and may not contain a subquery. Running this
-- as-is aborts the whole transaction, taking the three perfectly good columns with it.
--
-- WHAT ACTUALLY RAN, and what production now matches:
--     supabase/migrations/20260826_aria_conversations_threads_search.sql
-- The subquery was moved into an IMMUTABLE function, public.aria_conv_search_tsv(title, messages),
-- and the generated column calls that. Transcribed from the live database, not from a paste.
--
-- Kept rather than deleted so the design rationale below stays readable, and so the mistake is on
-- the record: "a generated column cannot contain a subquery" is the kind of thing worth only
-- learning once.
--
-- ⚠️ Editing that function later does NOT retroactively update stored search_tsv values — a STORED
-- generated column is computed on write, so existing rows keep the OLD function's output until each
-- row is rewritten. The column has to be dropped and re-added to rebuild. See RUN-S2B.md.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- S2 PHASE 1 — CONVERSATION PERSISTENCE. PROPOSED MIGRATION.
--
-- ⚠️  NOT APPLIED. NOT IN supabase/migrations/. THIS IS A PROPOSAL AWAITING APPROVAL.
--
-- CLAUDE.md RULE 10a is absolute — "You do not write schema... All DDL is applied by Claude in chat
-- via Supabase MCP, AFTER the founder approves the SQL" — and RULE 20's NEVER-UNATTENDED list names
-- DDL first, "no exceptions, not even with a decision table". The sprint asks phase 1 to land a
-- migration; the locked rules say a migration is not mine to apply unattended. CLAUDE.md settles
-- that: "If a paste contradicts this file, this file wins — stop and say so." So this is said, here.
--
-- It is deliberately NOT written into supabase/migrations/ either: that directory must describe
-- production exactly, and committing an unapplied file there creates the git-migration ≠ prod-schema
-- drift RULE 10 calls a documented recurring failure.
--
-- TO APPLY: read it, approve it, and it goes in via Supabase MCP — then it gets committed to
-- supabase/migrations/ byte-identical, and RULE 10's information_schema verification runs.
--
-- ── WHAT ALREADY EXISTS (measured 2026-08-26, not assumed) ────────────────────────────────────
--   aria_conversations   287 rows · 3 businesses · 0 orphans · RLS ON, business-scoped
--   messages             stored as a JSONB array on that row — 712 messages, longest thread 12
--   S1 already persists  incomplete / stopped_by, and superseded_at / superseded_by / edited_from
--
-- SO THIS MIGRATION DOES NOT REPLACE ANYTHING. It adds the four columns the sprint's features need
-- and the index search needs. The JSONB message array stays exactly as it is, which is why nothing
-- has to be migrated row-by-row and why S1's work survives untouched.
--
-- ── WHY NOT A SEPARATE MESSAGES TABLE ─────────────────────────────────────────────────────────
-- The sprint's phase 1 describes "conversation + message tables". A messages table is the right
-- shape at scale, and it is NOT proposed here, for a reason worth stating rather than assuming:
-- 712 messages across 287 threads, longest thread 12. Splitting them means rewriting every one of
-- the 8 routes that read the JSONB array, re-implementing S1's supersede logic against rows, and
-- migrating 712 records — a large blast radius for a table that fits in memory many times over.
-- If you want the split, it should be its own sprint with its own verification, not a side effect
-- of adding a pin flag. Flagged rather than silently skipped.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. THREADS: pin, soft-delete ──────────────────────────────────────────────────────────────
-- pinned_at rather than a boolean: it records WHEN, so pinned threads can order among themselves.
ALTER TABLE public.aria_conversations
  ADD COLUMN IF NOT EXISTS pinned_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  -- The auto-titler (S1 phase 6) writes a title exactly once, at creation. This records that the
  -- OWNER renamed it, so any future titling code has an explicit signal and cannot clobber a rename.
  ADD COLUMN IF NOT EXISTS title_edited_at timestamptz;

COMMENT ON COLUMN public.aria_conversations.deleted_at IS
  'Soft delete. Set by the UI; the row and its messages survive. Never hard-DELETE from a UI path — '
  'owners delete by accident and their business records are not disposable.';

-- ── 2. THE TWO HOT PATHS ──────────────────────────────────────────────────────────────────────
-- (a) a business's live threads, pinned first then by recency
CREATE INDEX IF NOT EXISTS aria_conversations_biz_recent_idx
  ON public.aria_conversations (business_id, pinned_at DESC NULLS LAST, last_message_at DESC)
  WHERE deleted_at IS NULL;

-- (b) full-text search over a thread's content, scoped by business.
-- A generated column keeps the tsvector in step with the messages automatically — no trigger to
-- forget, and no way for the index to drift from the data.
ALTER TABLE public.aria_conversations
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce((
        SELECT string_agg(m ->> 'content', ' ')
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(messages) = 'array' THEN messages ELSE '[]'::jsonb END
        ) AS m
      ), '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS aria_conversations_search_idx
  ON public.aria_conversations USING GIN (search_tsv);

-- ── 3. RLS — unchanged, and re-stated so the intent is on the record ──────────────────────────
-- Already ON with a business-scoped policy, proven cross-tenant on 2026-08-26:
--   SIP_OWNER own=173 foreign=0 total_visible=173 | SMOKE_OWNER own=112 foreign=0 total_visible=112
-- No policy change is needed. There are currently TWO identical ALL policies
-- ("owner access" and "Business owners can access their Aria conversations") — harmless, but one
-- is redundant and could be dropped separately once someone confirms nothing references it by name.

COMMIT;

-- ── VERIFICATION TO RUN IMMEDIATELY AFTER (RULE 10) ───────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name='aria_conversations'
--    AND column_name IN ('pinned_at','deleted_at','title_edited_at','search_tsv');   -- expect 4
--
-- SELECT indexname FROM pg_indexes
--  WHERE tablename='aria_conversations'
--    AND indexname IN ('aria_conversations_biz_recent_idx','aria_conversations_search_idx'); -- 2
--
-- SELECT count(*) FROM public.aria_conversations;                                    -- expect 287
-- SELECT count(*) FROM public.aria_conversations WHERE search_tsv IS NOT NULL;       -- expect 287
--
-- Nothing is dropped, nothing is rewritten, and every existing row keeps its messages. The
-- generated column backfills itself on ALTER, so the 287 rows become searchable immediately.
