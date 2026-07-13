-- ============================================================================
-- APPLIED MANUALLY 2026-07-09. RECORD ONLY — NEVER RE-RUN.
--
-- This was executed once directly against production (project nxfzippunqvqsvkmwtjv)
-- to purge 16 non-Sip test businesses. Verified applied (WORKTREE-TRIAGE-1,
-- 2026-07-13): the pre-purge businesses are gone; the 3 current non-Sip
-- businesses were all created ON/AFTER 2026-07-09, including "Sip (E2E Test)"
-- which the smoke suite (tests/smoke/) depends on.
--
-- Deliberately kept OUT of supabase/migrations/ — a destructive one-off
-- dropped into the replayable migration chain is a footgun for any fresh
-- environment (local dev, a new branch, disaster recovery) that replays
-- migrations from scratch and would delete businesses again, including any
-- real ones created since. This file exists purely as a historical record of
-- what was run and why.
-- ============================================================================

-- Cleanup migration: delete all businesses except Sip Café (ff5055a0-c351-4ada-817a-1804961035f3).
-- Intentional destructive test-data purge. Removes 16 businesses and all rows that reference them.
--
-- Ordering notes (discovered via live-schema inspection + dry run against project nxfzippunqvqsvkmwtjv):
--   - 337 FKs to businesses are ON DELETE CASCADE and clean up automatically.
--   - 31 are NO ACTION and 6 are SET NULL directly on businesses (the 37-table list below);
--     NO ACTION defers its check to end-of-statement, so it resolves as long as the whole
--     cascade + these deletes run inside one statement (they do, via the WITH block below).
--   - 4 RESTRICT edges exist deeper in the cascade tree (checked immediately, cannot self-resolve
--     via same-statement cascade) and must be cleared BEFORE triggering the businesses cascade:
--       pos_return_lines.original_item_id -> pos_sale_items
--       pos_returns.original_sale_id       -> pos_sales
--       wholesale_order_items.product_id   -> pos_products
--       wholesale_orders.customer_id       -> customers
--   - businesses/customers/pos_products/pos_sales/pos_sale_items/pos_shift_reports/staff_members
--     carry a "no_hard_delete_*" BEFORE DELETE trigger (protect_critical_data()) that raises unless
--     current_setting('app.allow_account_deletion') = 'on'. SET LOCAL scopes this to the transaction.
--   - loyalty_identity has no business_id column (global cross-business identity table) — not in scope.

BEGIN;
SET LOCAL app.allow_account_deletion = 'on';

CREATE TEMP TABLE target_businesses AS
SELECT id FROM businesses WHERE id <> 'ff5055a0-c351-4ada-817a-1804961035f3';

CREATE TEMP TABLE target_sales AS SELECT id FROM pos_sales WHERE business_id IN (SELECT id FROM target_businesses);
CREATE TEMP TABLE target_products AS SELECT id FROM pos_products WHERE business_id IN (SELECT id FROM target_businesses);
CREATE TEMP TABLE target_customers_tbl AS SELECT id FROM customers WHERE business_id IN (SELECT id FROM target_businesses);

-- Clear RESTRICT-guarded rows before the cascade fires.
DELETE FROM wholesale_order_items WHERE product_id IN (SELECT id FROM target_products);
DELETE FROM wholesale_orders WHERE customer_id IN (SELECT id FROM target_customers_tbl);
DELETE FROM pos_returns
  WHERE original_sale_id IN (SELECT id FROM target_sales)
     OR return_sale_id IN (SELECT id FROM target_sales)
     OR exchange_sale_id IN (SELECT id FROM target_sales);
-- (cascades to pos_return_lines automatically)

