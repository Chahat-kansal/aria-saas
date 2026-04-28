-- Add allowed_domain column to widget_configs (domain whitelist)
ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS allowed_domain text;

-- stock_movements already created in migration 20260428000002
-- This migration is for documentation only — tables exist
