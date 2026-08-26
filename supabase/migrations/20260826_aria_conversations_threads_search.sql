-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- S2 / S2B — CONVERSATION PERSISTENCE: pin, soft-delete, manual-title marker, full-text search.
--
-- APPLIED TO PRODUCTION 2026-08-26 BY THE FOUNDER, BY HAND.
-- This file is the RECORD of what actually ran, transcribed from the live database
-- (pg_get_functiondef / pg_get_expr / pg_indexes) — NOT from the proposal, and not from memory.
--
-- ⚠️ IT IS NOT THE PROPOSAL. docs/aria/S2-MIGRATION-PROPOSAL.sql defined search_tsv with an INLINE
-- SUBQUERY, which Postgres rejects outright: a generation expression may only use immutable
-- functions and may not contain a subquery. The whole transaction would have rolled back, taking
-- the three perfectly good columns with it. The subquery was moved into an IMMUTABLE function and
-- the generated column calls that instead. See RUN-S2B.md.
--
-- ⚠️ CAVEAT FOR ANYONE EDITING aria_conv_search_tsv LATER:
-- changing the function body does NOT retroactively update stored search_tsv values. A STORED
-- generated column is computed on write. Existing rows keep whatever the OLD function produced
-- until each row is rewritten. To rebuild after a change:
--     ALTER TABLE public.aria_conversations DROP COLUMN search_tsv;
--     -- then re-add it exactly as below, which recomputes every row
-- Do not assume a function change is enough. It is not.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. threads: pin, soft-delete, and a marker for a manual rename ────────────────────────────
-- pinned_at is a timestamp rather than a boolean so pinned threads can order among themselves.
ALTER TABLE public.aria_conversations
  ADD COLUMN IF NOT EXISTS pinned_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS title_edited_at timestamptz;

COMMENT ON COLUMN public.aria_conversations.deleted_at IS
  'Soft delete. Set by the UI; the row and its messages survive. Never hard-DELETE from a UI path — '
  'owners delete by accident and their business records are not disposable.';

-- ── 2. the search vector, via an IMMUTABLE function ───────────────────────────────────────────
-- A generated column cannot contain a subquery, so the aggregation over the JSONB message array
-- lives here. IMMUTABLE is required for the column to be legal; PARALLEL SAFE lets the planner
-- use it freely.
CREATE OR REPLACE FUNCTION public.aria_conv_search_tsv(_title text, _messages jsonb)
 RETURNS tsvector
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT to_tsvector('english',
    coalesce(_title,'') || ' ' ||
    coalesce((
      SELECT string_agg(m ->> 'content', ' ')
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(_messages) = 'array' THEN _messages ELSE '[]'::jsonb END
      ) AS m
    ), '')
  )
$function$;

ALTER TABLE public.aria_conversations
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (public.aria_conv_search_tsv(title, messages)) STORED;

-- ── 3. the two hot paths ──────────────────────────────────────────────────────────────────────
-- (a) a business's LIVE threads, pinned first then by recency. Partial on deleted_at IS NULL so
--     tombstoned threads cost nothing to skip.
CREATE INDEX IF NOT EXISTS aria_conversations_biz_recent_idx
  ON public.aria_conversations
  USING btree (business_id, pinned_at DESC NULLS LAST, last_message_at DESC)
  WHERE (deleted_at IS NULL);

-- (b) full-text search
CREATE INDEX IF NOT EXISTS aria_conversations_search_idx
  ON public.aria_conversations USING gin (search_tsv);

-- ── RLS: unchanged ────────────────────────────────────────────────────────────────────────────
-- Already ON, business-scoped, and proven cross-tenant on 2026-08-26:
--   SIP_OWNER own=173 foreign=0 total_visible=173 | SMOKE_OWNER own=112 foreign=0 total_visible=112
-- No policy change was made. NOTE: every Ask Aria route uses supabaseAdmin (service role), which
-- BYPASSES RLS — so RLS is the backstop and each query's own business_id filter is the door.

-- ── VERIFIED LIVE AFTER APPLYING (RULE 10) ────────────────────────────────────────────────────
--   4/4 columns · 2/2 indexes (btree + gin) · 288 rows · 288 with search_tsv · 0 null
--   websearch_to_tsquery('english','coffee') matched 29 threads
