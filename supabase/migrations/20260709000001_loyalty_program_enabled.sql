-- Add master program_enabled gate to pos_loyalty_config
-- When false: earnOnSale skips all earn, CX surfaces show graceful inactive state.
ALTER TABLE pos_loyalty_config
  ADD COLUMN IF NOT EXISTS program_enabled BOOLEAN NOT NULL DEFAULT true;