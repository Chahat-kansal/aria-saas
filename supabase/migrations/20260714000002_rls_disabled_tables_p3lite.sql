-- SECURITY-P3-LITE item 3 — RLS verify pass. Live Supabase security advisors (rls_disabled_in_public)
-- showed exactly 6 public-schema tables with RLS fully disabled. Verified every access site in src/
-- for all 6 (grep + read): every single one is service-role only (supabaseAdmin / getAdminClient() /
-- makeLazyServiceRoleClient()) — no session-client or browser-side code ever queries these tables, so
-- this is not a live/exploitable gap today. Enabling RLS with NO policy is the same deny-all-for-non-
-- service-role pattern this codebase already uses on 34 other tables (rls_enabled_no_policy) — service
-- role bypasses RLS regardless, so this is zero functional change for every current caller, pure
-- defense-in-depth against a future accidental anon/session-client read path.
--
-- _dup_customer_merge_log gets the same RLS-enable (safe, additive, zero live code touches it either
-- way) — but whether to KEEP, archive, or drop this one-off migration backup table (it contains full
-- customer PII with zero live code reference) is a founder decision, not something this "safe
-- cleanup" sprint decides unilaterally. Flagged in the report, not resolved here.

alter table staff_portal_sessions enable row level security;
alter table business_brain_cache enable row level security;
alter table cost_events enable row level security;
alter table cost_subscriptions enable row level security;
alter table client_hydration_beacons enable row level security;
alter table _dup_customer_merge_log enable row level security;
