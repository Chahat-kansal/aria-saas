-- Admin System Tables
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text DEFAULT 'support' CHECK (role IN ('owner','admin','support','billing','viewer')),
  permissions jsonb DEFAULT '{
    "can_disable_accounts": false,
    "can_view_billing": false,
    "can_impersonate": false,
    "can_send_announcements": false,
    "can_manage_admins": false,
    "can_view_all_data": true
  }',
  last_login_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by text
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL,
  admin_role text,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_name text,
  details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_email, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  enabled_for_plans text[] DEFAULT '{"pro","enterprise"}',
  enabled_for_business_ids text[] DEFAULT '{}',
  disabled_for_business_ids text[] DEFAULT '{}',
  is_globally_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO feature_flags (flag_key, label, description, enabled_for_plans, is_globally_enabled) VALUES
  ('pos_terminal', 'POS Terminal', 'Full AriaPOS terminal', '{"free","pro","enterprise"}', true),
  ('warehouse', 'Warehouse Module', 'Full warehouse management', '{"pro","enterprise"}', false),
  ('social_media', 'Social Media Manager', 'AI social media posting', '{"pro","enterprise"}', false),
  ('weekly_orders', 'AI Weekly Orders', 'Automated order generation', '{"pro","enterprise"}', false),
  ('custom_features', 'Custom Features', 'Aria builds custom dashboard features', '{"enterprise"}', false),
  ('mobile_scanner', 'Mobile Scanner', 'Barcode scan inventory on mobile', '{"pro","enterprise"}', false),
  ('ai_receipt', 'AI Receipt Message', 'Personalised receipt messages', '{"pro","enterprise"}', false),
  ('competitor_analysis', 'Competitor Analysis', 'Google Places competitor data', '{"enterprise"}', false),
  ('advanced_reports', 'Advanced Reports', 'Commission, cashier, closures reports', '{"pro","enterprise"}', false),
  ('winback_sms', 'Winback SMS', 'Twilio SMS campaigns', '{"pro","enterprise"}', false)
ON CONFLICT (flag_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info' CHECK (type IN ('info','warning','success','critical','maintenance')),
  is_active boolean DEFAULT true,
  show_to_plans text[],
  show_to_industries text[],
  cta_label text,
  cta_href text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_announcements" ON announcements;
CREATE POLICY "public_read_announcements" ON announcements FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_business ON usage_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_event ON usage_logs(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  user_email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  assigned_to text,
  resolution text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise','trial','disabled')),
  ADD COLUMN IF NOT EXISTS plan_override_by text,
  ADD COLUMN IF NOT EXISTS plan_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;
