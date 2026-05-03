-- POS Users: staff PIN logins with role-based permissions

CREATE TABLE IF NOT EXISTS pos_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  name text NOT NULL,
  pin text NOT NULL,  -- 4-digit PIN, not sensitive — no hashing needed
  role text DEFAULT 'cashier'
    CHECK (role IN ('cashier','supervisor','manager','owner')),
  permissions jsonb DEFAULT '{
    "can_apply_discount": true,
    "can_refund": false,
    "max_discount_pct": 10,
    "can_close_register": false,
    "can_override_price": false
  }',
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pos_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_pos_users" ON pos_users;
CREATE POLICY "own_pos_users" ON pos_users FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pos_users_business ON pos_users(business_id, is_active);
