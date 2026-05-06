-- Complete features migration
-- Run this in Supabase SQL Editor

-- pos_users extra columns
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS availability jsonb DEFAULT '{}';
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS max_hours_per_week integer DEFAULT 40;
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS hourly_rate_cents integer DEFAULT 0;
ALTER TABLE pos_users ADD COLUMN IF NOT EXISTS role_title text DEFAULT 'Cashier';

-- Receipt templates
CREATE TABLE IF NOT EXISTS pos_receipt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New Receipt',
  type text DEFAULT 'normal' CHECK (type IN ('normal','email')),
  for_type text DEFAULT 'sale' CHECK (for_type IN ('sale','payment')),
  components jsonb DEFAULT '[]',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE pos_receipt_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_receipts" ON pos_receipt_templates;
CREATE POLICY "own_receipts" ON pos_receipt_templates FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Rosters
CREATE TABLE IF NOT EXISTS pos_roster_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Weekly Roster',
  week_starting date NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','published')),
  shifts jsonb DEFAULT '[]',
  total_hours numeric DEFAULT 0,
  total_cost_cents integer DEFAULT 0,
  aria_reasoning text,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_roster_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_rosters" ON pos_roster_templates;
CREATE POLICY "own_rosters" ON pos_roster_templates FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Autopilot actions
CREATE TABLE IF NOT EXISTS aria_autopilot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category text NOT NULL,
  priority text DEFAULT 'routine' CHECK (priority IN ('urgent','important','routine')),
  title text NOT NULL,
  description text NOT NULL,
  action_data jsonb DEFAULT '{}',
  estimated_impact text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed')),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE aria_autopilot_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_autopilot" ON aria_autopilot_actions;
CREATE POLICY "own_autopilot" ON aria_autopilot_actions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Gift cards schema fix (safe, idempotent)
ALTER TABLE pos_gift_cards DROP COLUMN IF EXISTS card_type;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS current_balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS initial_balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Social posts columns (safe)
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_credit text;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reel_concept text;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reel_script text;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

-- Index for fast roster lookups
CREATE INDEX IF NOT EXISTS idx_rosters_business_week ON pos_roster_templates(business_id, week_starting);
CREATE INDEX IF NOT EXISTS idx_autopilot_business_status ON aria_autopilot_actions(business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_business ON pos_receipt_templates(business_id, created_at DESC);
