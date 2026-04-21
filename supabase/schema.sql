-- ============================================================
-- Aria OS — Supabase Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================

-- ── BUSINESSES ─────────────────────────────────────────────
CREATE TABLE businesses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users NOT NULL,
  name                  text NOT NULL,
  owner_name            text,
  industry              text CHECK (industry IN ('retail','cafe','tradie','realestate','salon','visa','gym','professional')),
  address               text,
  city                  text,
  phone                 text,
  email                 text,
  staff_count           text,
  monthly_revenue       text,
  biggest_challenge     text,
  google_business_url   text,
  google_rating         numeric DEFAULT 0,
  google_review_count   integer DEFAULT 0,
  plan                  text DEFAULT 'starter' CHECK (plan IN ('starter','growth','pro')),
  stripe_customer_id    text,
  stripe_subscription_id text,
  trial_ends_at         timestamptz DEFAULT now() + interval '14 days',
  onboarding_complete   boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

-- ── CUSTOMERS ──────────────────────────────────────────────
CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name          text NOT NULL,
  phone         text,
  email         text,
  last_visit    timestamptz,
  visit_count   integer DEFAULT 0,
  total_spend   numeric DEFAULT 0,
  churn_risk    text DEFAULT 'low' CHECK (churn_risk IN ('low','medium','high')),
  created_at    timestamptz DEFAULT now()
);

-- ── BOOKINGS ───────────────────────────────────────────────
-- Note: column is booking_date (not date) and amount (not value)
CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  booking_date  timestamptz,
  service       text,
  status        text DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  source        text CHECK (source IN ('instagram','facebook','sms','google','direct')),
  amount        numeric DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- ── REVIEWS ────────────────────────────────────────────────
-- Note: includes customer_name and phone for display without a join
CREATE TABLE reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    text,
  phone            text,
  rating           integer CHECK (rating BETWEEN 1 AND 5),
  platform         text DEFAULT 'google',
  content          text,
  sentiment        text CHECK (sentiment IN ('positive','neutral','negative')),
  request_sent_at  timestamptz,
  created_at       timestamptz DEFAULT now()
);

-- ── PROFIT LEAKS ───────────────────────────────────────────
-- Note: columns match what profit-analysis route inserts and dashboard reads
CREATE TABLE profit_leaks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid REFERENCES businesses(id) ON DELETE CASCADE,
  title           text,
  category        text,
  description     text,
  estimated_loss  numeric DEFAULT 0,  -- used by dashboard (monthly loss amount)
  monthly_loss    numeric DEFAULT 0,  -- used by profit-analysis insert (kept for compat)
  recommendation  text,               -- used by dashboard display
  fix_suggestion  text,               -- used by profit-analysis insert (kept for compat)
  status          text DEFAULT 'detected' CHECK (status IN ('detected','acknowledged','fixed')),
  detected_at     timestamptz DEFAULT now()
);

-- ── COMPETITOR ALERTS ──────────────────────────────────────
-- Note: alert_text (not description), detected_at, source_url added
CREATE TABLE competitor_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid REFERENCES businesses(id) ON DELETE CASCADE,
  competitor_name  text,
  alert_type       text,
  alert_text       text,
  source_url       text,
  severity         text DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  detected_at      timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
);

-- ── ACTIVITY LOG ───────────────────────────────────────────
-- Note: action_type (not type), description, metadata jsonb
CREATE TABLE activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  action_type  text NOT NULL,
  description  text NOT NULL,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

-- ── CAMPAIGNS ──────────────────────────────────────────────
-- Note: name and recipients_count added for dashboard display
CREATE TABLE campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name             text,
  type             text CHECK (type IN ('winback','slow_day','review_request','promotion')),
  status           text DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','completed')),
  sent_count       integer DEFAULT 0,
  recipients_count integer DEFAULT 0,
  response_count   integer DEFAULT 0,
  scheduled_for    timestamptz,
  created_at       timestamptz DEFAULT now()
);

-- ── ARIA CONVERSATIONS ─────────────────────────────────────
CREATE TABLE aria_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  role         text CHECK (role IN ('user','assistant')),
  content      text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ── PROJECTS (preserved from old app) ─────────────────────
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  description text DEFAULT '',
  framework   text DEFAULT 'html',
  files       jsonb DEFAULT '[]',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ── GENERAL CONVERSATIONS (preserved from old app) ─────────
CREATE TABLE conversations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users NOT NULL,
  title                   text DEFAULT 'New conversation',
  messages                jsonb DEFAULT '[]',
  aimodel                 text DEFAULT 'claude-sonnet-4-5-20250929',
  share_token             text UNIQUE,
  parent_conversation_id  uuid,
  branch_point            integer,
  tone                    text DEFAULT 'default',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- ── ROW LEVEL SECURITY ─────────────────────────────────────

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own business" ON businesses
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their customers" ON customers
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their bookings" ON bookings
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their reviews" ON reviews
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE profit_leaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their profit leaks" ON profit_leaks
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE competitor_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their competitor alerts" ON competitor_alerts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their activity log" ON activity_log
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their campaigns" ON campaigns
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE aria_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners can access their Aria conversations" ON aria_conversations
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id);

-- Allow public read of shared conversations
CREATE POLICY "Anyone can read shared conversations" ON conversations
  FOR SELECT USING (share_token IS NOT NULL);

-- ── SERVICE ROLE BYPASS (for server-side admin operations) ─
-- supabaseAdmin uses the service role key which bypasses RLS automatically.
-- No additional policies needed for service role.

-- ── INDEXES ────────────────────────────────────────────────
CREATE INDEX idx_businesses_user_id ON businesses(user_id);
CREATE INDEX idx_customers_business_id ON customers(business_id);
CREATE INDEX idx_customers_last_visit ON customers(last_visit);
CREATE INDEX idx_bookings_business_id ON bookings(business_id);
CREATE INDEX idx_bookings_booking_date ON bookings(booking_date);
CREATE INDEX idx_reviews_business_id ON reviews(business_id);
CREATE INDEX idx_profit_leaks_business_id ON profit_leaks(business_id);
CREATE INDEX idx_profit_leaks_status ON profit_leaks(status);
CREATE INDEX idx_competitor_alerts_business_id ON competitor_alerts(business_id);
CREATE INDEX idx_activity_log_business_id ON activity_log(business_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_campaigns_business_id ON campaigns(business_id);
CREATE INDEX idx_aria_conversations_business_id ON aria_conversations(business_id);
CREATE INDEX idx_aria_conversations_created_at ON aria_conversations(created_at);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_share_token ON conversations(share_token);
CREATE INDEX idx_projects_user_id ON projects(user_id);