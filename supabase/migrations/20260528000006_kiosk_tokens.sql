-- Kiosk access control: rotating QR tokens (5-day window) + counter-tablet API key.
CREATE TABLE IF NOT EXISTS instore_kiosk_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kiosk_tokens_business_active ON instore_kiosk_tokens(business_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_kiosk_tokens_token_lookup ON instore_kiosk_tokens(token) WHERE active = true;

ALTER TABLE instore_kiosk_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kiosk_tokens_owner_read" ON instore_kiosk_tokens;
CREATE POLICY "kiosk_tokens_owner_read" ON instore_kiosk_tokens
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE instore_kiosk_configs ADD COLUMN IF NOT EXISTS tablet_api_key uuid;
UPDATE instore_kiosk_configs SET tablet_api_key = gen_random_uuid() WHERE tablet_api_key IS NULL;