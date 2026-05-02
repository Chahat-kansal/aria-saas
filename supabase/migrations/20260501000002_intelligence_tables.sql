-- Intelligence tables: global products, missed demand, events, outcomes, external cache

-- Global product database (shared reference, no business RLS)
CREATE TABLE IF NOT EXISTS global_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text UNIQUE NOT NULL,
  name text NOT NULL, brand text, category text, size text,
  unit text DEFAULT 'each', suggested_price_cents integer,
  image_url text, ingredients_text text,
  is_age_restricted boolean DEFAULT false,
  country_of_sale text DEFAULT 'AU',
  source text DEFAULT 'manual',
  last_verified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_global_products_barcode ON global_products(barcode);
CREATE INDEX IF NOT EXISTS idx_global_products_name ON global_products USING gin(to_tsvector('english', name));

-- Seed key Australian products
INSERT INTO global_products (barcode,name,brand,category,size,unit,suggested_price_cents,is_age_restricted) VALUES
('9300673000285','VB Victoria Bitter Cans 375ml 30pk','Carlton & United','Beer & Cider','30pk','case',5999,true),
('9300673001282','Carlton Draught Stubbies 375ml 24pk','Carlton & United','Beer & Cider','24pk','case',5299,true),
('9314000000112','Great Northern Original Cans 375ml 30pk','Carlton & United','Beer & Cider','30pk','case',5799,true),
('5000213013017','Heineken Lager 330ml 24pk','Heineken','Beer & Cider','24pk','case',5999,true),
('9338570002523','Penfolds Bin 389 Cabernet Shiraz 750ml','Penfolds','Wine','750ml','bottle',8000,true),
('9315026000019','Jacob''s Creek Classic Shiraz 750ml','Jacob''s Creek','Wine','750ml','bottle',1200,true),
('9300635001234','Jim Beam White Bourbon 700ml','Jim Beam','Spirits','700ml','bottle',3800,true),
('5099873006091','Bundaberg Original Rum 700ml','Bundaberg Rum','Spirits','700ml','bottle',4500,true),
('9300675000044','Coca-Cola Classic 24pk 375ml Cans','Coca-Cola','Soft Drinks','24pk','case',2400,false),
('9300728000014','Mount Franklin Sparkling 1.25L 12pk','Coca-Cola','Water','12pk','case',1600,false),
('9310088052024','Arnott''s Tim Tams Original 200g','Arnott''s','Snacks','200g','each',499,false),
('9310055180078','Cadbury Dairy Milk 200g','Cadbury','Confectionery','200g','each',499,false)
ON CONFLICT (barcode) DO NOTHING;

-- Missed demand tracking
CREATE TABLE IF NOT EXISTS missed_demand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_barcode text,
  product_category text,
  global_product_id uuid REFERENCES global_products(id) ON DELETE SET NULL,
  logged_by text,
  customer_id uuid REFERENCES pos_customers(id) ON DELETE SET NULL,
  customer_note text,
  estimated_quantity_wanted integer DEFAULT 1,
  approximate_price_point_cents integer,
  times_requested integer DEFAULT 1,
  first_requested_at timestamptz DEFAULT now(),
  last_requested_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending','analysed','suggested','accepted','rejected','stocked')),
  aria_analysis text,
  aria_confidence text CHECK (aria_confidence IN ('high','medium','low')),
  estimated_monthly_revenue_cents integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE missed_demand ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='missed_demand' AND policyname='own_missed_demand') THEN
    CREATE POLICY "own_missed_demand" ON missed_demand FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_missed_demand_business ON missed_demand(business_id, status, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_demand_barcode ON missed_demand(product_barcode) WHERE product_barcode IS NOT NULL;

-- Intelligence events
CREATE TABLE IF NOT EXISTS intelligence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  severity text DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','info')),
  title text NOT NULL, body text NOT NULL,
  data jsonb DEFAULT '{}',
  action_label text, action_href text,
  triggered_at timestamptz DEFAULT now(),
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz
);
ALTER TABLE intelligence_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='intelligence_events' AND policyname='own_events') THEN
    CREATE POLICY "own_events" ON intelligence_events FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_intelligence_events ON intelligence_events(business_id, acknowledged, triggered_at DESC);

-- Aria outcomes tracking
CREATE TABLE IF NOT EXISTS aria_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL,
  recommendation_detail text,
  recommended_at timestamptz DEFAULT now(),
  acted_on boolean DEFAULT false,
  acted_on_at timestamptz,
  outcome_value_cents integer,
  notes text
);
ALTER TABLE aria_outcomes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aria_outcomes' AND policyname='own_outcomes') THEN
    CREATE POLICY "own_outcomes" ON aria_outcomes FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- External data cache
CREATE TABLE IF NOT EXISTS external_data_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text UNIQUE NOT NULL,
  data jsonb NOT NULL,
  source text NOT NULL,
  cached_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_external_cache_key ON external_data_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_external_cache_expires ON external_data_cache(expires_at);
