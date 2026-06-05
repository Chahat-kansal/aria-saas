-- reel_publish_jobs: queues publish intents for social platforms
-- Full platform OAuth (Instagram/TikTok/Facebook/YouTube Graph APIs) is a separate sprint.
-- This table stores intent; the platform connection and actual posting happens when OAuth tokens exist.

CREATE TABLE IF NOT EXISTS reel_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  caption text,
  platforms text[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','posted','failed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reel_publish_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_publish_jobs" ON reel_publish_jobs
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_reel_publish_jobs_biz ON reel_publish_jobs (business_id, created_at DESC);
