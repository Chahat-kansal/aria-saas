-- SEC-BATCH2 — database hardening. Audit 3 Aug 2026.
--
-- Scope: remove access that NOTHING in the application uses, and pin function search_path.
-- Every table touched here is accessed exclusively through supabaseAdmin (service role), which
-- bypasses RLS — re-verified independently against all call sites, not taken on trust.
--
-- Deliberately NOT touched: the ~50 tables with "RLS enabled, no policy" (cx_sessions,
-- cx_otp_codes, loyalty_*, cron_runs, council_cache, ...). That is the correct service-role-only
-- pattern, not a bug. The Supabase linter flags them at INFO; ignore it.
--
-- ══ STEP 3 IS DELIBERATELY ABSENT — SEE THE BLOCK AT THE BOTTOM OF THIS FILE ══
-- The three SECURITY DEFINER revokes (#7, #8, #9) would each have caused a production outage.
-- Preflight evidence and the exact reasons are recorded there so this is not re-attempted blindly.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — #5, #6: anon could SELECT every community member and the whole follow
-- graph across every business, using the anon key that ships in the browser bundle.
-- app/community/u/[id]/layout.tsx already declares these profiles must never be
-- discoverable; noindex asked crawlers nicely, this enforces it.
--
-- VERIFIED SAFE: all 18 community_members sites and all 12 community_follows sites are
-- server-side supabaseAdmin. The single 'use client' file (dashboard/marketplace/page.tsx)
-- references community_members only as a TypeScript type on a joined field and never
-- queries the table.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "community_members_public_read" on public.community_members;
drop policy if exists "community_follows_public_read" on public.community_follows;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — #25–#30: unauthenticated INSERT with WITH CHECK (true).
-- community_consent_log is the AU Privacy Act audit trail; forged rows there are a
-- compliance problem, not spam. All six are written server-side only:
--   community_live_chat  <- POST /api/community/live/[id]/chat (both live pages fetch it)
--   customer_hub_clicks  <- app/[slug]/page.tsx:143   supabaseAdmin.insert
--   quote_views          <- app/quote/[token]/page.tsx:43  supabaseAdmin.insert
--   the three community_* <- api/community/{follows,session}
--
-- LIVE CHAT IS NOT BROKEN BY THIS: the two live pages subscribe to Realtime
-- postgres_changes on community_live_chat, which enforces RLS *SELECT* — and that comes
-- from a SEPARATE "public read" policy which this migration leaves in place. Only the
-- INSERT policy is dropped, and no browser code inserts.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "community_consent_log_anon_insert" on public.community_consent_log;
drop policy if exists "community_follows_anon_insert"     on public.community_follows;
drop policy if exists "community_members_anon_insert"     on public.community_members;
drop policy if exists "auth insert"                       on public.community_live_chat;
drop policy if exists "hub_clicks_anon_insert"            on public.customer_hub_clicks;
drop policy if exists "quote_views_anon_insert"           on public.quote_views;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — #54: pin search_path on every public function that lacks it (37 at time of
-- writing, 12 of them SECURITY DEFINER). Loop rather than a hand-written list, so
-- functions added since the audit are covered too.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (p.proconfig is null or not exists (
            select 1 from unnest(p.proconfig) c where c like 'search\_path=%'))
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 (#7, #8, #9) — NOT PERFORMED. Each revoke was an outage.
--
-- The batch spec's own preflight gate said to stop if is_business_member appeared inside
-- any RLS policy. It does — and the other two turned out to be just as load-bearing.
-- All three still hold EXECUTE for `authenticated`, deliberately. All three ALREADY have
-- search_path pinned, so there is nothing further this migration can safely do to them.
--
--  is_business_member(uuid)
--    Used by 6 live RLS policies: aria_autopilot_actions.own_autopilot,
--    aria_user_tasks.{owner_app_own_tasks,owner}, autonomy_ledger.autonomy_ledger_owner_read,
--    manager_reviews.manager_reviews_owner_read, profit_leaks."Business owners can access
--    their profit leaks". RLS predicates evaluate as the CALLING role, and EXECUTE is checked
--    against that role regardless of SECURITY DEFINER. Revoking from `authenticated` makes
--    all six policies raise on evaluation — locking owners and managers out of the Decisions
--    queue, tasks, autonomy ledger, manager reviews and profit leaks.
--
--  purge_account_data()
--    Called at src/app/api/account/delete/route.ts:25 via createServerSupabaseClient() — the
--    USER's client, i.e. the `authenticated` role, not supabaseAdmin. Revoking breaks account
--    deletion, which is a Privacy Act right-to-erasure path. Fix is to move that call to the
--    service-role client FIRST, then revoke — an application change, so it belongs in a code
--    batch, not here.
--
--  create_product_draft(uuid, text, text, text, text, text)
--    Called at src/components/products/wizard/ProductWizard.tsx:219 from a 'use client'
--    component via the BROWSER supabase client. Revoking breaks the product wizard outright.
--    Its IDOR shape is already mitigated: SECURITY-P5 added an auth.uid() ownership self-guard
--    inside the function and pinned its search_path, so the business_id parameter can no longer
--    be pointed at someone else's business.
--
-- To close these properly: move the two call sites server-side, re-check the RLS dependency
-- for is_business_member, then revoke. Tracked, not silently dropped.
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 5 (#19, storage buckets) — NOT PERFORMED. Nothing qualified.
-- The gate was "drop only policies whose qual is literally true". None of the five is:
--   media_public_read            SELECT public         (bucket_id = 'media')
--   public read pos-images       SELECT public         (bucket_id = 'pos-images')
--   public read reusable-images  SELECT public         (bucket_id = 'reusable-images')
--   reel_uploads_public          SELECT anon           (bucket_id = 'reel-uploads')
--   reel_uploads_select          SELECT authenticated  (bucket_id = 'reel-uploads')
-- Every one is scoped to a single bucket, so none is the broad policy the issue describes.
-- They do still permit LISTING objects in those buckets, which is a real (lower) exposure —
-- but closing it means deciding per-bucket whether listing is required, which is a judgement
-- call with a visible blast radius (images 404ing), not a mechanical drop. Left open.
-- ═════════════════════════════════════════════════════════════════════════════
