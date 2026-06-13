-- AUTOPILOT-FIX-1 PART 1b — payment-coverage denominator must be COMPLETED sales only.
-- The original wh_payments_coverage (20260611000001) used `ps.status != 'voided'`, which still
-- counts draft / pending / cancelled sales. Those legitimately have NO payment record, so the
-- denominator was inflated and coverage read e.g. "6 of 32 = 19%" for a small cafe whose real
-- coverage (6 completed, all 6 paid) is 100%. CREATE OR REPLACE — additive, no drop, no data change.
CREATE OR REPLACE FUNCTION wh_payments_coverage(p_business_id uuid, p_since timestamptz)
RETURNS TABLE(total_sales bigint, paid_sales bigint) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COUNT(ps.id)      AS total_sales,
    COUNT(sp.sale_id) AS paid_sales
  FROM pos_sales ps
  LEFT JOIN (SELECT DISTINCT sale_id FROM pos_sale_payments) sp
    ON sp.sale_id = ps.id
  WHERE ps.business_id = p_business_id
    AND ps.status       = 'completed'   -- was: != 'voided' (counted draft/pending/cancelled)
    AND ps.created_at   >= p_since;
$$;
