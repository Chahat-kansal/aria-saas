-- POS Payment Methods expansion
-- Adds served_by to pos_sales, gift card payment tracking,
-- and direct deposit support.

-- Fix: served_by column missing from pos_sales
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS served_by           text;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS notes               text;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS gift_card_id        uuid REFERENCES pos_gift_cards(id) ON DELETE SET NULL;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS gift_card_code      text;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS gift_card_amount    numeric(10,2) DEFAULT 0;
-- For split payments (e.g. partial gift card + rest on card)
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS split_payments      jsonb DEFAULT '[]';
-- [{method, amount}]

-- Direct deposit reference
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS direct_deposit_ref  text;

-- Expand payment_method CHECK to allow all new types
-- (Drop old constraint first, add new one)
ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS pos_sales_payment_method_check;
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_payment_method_check
  CHECK (payment_method IN (
    'cash', 'card', 'eftpos', 'credit_card', 'debit_card',
    'gift_card', 'aria_gift_card',
    'visa_gift_card', 'mastercard_gift_card',
    'direct_deposit', 'bank_transfer',
    'split', 'account', 'loyalty', 'other'
  ));

-- Update accepted_payment_methods default in pos_settings
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS accepted_payment_methods jsonb
  DEFAULT '["cash","eftpos","gift_card","direct_deposit"]';

-- Update gift cards with better tracking
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS customer_id   uuid;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS card_type     text DEFAULT 'aria'
  CHECK (card_type IN ('aria', 'visa', 'mastercard', 'amex', 'other'));
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS last_used_at  timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS times_used    integer DEFAULT 0;

-- Index for fast gift card lookups during checkout
CREATE INDEX IF NOT EXISTS idx_pos_gift_cards_code_active
  ON pos_gift_cards (business_id, code, is_active);
CREATE INDEX IF NOT EXISTS idx_pos_sales_served_by
  ON pos_sales (business_id, served_by);
CREATE INDEX IF NOT EXISTS idx_pos_sales_gift_card
  ON pos_sales (gift_card_id) WHERE gift_card_id IS NOT NULL;
