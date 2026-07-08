-- 20260708000001: Merge duplicate pos_customers rows; add DB-level uniqueness guards.
--
-- Root cause: public/loyalty/[business_id]/enrol stored raw phone (e.g. '0470446388')
-- without normalising, then checked for duplicates with the same raw value, missing
-- the existing '+61470446388' row and creating a second membership for the identity.
--
-- This migration:
--   1. Adds merged_into column for soft-delete audit trail
--   2. Backs up every affected row before touching anything
--   3. Merges all (business_id, loyalty_identity_id) groups with >1 active row:
--        canonical = normalized-phone row > highest points_balance > oldest created_at
--        SUM points_balance + loyalty_points + visit_count + total_spent + total_spend
--        Repoints all 29 FK child tables from dup IDs → canonical
--        Soft-marks dup rows (deleted_at + merged_into)
--   4. Normalises remaining raw AU mobile phones (04XXXXXXXX → +614XXXXXXXX)
--   5. Creates UNIQUE partial indexes to prevent future duplicates at DB level

BEGIN;

-- ── Step 1: merged_into column ────────────────────────────────────────────────
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES pos_customers(id);

-- ── Step 2: backup affected rows ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _dup_customer_merge_log AS
  SELECT pc.*, now() AS backed_up_at
  FROM pos_customers pc
  WHERE loyalty_identity_id IS NOT NULL
    AND deleted_at IS NULL
    AND (business_id, loyalty_identity_id) IN (
      SELECT business_id, loyalty_identity_id
      FROM pos_customers
      WHERE loyalty_identity_id IS NOT NULL AND deleted_at IS NULL
      GROUP BY business_id, loyalty_identity_id
      HAVING count(*) > 1
    );

-- ── Step 3: merge duplicate groups ────────────────────────────────────────────
DO $$
DECLARE
  dup     RECORD;
  canon   UUID;
  dup_id  UUID;
BEGIN
  FOR dup IN
    SELECT
      business_id,
      loyalty_identity_id,
      -- Canonical: normalised phone first, then highest points, then oldest
      (array_agg(id ORDER BY
         CASE WHEN phone ~ '^\+' THEN 0 ELSE 1 END,
         COALESCE(points_balance, 0) DESC,
         created_at ASC
      ))[1]   AS canon_id,
      (array_agg(id ORDER BY
         CASE WHEN phone ~ '^\+' THEN 0 ELSE 1 END,
         COALESCE(points_balance, 0) DESC,
         created_at ASC
      ))[2:]  AS dup_ids,
      SUM(COALESCE(points_balance, 0))  AS total_points,
      SUM(COALESCE(loyalty_points, 0))  AS total_lp,
      SUM(COALESCE(visit_count, 0))     AS total_visits,
      SUM(COALESCE(total_spent, 0))     AS total_spent_sum,
      SUM(COALESCE(total_spend, 0))     AS total_spend_sum
    FROM pos_customers
    WHERE loyalty_identity_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY business_id, loyalty_identity_id
    HAVING count(*) > 1
  LOOP
    canon := dup.canon_id;

    -- Merge aggregated values into canonical
    UPDATE pos_customers SET
      points_balance = dup.total_points,
      loyalty_points = dup.total_lp,
      visit_count    = dup.total_visits,
      total_spent    = dup.total_spent_sum,
      total_spend    = dup.total_spend_sum,
      -- Fill in normalised phone if canonical currently has none
      phone = COALESCE(
        (SELECT p1.phone FROM pos_customers p1
         WHERE p1.id = canon AND p1.phone ~ '^\+'),
        (SELECT
           CASE WHEN p2.phone ~ '^04[0-9]{8}$'
                THEN '+61' || substring(p2.phone FROM 2)
                ELSE p2.phone
           END
         FROM pos_customers p2
         WHERE p2.id = ANY(dup.dup_ids) AND p2.phone IS NOT NULL
         LIMIT 1),
        (SELECT p3.phone FROM pos_customers p3 WHERE p3.id = canon)
      ),
      updated_at = now()
    WHERE id = canon;

    -- Repoint FK child rows from each dup to canonical then soft-mark dup
    FOREACH dup_id IN ARRAY dup.dup_ids LOOP
      UPDATE campaign_recipients          SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE campaign_sends               SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE customer_activity            SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE customer_clv_scores          SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE customer_winback_recipients  SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE instore_conversations        SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE loyalty_challenges           SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE loyalty_fraud_flags          SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE loyalty_referrals            SET referrer_customer_id = canon WHERE referrer_customer_id = dup_id;
      UPDATE loyalty_referrals            SET referred_customer_id = canon WHERE referred_customer_id = dup_id;
      UPDATE missed_demand                SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE nps_responses                SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_campaign_sends           SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_customer_auth            SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_customer_communications  SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_customer_transactions    SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_display_suggestions      SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_laybys                   SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_loyalty_transactions     SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_online_orders            SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_parked_sales             SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_promotion_redemptions    SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_review_requests          SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_sale_splits              SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_sales                    SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE pos_self_checkout_carts      SET loyalty_customer_id  = canon WHERE loyalty_customer_id  = dup_id;
      UPDATE pos_store_credits            SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE review_requests              SET customer_id          = canon WHERE customer_id          = dup_id;
      UPDATE split_group_members          SET customer_id          = canon WHERE customer_id          = dup_id;

      UPDATE pos_customers SET
        deleted_at  = now(),
        merged_into = canon
      WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- ── Step 4: normalise remaining raw AU mobile phones ──────────────────────────
UPDATE pos_customers
SET phone = '+61' || substring(regexp_replace(phone, '[\s\-\.]', '', 'g') FROM 2)
WHERE phone IS NOT NULL
  AND deleted_at IS NULL
  AND regexp_replace(phone, '[\s\-\.]', '', 'g') ~ '^04[0-9]{8}$';

-- ── Step 5: uniqueness guards ─────────────────────────────────────────────────
-- One active membership per identity per business
CREATE UNIQUE INDEX IF NOT EXISTS pos_customers_identity_uniq
  ON pos_customers (business_id, loyalty_identity_id)
  WHERE loyalty_identity_id IS NOT NULL AND deleted_at IS NULL;

-- One active membership per normalised phone per business
-- (conflicts verified nil after the merge above)
CREATE UNIQUE INDEX IF NOT EXISTS pos_customers_phone_uniq
  ON pos_customers (business_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

COMMIT;