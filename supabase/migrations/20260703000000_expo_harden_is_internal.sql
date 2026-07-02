-- Add is_internal flag to businesses for demo/internal accounts that must never expire
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- Sip demo account — set is_internal so it bypasses the trial gate permanently
UPDATE businesses SET is_internal = true WHERE id = 'ff5055a0-c351-4ada-817a-1804961035f3';