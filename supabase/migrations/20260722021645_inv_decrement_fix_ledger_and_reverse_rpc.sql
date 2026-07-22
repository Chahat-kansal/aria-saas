-- INV-DECREMENT-FIX — stock_movements diagnosability (RULE 10-style lesson: booking_availability's
-- missing updated_at made a whole class of bug undiagnosable; don't repeat it here) + a per-outlet
-- column so the ledger records WHERE a sale/void/refund/return actually adjusted stock, and a
-- written_by marker identifying which code path wrote each row.
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES pos_outlets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS written_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Idempotency for reversal movement types. The existing stock_movements_sale_line_uniq index only
-- covers movement_type='sale'; without this, two identical void/refund/return retries for the same
-- sale+item would each pass the (sale_id, movement_type) app-level check under a race and insert twice.
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_reversal_line_uniq
  ON stock_movements (sale_id, item_id, movement_type)
  WHERE sale_id IS NOT NULL AND movement_type IN ('void', 'refund', 'return');

-- BUG FOUND LIVE (INV-DECREMENT-FIX sibling sweep): reverse_outlet_inventory referenced
-- pos_outlet_inventory.on_hand (real column: items_on_hand) and stock_movements.product_id /
-- quantity / reason (real columns: item_id / quantity_added / new_stock / movement_type, all of
-- which are NOT NULL except notes). Every call either threw (caught, logged, swallowed by all 3
-- JS call sites' try/catch) or the stock_movements insert silently no-op'd on undefined_column —
-- so every return/void routed through this RPC updated pos_sale_items.returned_quantity correctly
-- but NEVER actually restored items_on_hand. Fixed to the real schema. Kept as a defensive/compat
-- path — the 3 call sites are being rerouted onto the proven adjustOutletStock()/resolveOutletId()
-- JS helpers in this same commit, which is now the primary path.
CREATE OR REPLACE FUNCTION public.reverse_outlet_inventory(
  p_product_id uuid,
  p_outlet_id uuid,
  p_quantity numeric,
  p_business_id uuid,
  p_reason text DEFAULT 'sale_return',
  p_sale_id uuid DEFAULT NULL,
  p_movement_type text DEFAULT 'return'
) RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_on_hand numeric;
BEGIN
  IF p_outlet_id IS NOT NULL THEN
    UPDATE pos_outlet_inventory
    SET items_on_hand = COALESCE(items_on_hand, 0) + p_quantity, updated_at = now()
    WHERE product_id = p_product_id AND outlet_id = p_outlet_id AND business_id = p_business_id
    RETURNING items_on_hand INTO v_new_on_hand;

    IF NOT FOUND THEN
      INSERT INTO pos_outlet_inventory (business_id, product_id, outlet_id, items_on_hand)
      VALUES (p_business_id, p_product_id, p_outlet_id, GREATEST(p_quantity, 0))
      ON CONFLICT (business_id, product_id, outlet_id) DO UPDATE
        SET items_on_hand = COALESCE(pos_outlet_inventory.items_on_hand, 0) + p_quantity, updated_at = now()
      RETURNING items_on_hand INTO v_new_on_hand;
    END IF;
  END IF;

  -- stock_quantity cache — kept in parallel, mirrors every other reversal path in this codebase.
  UPDATE pos_products SET stock_quantity = COALESCE(stock_quantity, 0) + p_quantity
  WHERE id = p_product_id AND business_id = p_business_id;

  BEGIN
    INSERT INTO stock_movements (
      business_id, item_id, outlet_id, movement_type, quantity_added, new_stock, notes, sale_id, written_by
    ) VALUES (
      p_business_id, p_product_id::text, p_outlet_id, p_movement_type, p_quantity,
      COALESCE(v_new_on_hand, 0), p_reason, p_sale_id, 'rpc:reverse_outlet_inventory'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- best-effort ledger row; the inventory update above already happened.
  END;
END;
$function$;
