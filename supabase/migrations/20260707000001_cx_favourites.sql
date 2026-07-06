-- cx_favourites: customer saved menu builds, feeds History + home "Your usual"
CREATE TABLE IF NOT EXISTS cx_favourites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id  uuid        NOT NULL,
  product_id   uuid        NOT NULL,
  custom_build jsonb       NOT NULL DEFAULT '{}'::jsonb,
  nickname     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);
ALTER TABLE cx_favourites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cx_favourites_admin_only" ON cx_favourites USING (false);
CREATE INDEX IF NOT EXISTS cx_favourites_cust_biz ON cx_favourites (customer_id, business_id);