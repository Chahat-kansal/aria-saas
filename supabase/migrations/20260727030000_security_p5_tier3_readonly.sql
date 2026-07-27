-- SECURITY-P5 Tier 3 — read-only SECURITY DEFINER functions with anon/authenticated EXECUTE.
-- Each returns per-business or schema-wide diagnostic data with p_business_id/p_business trusted
-- with no auth.uid() check inside the function — a direct anon/authenticated RPC call could pull
-- another business's revenue-by-product breakdown (velocity_aggregate) or order-health metrics
-- (the wh_* functions) by id, and wh_rls_disabled_count() leaks schema-wide RLS-coverage gaps
-- (attacker recon value: which tables lack row-level security at all).
--
-- Traced every real call site repo-wide before touching grants (RULE0): velocity_aggregate is
-- called from src/lib/inventory/velocity.ts, whose only two callers
-- (src/app/api/pos/inventory/velocity/route.ts, via withBusinessContext's session-resolved
-- businessId, and src/app/api/cron/menu-engineering/route.ts, a cron loop) both pass
-- supabaseAdmin and a business id resolved server-side, never client-supplied. The four wh_*
-- functions are called only from src/app/api/cron/aria-health-monitor/route.ts (gated by
-- verifyCronAuth() — fails closed with 401 unless the request carries the exact CRON_SECRET
-- bearer token) and src/lib/aria/health-signals.ts, both via supabaseAdmin. No legitimate
-- anon/authenticated caller exists for any of these five — grants-only fix, no application code
-- changed.
revoke execute on function velocity_aggregate(uuid) from public, anon, authenticated;
grant execute on function velocity_aggregate(uuid) to service_role;

revoke execute on function wh_drift_count(uuid, timestamptz) from public, anon, authenticated;
grant execute on function wh_drift_count(uuid, timestamptz) to service_role;

revoke execute on function wh_headless_count(uuid, timestamptz) from public, anon, authenticated;
grant execute on function wh_headless_count(uuid, timestamptz) to service_role;

revoke execute on function wh_payments_coverage(uuid, timestamptz) from public, anon, authenticated;
grant execute on function wh_payments_coverage(uuid, timestamptz) to service_role;

revoke execute on function wh_rls_disabled_count() from public, anon, authenticated;
grant execute on function wh_rls_disabled_count() to service_role;
