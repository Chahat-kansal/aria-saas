-- POS Gift Cards
-- Creates the pos_gift_cards table if it doesn't exist yet

CREATE TABLE IF NOT EXISTS pos_gift_cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code             text NOT NULL,
  initial_balance  numeric(10,2) NOT NULL DEFAULT 0,
  current_balance  numeric(10,2) NOT NULL DEFAULT 0,
  recipient_name   text,
  customer_id      uuid,
  is_active        boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','used','expired','cancelled')),
  issued_at        timestamptz DEFAULT now(),
  expires_at       timestamptz,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (business_id, code)
);

ALTER TABLE pos_gift_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_access" ON pos_gift_cards;
CREATE POLICY "business_access" ON pos_gift_cards FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pos_gift_cards_biz    ON pos_gift_cards (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_gift_cards_code   ON pos_gift_cards (business_id, code);
CREATE INDEX IF NOT EXISTS idx_pos_gift_cards_active ON pos_gift_cards (business_id, is_active);

-- Safe column additions for existing deployments
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS recipient_name  text;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS issued_at       timestamptz DEFAULT now();
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS status          text DEFAULT 'active';
