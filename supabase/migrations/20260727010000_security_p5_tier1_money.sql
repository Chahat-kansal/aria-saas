-- SECURITY-P5 Tier 1 — money + destructive SECURITY DEFINER functions found executable by
-- anon/authenticated via a fresh advisors run (P4 follow-up). Traced every real call site
-- (grep .rpc('name' across src/, scripts/, e2e/) before touching grants, per RULE0 — never
-- blind-revoke:
--
-- loyalty_preload_load/spend/refund — all 5 real callers use supabaseAdmin (service role) from
-- src/lib/loyalty/preload.ts, itself only ever invoked from src/app/api/loyalty/preload/spend/
-- route.ts (authenticated owner/staff session, customer cross-checked against the caller's own
-- business_id before the RPC) and src/app/api/webhooks/stripe-preload/route.ts (Stripe webhook
-- signature verified via stripe.webhooks.constructEvent before ever reaching the RPC). No
-- anon/authenticated caller exists anywhere in the codebase today.
--
-- credit_image_credits — sole caller is src/app/api/webhooks/stripe-image-credits/route.ts,
-- also Stripe-signature-verified before the RPC, using a service-role client.
--
-- Both preload and image-credits functions TRUST their p_business/p_customer/p_amount/p_pi
-- arguments directly with no auth.uid() check and no verification that p_pi is a real Stripe
-- payment — idempotency (skip if this exact p_pi/p_sale was already processed) is the only
-- internal guard. If these were ever reachable by a raw anon/authenticated rpc() call, an
-- attacker could manufacture preload balance or image credits for free, or drain another
-- customer's balance with a fabricated sale id. Confirmed CLOSED by grants alone today (the real
-- guard is that only server-side, already-verified callers exist) — this migration makes that
-- structural instead of incidental.
--
-- purge_account_data — the one function in this tier that IS self-guarding: derives the caller's
-- identity from auth.uid() and only ever deletes businesses where user_id = that caller. Correct
-- as authenticated-only (anon calling it just hits its own "not authenticated" exception); still
-- tightened here since anon has no legitimate reason to hold this grant at all.
revoke execute on function loyalty_preload_load(uuid, uuid, numeric, numeric, text) from public, anon, authenticated;
grant execute on function loyalty_preload_load(uuid, uuid, numeric, numeric, text) to service_role;

revoke execute on function loyalty_preload_refund(uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function loyalty_preload_refund(uuid, uuid, numeric, text, text) to service_role;

revoke execute on function loyalty_preload_spend(uuid, uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function loyalty_preload_spend(uuid, uuid, numeric, uuid) to service_role;

revoke execute on function credit_image_credits(uuid, integer, text, text, numeric) from public, anon, authenticated;
grant execute on function credit_image_credits(uuid, integer, text, text, numeric) to service_role;

revoke execute on function purge_account_data() from public, anon;
grant execute on function purge_account_data() to authenticated, service_role;
