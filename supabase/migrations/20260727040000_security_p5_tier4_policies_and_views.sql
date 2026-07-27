-- SECURITY-P5 Tier 4 — RLS policy misconfigurations + 4 SECURITY DEFINER-equivalent views.
-- Applied live via Supabase MCP on 2026-07-27; this file brings git in sync with prod (RULE 10).

-- 1. seo_fixes — "Service role full access seo_fixes" was a permissive ALL policy
-- (USING(true), WITH CHECK(true)) but its `roles` array was {public}, not service_role as the
-- name implied. Silently defeated the separate, correctly-scoped "Users can read own seo_fixes"
-- policy: any unauthenticated caller could SELECT every business's SEO-fix history and
-- INSERT/UPDATE/DELETE arbitrary rows for any business_id. service_role bypasses RLS regardless
-- of policy roles, so this has zero effect on the real service-role caller.
alter policy "Service role full access seo_fixes" on public.seo_fixes to service_role;

-- 2. pos_online_orders / pos_online_order_items — tracker_public_read (anon SELECT, USING(true))
-- let any unauthenticated caller select ANY columns for ANY business's orders with no filter,
-- including customer_name/email/phone/delivery_address/payment_intent_id/stripe_payment_status
-- across every tenant. The only real consumer (pickup-display/[outlet_id]/page.tsx) was moved
-- behind /api/public/pickup-display/[outlet_id]/route.ts (supabaseAdmin, 5 narrow non-PII
-- columns, scoped to one outlet) in this same commit.
--
-- public_online_orders_insert / public_online_order_items_insert (public INSERT, WITH
-- CHECK(true)) were unused, unrestricted write access to a table with subtotal/total/
-- payment_intent_id/stripe_payment_status columns — the app's real order-creation path
-- (api/public/place-order/[business_id]/route.ts) already writes via a service-role client;
-- grep confirmed zero direct .insert() calls anywhere using a session/anon client.
--
-- biz_online_orders/biz_online_order_items (owner-scoped via businesses.user_id = auth.uid())
-- are correctly implemented and untouched.
drop policy if exists "tracker_public_read" on public.pos_online_orders;
drop policy if exists "public_online_orders_insert" on public.pos_online_orders;
drop policy if exists "public_online_order_items_insert" on public.pos_online_order_items;

-- 3. Four views bypass underlying-table RLS by running with the view owner's privileges (views
-- run as their owner by default, not the caller, unless security_invoker is set) and had full
-- anon/authenticated grants. customer_interactions_v is the most severe: an unfiltered UNION ALL
-- across kiosk/marketplace chat message previews, community moderation actions, and self-checkout
-- cart values with NO business_id scoping in the view itself. v_ai_costs exposes per-business AI
-- spend. aria_cache_effectiveness/reel_cost_dashboard have zero real callers anywhere in the app.
-- Every real caller of all 4 already uses a service-role or admin-gated client.
revoke all on public.customer_interactions_v from public, anon, authenticated;
grant all on public.customer_interactions_v to service_role;

revoke all on public.v_ai_costs from public, anon, authenticated;
grant all on public.v_ai_costs to service_role;

revoke all on public.aria_cache_effectiveness from public, anon, authenticated;
grant all on public.aria_cache_effectiveness to service_role;

revoke all on public.reel_cost_dashboard from public, anon, authenticated;
grant all on public.reel_cost_dashboard to service_role;
