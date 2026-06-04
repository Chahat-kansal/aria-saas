-- D.1: Add lead_time_days to pos_suppliers (was read by reorder-agent but column did not exist)
ALTER TABLE pos_suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 7;
