-- Fix gift cards schema — use clean column names, drop card_type
ALTER TABLE pos_gift_cards DROP COLUMN IF EXISTS card_type;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS initial_balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE pos_gift_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_gift_cards" ON pos_gift_cards;
CREATE POLICY "own_gift_cards" ON pos_gift_cards FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
