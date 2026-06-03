-- Extend social_posts for Reels, Stories, audio
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS story_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reel_cost_aud NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS reel_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS fal_request_id TEXT,
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'image'
    CHECK (post_type IN ('image', 'reel', 'story'));

-- Index for story expiry cleanup
CREATE INDEX IF NOT EXISTS social_posts_story_expires_idx
  ON social_posts(story_expires_at)
  WHERE story_expires_at IS NOT NULL;

-- Track Reel addon usage per business per month for billing
CREATE TABLE IF NOT EXISTS reel_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  cost_aud NUMERIC(10,4) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  provider TEXT NOT NULL,
  fal_request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reel_usage_log_business_idx ON reel_usage_log(business_id, created_at DESC);
ALTER TABLE reel_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_usage" ON reel_usage_log
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  );

-- Add post_type to aria_influencer_posts for Stories support
ALTER TABLE aria_influencer_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'reel'
    CHECK (post_type IN ('reel', 'story'));
