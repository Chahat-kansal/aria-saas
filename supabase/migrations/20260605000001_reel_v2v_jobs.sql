-- reel_v2v_jobs: tracks async video-to-video fal.ai jobs (restyle / bg-remove)
-- output_url stores Vercel Blob URL (not raw fal URL — fal URLs expire ~30d)

CREATE TABLE IF NOT EXISTS reel_v2v_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  op text NOT NULL CHECK (op IN ('restyle','bg-remove')),
  fal_job_id text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','done','error')),
  output_url text,
  estimated_cost_aud numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reel_v2v_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_v2v_jobs" ON reel_v2v_jobs
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_reel_v2v_jobs_biz ON reel_v2v_jobs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_v2v_jobs_fal ON reel_v2v_jobs (fal_job_id) WHERE fal_job_id IS NOT NULL;
