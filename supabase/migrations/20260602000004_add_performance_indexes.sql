-- Performance indexes for most-queried tables
-- Covering indexes on columns used in WHERE clauses by hot routes

-- pos_sales: most-queried table — business+date range lookups
create index if not exists idx_pos_sales_biz_created
  on pos_sales (business_id, created_at desc);

-- pos_products: active product lookups per business
create index if not exists idx_pos_products_biz_active
  on pos_products (business_id, is_active)
  where is_active = true;

-- aria_ai_calls: AI call log lookups per business
create index if not exists idx_aria_ai_calls_biz_created
  on aria_ai_calls (business_id, created_at desc);

-- supplier_ai_suggestions: pending suggestion lookups
create index if not exists idx_supplier_ai_suggestions_biz
  on supplier_ai_suggestions (business_id, accepted, created_at desc);

-- pos_daily_briefings: briefing lookups per business by date
create index if not exists idx_pos_daily_briefings_biz_date
  on pos_daily_briefings (business_id, briefing_date desc);