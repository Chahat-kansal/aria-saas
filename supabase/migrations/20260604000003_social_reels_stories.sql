-- ─────────────────────────────────────────────────────────────────────────────
-- Prompt 234 — Social Media Complete: all 12 gaps
-- ─────────────────────────────────────────────────────────────────────────────

-- Gap 6: approval_status column (publish-scheduled cron needs this)
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected'));

-- Backfill existing approved/published/scheduled rows
UPDATE social_posts SET approval_status = 'approved'
  WHERE status IN ('approved','scheduled','published') AND approval_status IS NULL;

-- Gap 3/4: Reel content customisation columns
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'image'
    CHECK (post_type IN ('image','reel','story')),
  ADD COLUMN IF NOT EXISTS reel_mode TEXT DEFAULT 'auto'
    CHECK (reel_mode IN ('auto','image','text')),
  ADD COLUMN IF NOT EXISTS reel_style TEXT DEFAULT 'lifestyle'
    CHECK (reel_style IN ('lifestyle','product_showcase','behind_scenes','flash_sale','testimonial','day_in_life')),
  ADD COLUMN IF NOT EXISTS reel_source_image_url TEXT,
  ADD COLUMN IF NOT EXISTS reel_custom_prompt TEXT,
  ADD COLUMN IF NOT EXISTS reel_duration_seconds INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS reel_cost_aud NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS fal_request_id TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS story_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engagement_data JSONB DEFAULT '{}';

-- Gap 12: story expiry index
CREATE INDEX IF NOT EXISTS social_posts_story_expires_idx
  ON social_posts(story_expires_at)
  WHERE story_expires_at IS NOT NULL;

-- Gap 12: allow 'expired' in status CHECK
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_status_check;
ALTER TABLE social_posts ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('draft','approved','scheduled','published','failed','skipped','expired'));

-- Gap 9: Reel billing log
CREATE TABLE IF NOT EXISTS reel_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  cost_aud NUMERIC(10,4) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  provider TEXT NOT NULL,
  reel_mode TEXT,
  reel_style TEXT,
  fal_request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reel_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_reel_usage" ON reel_usage_log;
CREATE POLICY "owner_reel_usage" ON reel_usage_log
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS reel_usage_biz_idx ON reel_usage_log(business_id, created_at DESC);

-- Gap 10: Content asset library
CREATE TABLE IF NOT EXISTS social_asset_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'image' CHECK (type IN ('image','video','audio')),
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE social_asset_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_assets" ON social_asset_library;
CREATE POLICY "owner_assets" ON social_asset_library
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS social_assets_biz_idx ON social_asset_library(business_id, created_at DESC);

-- Gap 8: Hashtag performance tracking
CREATE TABLE IF NOT EXISTS social_hashtag_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  hashtag TEXT NOT NULL,
  avg_reach NUMERIC,
  avg_likes NUMERIC,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, hashtag)
);
ALTER TABLE social_hashtag_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_hashtag_stats" ON social_hashtag_stats;
CREATE POLICY "owner_hashtag_stats" ON social_hashtag_stats
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Gap 8: Hashtag usage increment function
CREATE OR REPLACE FUNCTION increment_hashtag_usage(
  p_business_id UUID, p_hashtag TEXT, p_reach NUMERIC, p_likes NUMERIC
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE social_hashtag_stats
  SET
    usage_count = usage_count + 1,
    avg_reach = (avg_reach + p_reach) / 2,
    avg_likes = (avg_likes + p_likes) / 2,
    updated_at = NOW()
  WHERE business_id = p_business_id AND hashtag = p_hashtag;
END;
$$;

-- Gap 5: Token expiry tracking
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_token_warning_at TIMESTAMPTZ;

-- Gap 11: TikTok platform support
ALTER TABLE social_connections
  DROP CONSTRAINT IF EXISTS social_connections_platform_check;
ALTER TABLE social_connections
  ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('instagram','facebook','google_business','tiktok'));

-- Gap 1/2: social_preferences audio and Reel settings
ALTER TABLE social_preferences
  ADD COLUMN IF NOT EXISTS reels_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_by TEXT,
  ADD COLUMN IF NOT EXISTS reel_default_duration INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS reel_default_style TEXT DEFAULT 'lifestyle',
  ADD COLUMN IF NOT EXISTS reel_background_music TEXT DEFAULT 'upbeat'
    CHECK (reel_background_music IN ('none','upbeat','warm','minimal','energetic')),
  ADD COLUMN IF NOT EXISTS reel_auto_voiceover BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_platforms TEXT[] DEFAULT ARRAY['instagram','facebook'],
  ADD COLUMN IF NOT EXISTS auto_post_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_text TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_enabled BOOLEAN DEFAULT false;

-- Add post_type to aria_influencer_posts for Stories support
ALTER TABLE aria_influencer_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'reel'
    CHECK (post_type IN ('reel', 'story'));
