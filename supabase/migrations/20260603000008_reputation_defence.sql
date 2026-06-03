-- Reviews unified across all platforms
CREATE TABLE IF NOT EXISTS business_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('google','facebook','yelp','tripadvisor','aria_community','productreview')),
  external_id text,
  reviewer_name text,
  reviewer_photo_url text,
  rating numeric NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  review_date timestamptz,
  response_text text,
  response_drafted_by text DEFAULT 'agent',
  response_posted_at timestamptz,
  response_status text DEFAULT 'pending' CHECK (response_status IN ('pending','approved','posted','skipped')),
  sentiment text CHECK (sentiment IN ('positive','neutral','negative')),
  sentiment_score numeric,
  key_themes text[],
  is_crisis boolean DEFAULT false,
  customer_id uuid REFERENCES pos_customers(id) ON DELETE SET NULL,
  request_sent_at timestamptz,
  request_channel text CHECK (request_channel IN ('sms','email','none')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, platform, external_id)
);
ALTER TABLE business_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reviews" ON business_reviews
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON business_reviews (business_id, platform, review_date DESC);
CREATE INDEX ON business_reviews (business_id, rating, review_date DESC);
CREATE INDEX ON business_reviews (business_id, response_status);

-- AEO monitoring — tracks AI search engine appearances
CREATE TABLE IF NOT EXISTS aeo_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  checked_at timestamptz DEFAULT now(),
  query text NOT NULL,
  engine text NOT NULL CHECK (engine IN ('perplexity','chatgpt_web','google_aio')),
  appeared boolean DEFAULT false,
  position integer,
  snippet text,
  competitor_names text[],
  recommendations jsonb,
  UNIQUE(business_id, engine, query, date_trunc('week', checked_at))
);
ALTER TABLE aeo_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aeo_snapshots" ON aeo_snapshots
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON aeo_snapshots (business_id, checked_at DESC);

-- Review request campaigns
CREATE TABLE IF NOT EXISTS review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES pos_customers(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES pos_sales(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('sms','email')),
  message_text text NOT NULL,
  google_review_link text,
  sent_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  review_received boolean DEFAULT false,
  review_id uuid REFERENCES business_reviews(id) ON DELETE SET NULL
);
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_review_requests" ON review_requests
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
