-- aria_business_memory: unified memory store for all Aria conversation memories
-- Replaces fragmented aria_memories table. Used by memory-writer.ts and memory/extract.ts.

CREATE TABLE IF NOT EXISTS aria_business_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'fact' CHECK (kind IN (
    'preference','fact','tried','decision','concern','goal',
    'business_fact','pattern','intent','outcome'
  )),
  topic text,
  content text NOT NULL,
  importance integer NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  confidence numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (confidence BETWEEN 0.00 AND 1.00),
  source text,
  source_type text NOT NULL DEFAULT 'conversation' CHECK (source_type IN (
    'conversation','agent','briefing','manual'
  )),
  source_id text,
  is_active boolean NOT NULL DEFAULT true,
  last_referenced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aria_business_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aria_business_memory" ON aria_business_memory
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_aria_business_memory_biz ON aria_business_memory
  (business_id, importance DESC, created_at DESC)
  WHERE is_active = true AND deleted_at IS NULL;

-- aria_advice_weights: per-category advice confidence weights from outcome learning
CREATE TABLE IF NOT EXISTS aria_advice_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category text NOT NULL,
  weight numeric(4,3) NOT NULL DEFAULT 1.000,
  sample_count integer NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, category)
);

ALTER TABLE aria_advice_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aria_advice_weights" ON aria_advice_weights
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
