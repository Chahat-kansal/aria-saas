CREATE TABLE IF NOT EXISTS competitor_price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  competitor_name text NOT NULL,
  competitor_address text,
  competitor_distance_m integer,
  competitor_price_cents integer,
  source text DEFAULT 'web_search',
  confidence text DEFAULT 'medium',
  found_url text,
  searched_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_competitor_price_cache_business
  ON competitor_price_cache(business_id, product_name, searched_at DESC);

CREATE TABLE IF NOT EXISTS competitor_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  competitor_name text NOT NULL,
  competitor_address text,
  competitor_place_id text,
  distance_m integer,
  category text,
  phone text,
  website text,
  google_rating numeric,
  last_checked timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitor_businesses_bid
  ON competitor_businesses(business_id, last_checked DESC);
