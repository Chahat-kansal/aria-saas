-- ============================================================
-- Aria OS Features Migration
-- ============================================================

-- ------------------------------------------------------------
-- FEATURE 1: Daily Briefings
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  recommendations jsonb NOT NULL DEFAULT '[]',
  generated_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  UNIQUE(business_id, date)
);
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own briefings" ON daily_briefings
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- ------------------------------------------------------------
-- FEATURE 2: Website Chatbot Widget
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  enabled boolean DEFAULT false,
  api_key text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  bot_name text DEFAULT 'Aria',
  primary_color text DEFAULT '#6366f1',
  greeting text DEFAULT 'Hi! How can I help you today?',
  opening_hours jsonb DEFAULT '{}',
  services text,
  faqs jsonb DEFAULT '[]',
  guardrails text,
  escalation_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their widget" ON widget_configs
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS widget_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  messages jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE widget_conversations ENABLE ROW LEVEL SECURITY;
-- Public inserts go through service role; owners can read their conversations
CREATE POLICY "Business owners can view conversations" ON widget_conversations
  FOR SELECT USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- ------------------------------------------------------------
-- FEATURE 3: Multi-business billing / management
-- (businesses table already exists — no structural changes needed)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- FEATURE 4: Encryption & Audit
-- ------------------------------------------------------------

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own business audit logs" ON audit_logs
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS audit_logs_business_id_created_at_idx
  ON audit_logs(business_id, created_at DESC);

-- Encryption key version tracking
CREATE TABLE IF NOT EXISTS encryption_key_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL,
  activated_at timestamptz DEFAULT now(),
  notes text
);
INSERT INTO encryption_key_versions (version, notes)
  VALUES (1, 'Initial encryption key')
  ON CONFLICT DO NOTHING;

-- Compliance acceptances (Privacy Act / MARA code)
CREATE TABLE IF NOT EXISTS compliance_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  acceptance_type text NOT NULL,
  accepted_at timestamptz DEFAULT now(),
  ip_address text,
  UNIQUE(user_id, business_id, acceptance_type)
);
ALTER TABLE compliance_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own acceptances" ON compliance_acceptances
  USING (user_id = auth.uid());

-- Encryption columns on visa_clients
ALTER TABLE visa_clients ADD COLUMN IF NOT EXISTS encryption_version int DEFAULT 1;
ALTER TABLE visa_clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE visa_clients ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;

-- Encryption columns on visa_applications
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS encryption_version int DEFAULT 1;
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS personal_circumstances text;
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;

-- Encryption columns on visa_documents
ALTER TABLE visa_documents ADD COLUMN IF NOT EXISTS iv_hex text;
ALTER TABLE visa_documents ADD COLUMN IF NOT EXISTS original_type text;
ALTER TABLE visa_documents ADD COLUMN IF NOT EXISTS encryption_version int DEFAULT 1;
ALTER TABLE visa_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE visa_documents ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;