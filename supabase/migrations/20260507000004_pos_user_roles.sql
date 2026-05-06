-- Add role and permissions to pos_users if not already there
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS role text DEFAULT 'cashier'
  CHECK (role IN ('owner','admin','manager','cashier','supervisor'));
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}';
-- permissions: {can_refund, can_discount, can_void, can_view_reports, can_edit_products, can_close_register, can_open_register}
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS outlet_id uuid;
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add manager PIN override support
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS override_pin_hash text;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_pos_users_business_role ON pos_users(business_id, role, is_active);
