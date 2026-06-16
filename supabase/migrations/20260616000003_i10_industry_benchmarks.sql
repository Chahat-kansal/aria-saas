-- I10 BENCHMARK: cross-business industry aggregates. Privacy-safe — aggregates only
-- (percentiles + mean), never an individual business's raw figure, and only emitted when
-- sample_size >= 5 distinct businesses (CHECK enforces the floor at the row level too).
CREATE TABLE IF NOT EXISTS public.industry_benchmarks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry      text NOT NULL,
  metric_name   text NOT NULL,
  metric_period text NOT NULL CHECK (metric_period IN ('daily','weekly','monthly')),
  period_date   date NOT NULL DEFAULT current_date,
  sample_size   int  NOT NULL CHECK (sample_size >= 5),   -- privacy floor, enforced in the table
  p25  numeric,
  p50  numeric,
  p75  numeric,
  p90  numeric,
  mean numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (industry, metric_name, metric_period, period_date)
);

CREATE INDEX IF NOT EXISTS idx_industry_benchmarks_lookup
  ON public.industry_benchmarks (industry, metric_name, expires_at DESC);

ALTER TABLE public.industry_benchmarks ENABLE ROW LEVEL SECURITY;

-- Read-only for any authenticated user; the data is non-identifying aggregate-only.
DROP POLICY IF EXISTS industry_benchmarks_read ON public.industry_benchmarks;
CREATE POLICY industry_benchmarks_read ON public.industry_benchmarks
  FOR SELECT TO authenticated USING (true);
