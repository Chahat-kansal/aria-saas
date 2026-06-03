-- Aria Intelligence Upgrade — honesty, memory, reasoning, multi-session context

-- Data quality tracking (assessed_date avoids STABLE function in unique index)
CREATE TABLE IF NOT EXISTS aria_data_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  assessed_at timestamptz DEFAULT now(),
  assessed_date date NOT NULL DEFAULT CURRENT_DATE,
  pos_data_score integer DEFAULT 0,
  customer_data_score integer DEFAULT 0,
  inventory_data_score integer DEFAULT 0,
  staff_data_score integer DEFAULT 0,
  supplier_data_score integer DEFAULT 0,
  overall_score integer DEFAULT 0,
  missing_critical text[],
  missing_helpful text[],
  last_pos_sale_at timestamptz,
  pos_connected boolean DEFAULT false,
  UNIQUE(business_id, assessed_date)
);
ALTER TABLE aria_data_quality ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aria_data_quality' AND policyname='owner_data_quality') THEN
    CREATE POLICY "owner_data_quality" ON aria_data_quality
      FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_aria_data_quality_biz ON aria_data_quality(business_id, assessed_date DESC);

-- Conversation summaries (multi-session context)
CREATE TABLE IF NOT EXISTS aria_conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  summarised_at timestamptz DEFAULT now(),
  conversation_date date NOT NULL,
  mode text NOT NULL,
  summary text NOT NULL,
  key_decisions text[],
  key_concerns text[],
  followup_promised text[],
  UNIQUE(business_id, conversation_date, mode)
);
ALTER TABLE aria_conversation_summaries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aria_conversation_summaries' AND policyname='owner_conv_summaries') THEN
    CREATE POLICY "owner_conv_summaries" ON aria_conversation_summaries
      FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_aria_conv_summaries_biz ON aria_conversation_summaries(business_id, conversation_date DESC);

-- Extend council_runs with honesty, escalation, quality tracking
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS data_quality_score integer;
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS honesty_flags text[];
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS recommendations_hedged integer DEFAULT 0;
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS synthesis_model text;
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS escalation_reason text;