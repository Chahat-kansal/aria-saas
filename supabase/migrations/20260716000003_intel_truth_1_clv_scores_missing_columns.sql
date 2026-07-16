-- INTEL-TRUTH-1 VERIFY finding — clv-agent.ts (shipped, live code) has always written p_alive,
-- expected_purchases_next_90d, and expected_next_order_date on every customer_clv_scores insert
-- (STEP 8's rows.map(...) in src/lib/agents/clv-agent.ts), but no migration ever added these 3
-- columns to the table -- confirmed via information_schema (customer_clv_scores has 25 columns,
-- none of these 3) and confirmed live: customer_clv_scores has ZERO rows for Sip Cafe (business_id
-- ff5055a0-c351-4ada-817a-1804961035f3), the app's only real business, meaning the insert has been
-- silently failing (the Postgres "column does not exist" error is caught into
-- AgentRunResult.errors -- non-fatal, so the agent run "succeeds" while never writing a score) on
-- every single CLV agent run since this code shipped. The CLV feature has never worked in
-- production. Additive, RULE 10 pattern -- types match the table's existing numeric/date
-- conventions (see 20260603000001_clv_agent_tables.sql).

ALTER TABLE customer_clv_scores
  ADD COLUMN IF NOT EXISTS p_alive numeric,
  ADD COLUMN IF NOT EXISTS expected_purchases_next_90d numeric,
  ADD COLUMN IF NOT EXISTS expected_next_order_date date;
