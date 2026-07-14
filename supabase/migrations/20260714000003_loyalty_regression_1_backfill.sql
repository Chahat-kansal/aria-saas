-- LOYALTY-REGRESSION-1 backfill — idempotent, scoped to exactly 2 named sales for Sip Café
-- (ff5055a0-c351-4ada-817a-1804961035f3). Root cause: commit 44da08f7 (ORD-EARN-ON-PICKUP,
-- 2026-07-06) moved the earnOnSale() call to fire only from the "Online Orders" queue's manual
-- PATCH-to-completed transition (src/app/api/pos/online-orders/[id]/route.ts). It missed that the
-- KDS "delivered" bump (src/app/api/pos/kds/[id]/route.ts, live since 77ed31ef, 2026-07-03) also
-- drives pos_online_orders.status -> 'completed' via a raw supabaseAdmin update that never called
-- earnOnSale. Sales 9e5f0299 ($7) and 916644c1 ($20) for customer dc69d5e2 both completed via that
-- bypass path and got zero pos_loyalty_transactions rows. Confirmed via platform-wide scan
-- (30-day window, all businesses with program_enabled=true and a working loyalty history) that
-- these are the ONLY two affected sales anywhere.
--
-- Replicates earnOnSale()'s full effect, not just the ledger row — a bare INSERT into
-- pos_loyalty_transactions alone would leave pos_customers.points_balance/total_spent/visit_count
-- silently under-reporting forever, exactly the kind of secondary drift this fix is meant to close.
-- points_per_dollar=1 confirmed live (pos_loyalty_config), matching the $7->7pts / $20->20pts
-- expectation and the working a2e9af32 precedent ($13->13pts).

DO $$
DECLARE
  v_biz uuid := 'ff5055a0-c351-4ada-817a-1804961035f3';
  v_cust uuid := 'dc69d5e2-d4d7-4eb0-b97a-89f990fb4ff7';
  v_sale1 uuid := '9e5f0299-7f16-4ae5-ba0a-8517ff4edb19'; -- $7 -> 7 pts, 2026-07-12
  v_sale2 uuid := '916644c1-fccb-41ec-8732-baa3a0d9c882'; -- $20 -> 20 pts, 2026-07-14
  v_added_points integer := 0;
  v_added_spend numeric := 0;
  v_added_visits integer := 0;
  v_latest_visit timestamptz := '2026-07-14 03:24:09.733348+00';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pos_loyalty_transactions WHERE sale_id = v_sale1 AND type = 'earn') THEN
    INSERT INTO pos_loyalty_transactions (business_id, customer_id, sale_id, type, points_delta, stamps_delta, created_at)
      VALUES (v_biz, v_cust, v_sale1, 'earn', 7, 0, '2026-07-12 03:50:47.967792+00');
    v_added_points := v_added_points + 7;
    v_added_spend := v_added_spend + 7;
    v_added_visits := v_added_visits + 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pos_loyalty_transactions WHERE sale_id = v_sale2 AND type = 'earn') THEN
    INSERT INTO pos_loyalty_transactions (business_id, customer_id, sale_id, type, points_delta, stamps_delta, created_at)
      VALUES (v_biz, v_cust, v_sale2, 'earn', 20, 0, v_latest_visit);
    v_added_points := v_added_points + 20;
    v_added_spend := v_added_spend + 20;
    v_added_visits := v_added_visits + 1;
  END IF;

  IF v_added_points > 0 OR v_added_visits > 0 THEN
    UPDATE pos_customers
      SET points_balance = coalesce(points_balance, 0) + v_added_points,
          loyalty_points = coalesce(loyalty_points, 0) + v_added_points,
          total_spent = coalesce(total_spent, 0) + v_added_spend,
          visit_count = coalesce(visit_count, 0) + v_added_visits,
          last_visit = GREATEST(coalesce(last_visit, v_latest_visit), v_latest_visit)
      WHERE id = v_cust;
  END IF;
END $$;
