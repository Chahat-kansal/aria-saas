-- Phase 2.6: Add BAS/GST quarterly payment column to cash flow forecasts
ALTER TABLE cash_flow_forecasts
  ADD COLUMN IF NOT EXISTS predicted_bas_gst numeric DEFAULT 0;
