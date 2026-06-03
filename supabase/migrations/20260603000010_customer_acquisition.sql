-- Business AEO profile — what AI engines know about this business
CREATE TABLE IF NOT EXISTS business_aeo_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  google_business_score integer DEFAULT 0,
  structured_data_score integer DEFAULT 0,
  review_velocity_score integer DEFAULT 0,
  content_freshness_score integer DEFAULT 0,
  overall_aeo_score integer DEFAULT 0,
  known_name text,
  known_address text,
  known_hours jsonb,
  known_phone text,
  known_website text,
  known_categories text[],
  known_menu_items text[],
  known_price_range text,
  known_parking boolean,
  known_wifi boolean,
  missing_fields text[],
  improvement_recommendations jsonb,
  appearance_rate_7d numeric DEFAULT 0,
  competitor_appearance_rate_7d numeric DEFAULT 0,
  last_updated timestamptz DEFAULT now()
);
ALTER TABLE business_aeo_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aeo_profiles" ON business_aeo_profiles
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- AEO-optimised content pieces
CREATE TABLE IF NOT EXISTS aeo_content_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  content_type text NOT NULL CHECK (content_type IN (
    'faq_entry', 'google_post', 'community_post', 'menu_description', 'business_description'
  )),
  title text NOT NULL,
  content text NOT NULL,
  target_queries text[],
  published_at timestamptz,
  published_to text[],
  created_by text DEFAULT 'agent',
  performance_appearances integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE aeo_content_pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aeo_content" ON aeo_content_pieces
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON aeo_content_pieces (business_id, content_type, created_at DESC);
