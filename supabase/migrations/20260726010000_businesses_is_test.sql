-- Additive (RULE0): a boolean flag marking a business as test/fixture data, not a real business.
-- Default false so every existing row is unaffected. Used to exclude test businesses from
-- cross-business PUBLIC surfaces (community global feed/Discover, network-wide search/reels/live,
-- any cross-business ranking) — a business's own direct pages (profile, leaderboard, owner
-- dashboard) are NEVER filtered by this flag; it only hides a business from surfaces that
-- aggregate/rank it alongside other businesses' real data.
alter table businesses add column if not exists is_test boolean not null default false;

update businesses set is_test = true where id in (
  '00000000-0000-4000-a000-000000000101', -- Smoke Test Café (SECURITY-P4 smoke-suite fixture)
  '00000000-0000-4000-a000-000000000001'  -- stale "Sip (E2E Test)" — see founder-review flag, not deleted
);
