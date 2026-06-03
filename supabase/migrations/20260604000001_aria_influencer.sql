-- Add video_url to social_posts for Reels support
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'image';

-- aria_influencer_config — stores the AriaOS influencer settings
-- master_image_url: the Higgsfield-generated character image (c5102768)
-- ariaos_instagram_account_id: the @ariaos.au Instagram account ID once connected
-- ariaos_page_access_token: the page access token for @ariaos.au
CREATE TABLE IF NOT EXISTS aria_influencer_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_image_url TEXT NOT NULL,
  character_name TEXT NOT NULL DEFAULT 'Aria',
  character_bio TEXT DEFAULT 'AI ambassador for Aria OS — visiting Australian small businesses powered by AI 🤖🇦🇺',
  ariaos_instagram_account_id TEXT,
  ariaos_page_access_token TEXT,
  ariaos_facebook_page_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with her master image from Higgsfield
-- The URL will need to be updated with the actual Higgsfield CDN URL once retrieved
INSERT INTO aria_influencer_config (master_image_url, character_name)
VALUES (
  'https://cdn.higgsfield.ai/placeholder-c5102768', -- UPDATE with real URL from Higgsfield job
  'Aria'
)
ON CONFLICT DO NOTHING;

-- aria_influencer_posts — tracks all generated influencer content
CREATE TABLE IF NOT EXISTS aria_influencer_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  featured_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  video_url TEXT,
  image_url TEXT,
  caption TEXT NOT NULL,
  hashtags TEXT[] DEFAULT '{}',
  scene_prompt TEXT,
  industry TEXT,
  status TEXT DEFAULT 'draft',  -- draft | approved | published | failed
  instagram_post_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aria_influencer_posts_status_idx ON aria_influencer_posts(status);
CREATE INDEX IF NOT EXISTS aria_influencer_posts_created_idx ON aria_influencer_posts(created_at DESC);
