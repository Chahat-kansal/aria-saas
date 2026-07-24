-- SECURITY-P4 — launch-gate closeout. Fresh Supabase security advisors run found 8 tables shipped
-- since 15 Jul with RLS DISABLED ENTIRELY (not the established "RLS enabled, no policy" pattern
-- this repo otherwise uses everywhere for service-role-only tables — e.g. _dup_customer_merge_log).
-- RLS-disabled means PostgREST exposes these tables directly to the anon key (embedded in every
-- client bundle) with no row-level gate at all. None of these tables are ever meant to be read/
-- written by anon or authenticated clients — every app code path touches them exclusively via
-- supabaseAdmin (service role, bypasses RLS regardless). Enabling RLS with zero policies makes
-- service-role the only role that can touch them (the same defense-in-depth pattern already used
-- for _dup_customer_merge_log and dozens of other service-role-only tables in this schema),
-- without requiring any app code change since nothing here ever queried them as anon/authenticated.
alter table community_member_loyalty_links enable row level security;
alter table community_leaderboard_snapshots enable row level security;
alter table community_leaderboard_awards enable row level security;
alter table community_backfill_review_queue enable row level security;
alter table community_level_config enable row level security;
alter table community_level_awards enable row level security;
alter table community_leaderboard_config enable row level security;
alter table product_velocity enable row level security;

-- claim_daily_digest_send (CX-GAME-DIGEST-FIX, 2026-07-25) was created with default PostgreSQL
-- grants — EXECUTE to PUBLIC, which PostgREST exposes to anon/authenticated at /rest/v1/rpc/... .
-- A public caller could burn any customer's daily digest claim (denial-of-digest) or, via the
-- claimed/not-claimed response, probe whether a given customer_id exists. This function is only
-- ever meant to be called from server-side cron/scripts via supabaseAdmin (service role).
revoke execute on function claim_daily_digest_send(uuid, boolean) from public;
revoke execute on function claim_daily_digest_send(uuid, boolean) from anon;
revoke execute on function claim_daily_digest_send(uuid, boolean) from authenticated;
grant execute on function claim_daily_digest_send(uuid, boolean) to service_role;
-- Also flagged by the advisor: mutable search_path. Not independently exploitable here (the
-- function is SECURITY INVOKER, not DEFINER, and only service_role can call it after the grant fix
-- above), but pinning it is free and matches Supabase's own hardening recommendation.
alter function claim_daily_digest_send(uuid, boolean) set search_path = public;

-- movement_velocity_aggregate (INV-VELOCITY-1, same post-15-Jul surface) has the identical
-- PUBLIC/anon/authenticated EXECUTE gap. Read-only (no write/claim risk), but still meant to be
-- server-side-only (called exclusively from the menu-engineering cron via supabaseAdmin) — an
-- anon caller could otherwise probe any business's rolling sales velocity by guessing a
-- business_id, which is unintended cross-tenant read exposure.
revoke execute on function movement_velocity_aggregate(uuid) from public;
revoke execute on function movement_velocity_aggregate(uuid) from anon;
revoke execute on function movement_velocity_aggregate(uuid) from authenticated;
grant execute on function movement_velocity_aggregate(uuid) to service_role;
