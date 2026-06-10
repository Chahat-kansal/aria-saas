-- SH-4: Daily wiring health — per-check results table + SQL helper functions
-- Companion to aria_data_quality (aggregate scores).
-- aria_data_quality has UNIQUE(business_id, assessed_date); can't hold per-check rows.
-- This table stores one row per check per run so history is queryable.

CREATE TABLE IF NOT EXISTS aria_wiring_health_checks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        REFERENCES businesses(id) ON DELETE CASCADE,  -- NULL for system-level checks
  check_name  text        NOT NULL,
  status      text        NOT NULL CHECK (status IN ('green', 'amber', 'red')),
  value       numeric,
  threshold   text,
  details     jsonb       DEFAULT '{}',
  checked_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wiring_health_biz_time
  ON aria_wiring_health_checks(business_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_wiring_health_status_time
  ON aria_wiring_health_checks(status, checked_at DESC);

-- RLS: owners can read their business rows; system rows (business_id IS NULL) are admin-only
ALTER TABLE aria_wiring_health_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_wiring_health" ON aria_wiring_health_checks;
CREATE POLICY "own_wiring_health" ON aria_wiring_health_checks
  FOR SELECT USING (
    business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  );

-- ── SQL helper functions (require JOINs not expressible via JS client) ────────

-- Count non-voided sales where total_amount deviates from sum(line_total) by >$0.01
CREATE OR REPLACE FUNCTION wh_drift_count(p_business_id uuid, p_since timestamptz)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::integer
  FROM pos_sales ps
  WHERE ps.business_id = p_business_id
    AND ps.status       != 'voided'
    AND ps.created_at   >= p_since
    AND ABS(
      ps.total_amount - COALESCE(
        (SELECT SUM(psi.line_total) FROM pos_sale_items psi WHERE psi.sale_id = ps.id),
        0
      )
    ) > 0.01;
$$;

-- Count non-voided sales with zero matching line items (orphan sales)
CREATE OR REPLACE FUNCTION wh_headless_count(p_business_id uuid, p_since timestamptz)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::integer
  FROM pos_sales ps
  WHERE ps.business_id = p_business_id
    AND ps.status       != 'voided'
    AND ps.created_at   >= p_since
    AND NOT EXISTS (
      SELECT 1 FROM pos_sale_items psi WHERE psi.sale_id = ps.id
    );
$$;

-- Return (total_sales, paid_sales) for payments coverage calculation
-- pos_sale_payments is the authoritative payments table
CREATE OR REPLACE FUNCTION wh_payments_coverage(p_business_id uuid, p_since timestamptz)
RETURNS TABLE(total_sales bigint, paid_sales bigint) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COUNT(ps.id)      AS total_sales,
    COUNT(sp.sale_id) AS paid_sales
  FROM pos_sales ps
  LEFT JOIN (SELECT DISTINCT sale_id FROM pos_sale_payments) sp
    ON sp.sale_id = ps.id
  WHERE ps.business_id = p_business_id
    AND ps.status       != 'voided'
    AND ps.created_at   >= p_since;
$$;

-- Count public tables that have no RLS policies at all
CREATE OR REPLACE FUNCTION wh_rls_disabled_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::integer
  FROM pg_tables pt
  WHERE pt.schemaname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies pp
      WHERE pp.schemaname = pt.schemaname
        AND pp.tablename  = pt.tablename
    );
$$;
