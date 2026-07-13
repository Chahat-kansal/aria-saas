-- AI-COST-2 — per-business TTL cache for business-brain analyse() (AI-COST-AUDIT-1 §4/§6b:
-- the dominant lever. This route had no cache/cooldown at all — every POST re-ran the full
-- compactData() query + a 15-25K token LLM call, and that call was completely invisible to
-- aria_ai_calls (fixed separately in this same sprint via model-router.ts logging).
--
-- Same shape as council_cache (already in prod, proven pattern) — business_id + a cache-key
-- dimension (mode, not intent_hash), result jsonb, expires_at drives staleness.
CREATE TABLE IF NOT EXISTS business_brain_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  mode text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_brain_cache_bid_mode
  ON business_brain_cache (business_id, mode);

CREATE INDEX IF NOT EXISTS idx_business_brain_cache_expires
  ON business_brain_cache (expires_at);
