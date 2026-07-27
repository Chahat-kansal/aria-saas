-- SECURITY-P5 Tier 2 — data-integrity write functions. Every call site was traced across the repo
-- (src/**, .rpc('name' grep) before any grant was touched, per RULE0.
--
-- create_product_draft — the ONE function in this tier with a real, currently-exploitable gap: it
-- is called directly from a 'use client' component (src/components/products/wizard/ProductWizard.tsx,
-- via src/lib/supabase.ts's createBrowserClient — the public anon-key browser client) and had NO
-- internal ownership check, trusting p_business_id blindly. Any authenticated user (i.e. anyone who
-- signs up) could have called this RPC directly with ANY business_id to inject phantom draft
-- products (+ inventory/price/barcode/loyalty rows) into a business they don't own. This is a real
-- code fix, not a grants-only tightening — mirrors the exact ownership check already used by every
-- server route in this codebase (resolveOwnerBusinessId: businesses.id = target AND
-- businesses.user_id = auth.uid() AND businesses.is_active = true), moved into the function itself
-- since the RPC is legitimately client-called and can't just be revoked. authenticated keeps
-- EXECUTE (real users still need this from the wizard); anon is revoked (no legitimate anon caller).
create or replace function public.create_product_draft(
  p_business_id uuid, p_name text, p_sku text, p_barcode text, p_brand text, p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_product_id uuid;
  v_outlet_id uuid;
  v_price_set_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = p_business_id AND user_id = auth.uid() AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  -- Insert product as draft (is_active = false)
  INSERT INTO pos_products (
    business_id, name, sku, brand, description, is_active, status
  ) VALUES (
    p_business_id, p_name, p_sku, p_brand, p_description, false, 'draft'
  ) RETURNING id INTO v_product_id;

  -- Get the global outlet for this business
  SELECT id INTO v_outlet_id
  FROM pos_outlets
  WHERE business_id = p_business_id
    AND is_global = true
  LIMIT 1;

  -- Create outlet inventory rows for every active outlet
  IF v_outlet_id IS NOT NULL THEN
    INSERT INTO pos_outlet_inventory (business_id, product_id, outlet_id)
    SELECT p_business_id, v_product_id, id
    FROM pos_outlets
    WHERE business_id = p_business_id AND active = true
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get default price set
  SELECT id INTO v_price_set_id
  FROM pos_price_sets
  WHERE business_id = p_business_id AND is_default = true
  LIMIT 1;

  -- Create default price row (qty=1, global, $0 placeholder)
  IF v_price_set_id IS NOT NULL THEN
    INSERT INTO pos_product_prices
      (business_id, product_id, price_set_id, outlet_id, quantity, price)
    VALUES
      (p_business_id, v_product_id, v_price_set_id, NULL, 1, 0)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Create barcode if provided
  IF p_barcode IS NOT NULL AND p_barcode != '' THEN
    INSERT INTO pos_product_barcodes
      (business_id, product_id, barcode, is_primary, barcode_type)
    VALUES
      (p_business_id, v_product_id, p_barcode, true, 'item')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Create default loyalty row
  INSERT INTO pos_product_loyalty (business_id, product_id, earns_points)
  VALUES (p_business_id, v_product_id, true)
  ON CONFLICT DO NOTHING;

  RETURN v_product_id;
END;
$function$;

revoke execute on function create_product_draft(uuid, text, text, text, text, text) from public, anon;
grant execute on function create_product_draft(uuid, text, text, text, text, text) to authenticated, service_role;

-- Every other function below: confirmed via a full repo-wide call-site trace that ALL real callers
-- are server-side, and every session-scoped caller (as opposed to supabaseAdmin) independently
-- verifies the caller's own business/session ownership before reaching the RPC (application code
-- for the session-scoped callers was swapped from `supabase` to `supabaseAdmin` in this same commit
-- so the grant tightening below doesn't break them — see outlet-stock.ts, create-sale.ts,
-- sync-offline/route.ts, and the pos/sales/[id]/{route,void,refund}.ts / product-batches/decrement /
-- orders/receive route files). No anon/authenticated caller has a legitimate reason to hold these
-- grants directly.
--
-- decrement_numeric / increment_numeric / set_numeric — dynamic-SQL (format()) arbitrary
-- table/column UPDATE primitive; the most severe finding in this tier. set_numeric is SECURITY
-- INVOKER (not DEFINER) but shares the identical pattern and was anon-executable — included here.
revoke execute on function decrement_numeric(text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function decrement_numeric(text, uuid, text, numeric) to service_role;

revoke execute on function increment_numeric(text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function increment_numeric(text, uuid, text, numeric) to service_role;

revoke execute on function set_numeric(text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function set_numeric(text, uuid, text, numeric) to service_role;

revoke execute on function decrement_outlet_inventory(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function decrement_outlet_inventory(uuid, uuid, uuid, integer) to service_role;

revoke execute on function decrement_paid_credit(uuid) from public, anon, authenticated;
grant execute on function decrement_paid_credit(uuid) to service_role;

revoke execute on function decrement_stock_quantity(uuid, numeric) from public, anon, authenticated;
grant execute on function decrement_stock_quantity(uuid, numeric) to service_role;

revoke execute on function increment_free_used(uuid) from public, anon, authenticated;
grant execute on function increment_free_used(uuid) to service_role;

revoke execute on function increment_loyalty_points(uuid, integer) from public, anon, authenticated;
grant execute on function increment_loyalty_points(uuid, integer) to service_role;

revoke execute on function increment_returned_quantity(uuid, integer) from public, anon, authenticated;
grant execute on function increment_returned_quantity(uuid, integer) to service_role;
-- ^ DEAD — zero real callers found repo-wide. Revoked rather than dropped (RULE0: no destructive
-- drops without founder sign-off), service_role keeps EXECUTE for any future legitimate use.

revoke execute on function increment_session_totals(uuid, numeric, numeric, integer) from public, anon, authenticated;
grant execute on function increment_session_totals(uuid, numeric, numeric, integer) to service_role;

revoke execute on function track_aria_spend(uuid, integer, text) from public, anon, authenticated;
grant execute on function track_aria_spend(uuid, integer, text) to service_role;

-- rate_limit_hit — sole real caller is supabaseAdmin (src/lib/security/rate-limit.ts), but was
-- granted to authenticated+anon in its original migration. p_key values are always server-built
-- (ip/business_id/phone strings) today, never client-chosen — but since anon COULD call this
-- directly with a guessed key (e.g. a phone-based loyalty-code key), a direct caller could
-- pre-exhaust or reset another identity's rate-limit bucket ahead of their real request. Grants-only
-- fix.
revoke execute on function rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, integer, integer) to service_role;

-- log_customer_archive / log_sale_void — trigger functions (return type trigger), never called via
-- .rpc() anywhere in the repo; trigger firing does not depend on the invoking session holding
-- EXECUTE, so revoking the excess anon/authenticated grant here is pure hygiene, zero behavior
-- change.
revoke execute on function log_customer_archive() from public, anon, authenticated;
grant execute on function log_customer_archive() to service_role;

revoke execute on function log_sale_void() from public, anon, authenticated;
grant execute on function log_sale_void() to service_role;
