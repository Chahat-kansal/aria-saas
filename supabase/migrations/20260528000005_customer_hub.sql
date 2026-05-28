-- Unified customer hub: one URL (ariaos.site/{slug}) replacing five customer links.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS hub_visible_features jsonb DEFAULT '["loyalty","booking","community","review","website"]'::jsonb;

-- Backfill slug from name, de-duplicating collisions with a short id suffix.
UPDATE businesses b
SET slug = x.s
FROM (
  SELECT id,
    CASE WHEN rn = 1 THEN base ELSE base || '-' || substr(id::text, 1, 4) END AS s
  FROM (
    SELECT id,
      COALESCE(base_raw, 'business') AS base,
      row_number() OVER (PARTITION BY COALESCE(base_raw, 'business') ORDER BY created_at) AS rn
    FROM (
      SELECT id, created_at,
        NULLIF(trim(both '-' from lower(regexp_replace(COALESCE(NULLIF(trim(name), ''), 'business'), '[^a-z0-9]+', '-', 'gi'))), '') AS base_raw
      FROM businesses
    ) a
  ) y
) x
WHERE b.id = x.id AND b.slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS businesses_slug_unique ON businesses(slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_hub_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  visitor_id text,
  target text,          -- 'hub_view' / 'loyalty' / 'booking' / 'community' / 'review' / 'website' / 'order'
  referrer text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_hub_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hub_clicks_owner_read" ON customer_hub_clicks;
CREATE POLICY "hub_clicks_owner_read" ON customer_hub_clicks
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "hub_clicks_anon_insert" ON customer_hub_clicks;
CREATE POLICY "hub_clicks_anon_insert" ON customer_hub_clicks
  FOR INSERT TO anon WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_hub_clicks_business ON customer_hub_clicks(business_id, created_at DESC);