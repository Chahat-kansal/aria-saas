-- Phase 2.13: Add per-aspect sentiment scores to business_reviews
ALTER TABLE business_reviews
  ADD COLUMN IF NOT EXISTS aspect_scores jsonb;
-- { food: -1..1, service: -1..1, ambiance: -1..1, value: -1..1 }
-- null when aspect not mentioned in review text

-- Phase 2.14: Add GBP completeness checklist to aeo_profiles
ALTER TABLE business_aeo_profiles
  ADD COLUMN IF NOT EXISTS gbp_checklist jsonb;
