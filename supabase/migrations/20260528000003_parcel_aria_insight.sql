-- Parcel tracking AI layer: per-parcel Aria insight + late-arrival prediction,
-- refreshed every 6 hours by the parcel-insights cron (active parcels only).
ALTER TABLE pos_parcel_tracking
  ADD COLUMN IF NOT EXISTS aria_insight text,
  ADD COLUMN IF NOT EXISTS predicted_late boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aria_evaluated_at timestamptz;