-- CRITICAL: 11 tables had Row Level Security DISABLED — every row was exposed
-- to anyone holding the public anon key, including kiosk conversations and bank data.
--
-- Pattern matches existing pos_sales policy: a single FOR ALL policy that scopes
-- rows by business_id via the owner's auth.uid().
--
-- supabaseAdmin (service role) bypasses RLS, so all server-side API routes
-- (which use supabaseAdmin) continue to work unchanged. Direct anon/authenticated
-- DB access is now restricted to the owner's own businesses.
--
-- Tables:
--   business_expenses, instore_kiosk_configs, instore_conversations,
--   instore_demand_signals, ad_campaigns, ad_impressions, pricing_suggestions,
--   product_bundles, pos_ai_nudges, bank_accounts, bank_transactions

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'business_expenses',
    'instore_kiosk_configs',
    'instore_conversations',
    'instore_demand_signals',
    'ad_campaigns',
    'ad_impressions',
    'pricing_suggestions',
    'product_bundles',
    'pos_ai_nudges',
    'bank_accounts',
    'bank_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS biz_owner_all ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY biz_owner_all ON public.%I FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));',
      t
    );
  END LOOP;
END $$;