-- cx_notifications: order status, loyalty, system messages per customer
CREATE TABLE IF NOT EXISTS cx_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid        NOT NULL,
  type        text        NOT NULL DEFAULT 'system'
                          CHECK (type IN ('order', 'loyalty', 'offer', 'system')),
  title       text        NOT NULL,
  body        text,
  action_url  text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cx_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cx_notifications_admin_only" ON cx_notifications USING (false);
CREATE INDEX IF NOT EXISTS cx_notifications_cust_biz
  ON cx_notifications (customer_id, business_id, created_at DESC);