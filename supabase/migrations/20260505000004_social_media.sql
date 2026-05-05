-- Social media tables
CREATE TABLE IF NOT EXISTS social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram','facebook','google_business')),
  platform_account_id text,
  platform_account_name text,
  platform_page_id text,
  instagram_account_id text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  is_active boolean DEFAULT true,
  connected_at timestamptz DEFAULT now(),
  UNIQUE(business_id, platform)
);
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_social" ON social_connections;
CREATE POLICY "own_social" ON social_connections FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','approved','scheduled','published','failed','skipped')),
  caption text NOT NULL,
  hashtags text[] DEFAULT '{}',
  image_url text,
  image_prompt text,
  scheduled_for timestamptz,
  published_at timestamptz,
  platform_post_id text,
  aria_reasoning text,
  industry_context text,
  performance jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_social_posts" ON social_posts;
CREATE POLICY "own_social_posts" ON social_posts FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS social_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  brand_voice text DEFAULT 'friendly',
  post_frequency text DEFAULT 'weekly',
  preferred_post_times jsonb DEFAULT '{"instagram":"17:00","facebook":"18:00","google_business":"09:00"}',
  auto_hashtags text[] DEFAULT '{}',
  topics_to_avoid text,
  target_audience text,
  business_tagline text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE social_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_social_prefs" ON social_preferences;
CREATE POLICY "own_social_prefs" ON social_preferences FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
