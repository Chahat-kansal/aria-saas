-- PRR-4 Reliability: indexes for hot query paths
-- All use IF NOT EXISTS — safe to re-run

-- POS core (heaviest read traffic)
CREATE INDEX IF NOT EXISTS idx_pos_sales_business_created
  ON pos_sales(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale
  ON pos_sale_items(sale_id);

CREATE INDEX IF NOT EXISTS idx_pos_products_business
  ON pos_products(business_id);

CREATE INDEX IF NOT EXISTS idx_pos_customers_business
  ON pos_customers(business_id);

-- Community posts
CREATE INDEX IF NOT EXISTS idx_community_posts_business_published
  ON community_posts(business_id, published_at DESC);

-- Payment lookup by sale (join in receipt + history)
CREATE INDEX IF NOT EXISTS idx_pos_sale_payments_sale
  ON pos_sale_payments(sale_id);

-- AI call log (usage analytics, cost queries)
CREATE INDEX IF NOT EXISTS idx_aria_ai_calls_business_created
  ON aria_ai_calls(business_id, created_at DESC);

-- Bank data (cash-flow page)
CREATE INDEX IF NOT EXISTS idx_bank_accounts_business
  ON bank_accounts(business_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_business_date
  ON bank_transactions(business_id, transaction_date DESC);

-- Google reviews (review page, NPS)
CREATE INDEX IF NOT EXISTS idx_google_reviews_business
  ON google_reviews(business_id);

-- Cron run history (system-health dashboard)
CREATE INDEX IF NOT EXISTS idx_cron_runs_name_started
  ON cron_runs(cron_name, started_at DESC);