-- SEO infrastructure tables (referenced by seo-crawl cron + dashboard but never migrated)

CREATE TABLE IF NOT EXISTS seo_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  pages_crawled integer DEFAULT 0,
  issues_found integer DEFAULT 0,
  issues_fixed integer DEFAULT 0,
  health_score integer DEFAULT 0,
  critical_count integer,
  warning_count integer,
  info_count integer,
  error_detail text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE seo_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_seo_audits" ON seo_audits
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_seo_audits_biz ON seo_audits (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seo_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  audit_id uuid REFERENCES seo_audits(id) ON DELETE CASCADE,
  url text NOT NULL,
  http_status integer,
  title text,
  title_length integer DEFAULT 0,
  meta_description text,
  meta_description_length integer DEFAULT 0,
  h1_count integer DEFAULT 0,
  word_count integer DEFAULT 0,
  images_total integer DEFAULT 0,
  images_missing_alt integer DEFAULT 0,
  has_schema boolean DEFAULT false,
  load_ms integer,
  page_size_kb numeric,
  depth integer DEFAULT 0,
  parent_url text,
  crawled_at timestamptz DEFAULT now()
);
ALTER TABLE seo_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_seo_pages" ON seo_pages
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_seo_pages_biz_audit ON seo_pages (business_id, audit_id);

CREATE TABLE IF NOT EXISTS seo_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  audit_id uuid REFERENCES seo_audits(id) ON DELETE SET NULL,
  page_url text NOT NULL,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('critical','warning','info')),
  title text NOT NULL,
  detail text,
  suggested_fix text,
  ai_fix_text text,
  fix_format text,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','applied','verified','dismissed')),
  applied_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE seo_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_seo_issues" ON seo_issues
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_seo_issues_biz ON seo_issues (business_id, state, severity);

CREATE TABLE IF NOT EXISTS seo_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  current_rank integer,
  previous_rank integer,
  search_volume integer,
  frequency integer,
  found_on_pages text[],
  tracked boolean DEFAULT false,
  last_checked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, keyword)
);
ALTER TABLE seo_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_seo_keywords" ON seo_keywords
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_seo_keywords_biz ON seo_keywords (business_id, tracked);

CREATE TABLE IF NOT EXISTS seo_local (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  gbp_completeness integer,
  gbp_listed boolean,
  review_count integer,
  review_avg numeric,
  map_pack_rank integer,
  citations_total integer,
  citations_consistent integer,
  review_velocity_30d integer,
  checklist jsonb,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE seo_local ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_seo_local" ON seo_local
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
