-- Remove card_type if it exists (was added by mistake)
ALTER TABLE pos_gift_cards DROP COLUMN IF EXISTS card_type;

-- Ensure consistent column names
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS current_balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS initial_balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS issued_at timestamptz DEFAULT now();
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