-- Direct business_id NO ACTION / SET NULL tables (37), plus the businesses rows themselves,
-- combined in one statement so end-of-statement NO ACTION checks see the final state.
WITH
d_ad_impressions AS (DELETE FROM ad_impressions WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_ad_campaigns AS (DELETE FROM ad_campaigns WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_aria_ai_calls AS (DELETE FROM aria_ai_calls WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_aria_influencer_posts AS (DELETE FROM aria_influencer_posts WHERE featured_business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_aria_promotions AS (DELETE FROM aria_promotions WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_bank_transactions AS (DELETE FROM bank_transactions WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_bank_accounts AS (DELETE FROM bank_accounts WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_booking_availability AS (DELETE FROM booking_availability WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_booking_availability_rules AS (DELETE FROM booking_availability_rules WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_community_consent_log AS (DELETE FROM community_consent_log WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_community_live_chat AS (DELETE FROM community_live_chat WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_community_notifications AS (DELETE FROM community_notifications WHERE actor_business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_competitor_snapshots AS (DELETE FROM competitor_snapshots WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_instore_conversations AS (DELETE FROM instore_conversations WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_instore_demand_signals AS (DELETE FROM instore_demand_signals WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_instore_kiosk_configs AS (DELETE FROM instore_kiosk_configs WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_invoice_reminders AS (DELETE FROM invoice_reminders WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_loyalty_fraud_flags AS (DELETE FROM loyalty_fraud_flags WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_loyalty_referrals AS (DELETE FROM loyalty_referrals WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_loyalty_reward_rules AS (DELETE FROM loyalty_reward_rules WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_loyalty_tiers AS (DELETE FROM loyalty_tiers WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_nps_responses AS (DELETE FROM nps_responses WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_pos_ai_nudges AS (DELETE FROM pos_ai_nudges WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_pricing_suggestions AS (DELETE FROM pricing_suggestions WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_product_bundles AS (DELETE FROM product_bundles WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_profit_leak_history AS (DELETE FROM profit_leak_history WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_recipe_waste_log AS (DELETE FROM recipe_waste_log WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_recurring_invoices AS (DELETE FROM recurring_invoices WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_review_crises AS (DELETE FROM review_crises WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_scheduled_price_changes AS (DELETE FROM scheduled_price_changes WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_social_content_library AS (DELETE FROM social_content_library WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_social_inbox AS (DELETE FROM social_inbox WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_support_tickets AS (DELETE FROM support_tickets WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_user_active_business AS (DELETE FROM user_active_business WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_winback_automations AS (DELETE FROM winback_automations WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_xero_sync_history AS (DELETE FROM xero_sync_history WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_xero_sync_queue AS (DELETE FROM xero_sync_queue WHERE business_id IN (SELECT id FROM target_businesses) RETURNING 1),
d_businesses AS (DELETE FROM businesses WHERE id IN (SELECT id FROM target_businesses) RETURNING id)
SELECT
  (SELECT count(*) FROM d_ad_impressions) ad_impressions,
  (SELECT count(*) FROM d_ad_campaigns) ad_campaigns,
  (SELECT count(*) FROM d_aria_ai_calls) aria_ai_calls,
  (SELECT count(*) FROM d_aria_influencer_posts) aria_influencer_posts,
  (SELECT count(*) FROM d_aria_promotions) aria_promotions,
  (SELECT count(*) FROM d_bank_transactions) bank_transactions,
  (SELECT count(*) FROM d_bank_accounts) bank_accounts,
  (SELECT count(*) FROM d_booking_availability) booking_availability,
  (SELECT count(*) FROM d_booking_availability_rules) booking_availability_rules,
  (SELECT count(*) FROM d_community_consent_log) community_consent_log,
  (SELECT count(*) FROM d_community_live_chat) community_live_chat,
  (SELECT count(*) FROM d_community_notifications) community_notifications,
  (SELECT count(*) FROM d_competitor_snapshots) competitor_snapshots,
  (SELECT count(*) FROM d_instore_conversations) instore_conversations,
  (SELECT count(*) FROM d_instore_demand_signals) instore_demand_signals,
  (SELECT count(*) FROM d_instore_kiosk_configs) instore_kiosk_configs,
  (SELECT count(*) FROM d_invoice_reminders) invoice_reminders,
  (SELECT count(*) FROM d_loyalty_fraud_flags) loyalty_fraud_flags,
  (SELECT count(*) FROM d_loyalty_referrals) loyalty_referrals,
  (SELECT count(*) FROM d_loyalty_reward_rules) loyalty_reward_rules,
  (SELECT count(*) FROM d_loyalty_tiers) loyalty_tiers,
  (SELECT count(*) FROM d_nps_responses) nps_responses,
  (SELECT count(*) FROM d_pos_ai_nudges) pos_ai_nudges,
  (SELECT count(*) FROM d_pricing_suggestions) pricing_suggestions,
  (SELECT count(*) FROM d_product_bundles) product_bundles,
  (SELECT count(*) FROM d_profit_leak_history) profit_leak_history,
  (SELECT count(*) FROM d_recipe_waste_log) recipe_waste_log,
  (SELECT count(*) FROM d_recurring_invoices) recurring_invoices,
  (SELECT count(*) FROM d_review_crises) review_crises,
  (SELECT count(*) FROM d_scheduled_price_changes) scheduled_price_changes,
  (SELECT count(*) FROM d_social_content_library) social_content_library,
  (SELECT count(*) FROM d_social_inbox) social_inbox,
  (SELECT count(*) FROM d_support_tickets) support_tickets,
  (SELECT count(*) FROM d_user_active_business) user_active_business,
  (SELECT count(*) FROM d_winback_automations) winback_automations,
  (SELECT count(*) FROM d_xero_sync_history) xero_sync_history,
  (SELECT count(*) FROM d_xero_sync_queue) xero_sync_queue,
  (SELECT count(*) FROM d_businesses) businesses_deleted;

COMMIT;
