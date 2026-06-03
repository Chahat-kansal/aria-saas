-- Add Reels addon fields to social_preferences
ALTER TABLE social_preferences
  ADD COLUMN IF NOT EXISTS reels_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_by TEXT; -- user email who accepted
