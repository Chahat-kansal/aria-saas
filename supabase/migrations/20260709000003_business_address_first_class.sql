-- Part B.1 (ADDRESS-1): first-class business address. businesses already has
-- address (street line), suburb, business_state, postcode, lat, lng, and
-- google_place_id (Google Business Profile linkage — NOT reused here, it's a
-- different provider/namespace than Geoapify's place_id). Only genuinely
-- missing columns are added — no duplication of existing address fields.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'AU',
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS place_id text;

-- pos_outlets already has `address` (text) — matched to businesses' naming
-- convention (lat/lng, not latitude/longitude) for a single consistent shape
-- across both tables that getBusinessAddress() and per-outlet lookups share.
ALTER TABLE pos_outlets
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'AU',
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS place_id text;
