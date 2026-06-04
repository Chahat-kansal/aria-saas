-- Remotion editor columns for reel_studio_sessions
ALTER TABLE reel_studio_sessions
  ADD COLUMN IF NOT EXISTS edit_spec JSONB,
  ADD COLUMN IF NOT EXISTS render_sandbox_id TEXT,
  ADD COLUMN IF NOT EXISTS render_cmd_id TEXT,
  ADD COLUMN IF NOT EXISTS edited_video_url TEXT;
