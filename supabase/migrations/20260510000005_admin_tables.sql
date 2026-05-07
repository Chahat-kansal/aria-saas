-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_name text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  enabled_for_plans text[] DEFAULT '{"pro","enterprise"}',
  enabled_for_business_ids text[] DEFAULT '{}',
  disabled_for_business_ids text[] DEFAULT '{}',
  is_globally_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

INSERT INTO feature_flags (flag_key,label,description,enabled_for_plans,is_globally_enabled)
VALUES
  ('pos_terminal','POS Terminal','Full AriaPOS terminal','{"free","pro","enterprise"}',true),
  ('warehouse','Warehouse Module','Full warehouse management','{"pro","enterprise"}',false),
  ('social_media','Social Media Manager','AI social media posting','{"pro","enterprise"}',false),
  ('weekly_orders','AI Weekly Orders','Automated order generation','{"pro","enterprise"}',false),
  ('mobile_scanner','Mobile Scanner','Barcode scan inventory','{"pro","enterprise"}',false),
  ('advanced_reports','Advanced Reports','Commission and cashier reports','{"pro","enterprise"}',false)
ON CONFLICT (flag_key) DO NOTHING;

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info'
    CHECK (type IN ('info','warning','success','critical','maintenance')),
  is_active boolean DEFAULT true,
  show_to_plans text[],
  cta_label text,
  cta_href text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "public_read_announcements" ON announcements
  FOR SELECT USING (true);

-- Usage logs
CREATE TABLE IF NOT EXISTS usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Extend businesses table
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
