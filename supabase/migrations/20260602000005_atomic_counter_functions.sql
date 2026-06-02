-- Generic atomic increment — returns new value (can pass negative amount for decrements)
CREATE OR REPLACE FUNCTION increment_numeric(
  p_table  text,
  p_id     uuid,
  p_column text,
  p_amount numeric
) RETURNS numeric AS $$
DECLARE v_result numeric;
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = COALESCE(%I,0) + $1 WHERE id = $2 RETURNING %I',
    p_table, p_column, p_column, p_column
  ) INTO v_result USING p_amount, p_id;
  RETURN v_result;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generic atomic decrement floored at 0 — returns new value
CREATE OR REPLACE FUNCTION decrement_numeric(
  p_table  text,
  p_id     uuid,
  p_column text,
  p_amount numeric
) RETURNS numeric AS $$
DECLARE v_result numeric;
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = GREATEST(0, COALESCE(%I,0) - $1) WHERE id = $2 RETURNING %I',
    p_table, p_column, p_column, p_column
  ) INTO v_result USING p_amount, p_id;
  RETURN v_result;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic stock decrement for pos_products.stock_quantity — floors at 0
CREATE OR REPLACE FUNCTION decrement_stock_quantity(
  p_product_id uuid,
  p_amount     numeric
) RETURNS numeric AS $$
DECLARE v_result numeric;
BEGIN
  UPDATE pos_products
     SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - p_amount)
   WHERE id = p_product_id
  RETURNING stock_quantity INTO v_result;
  RETURN v_result;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_numeric     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION decrement_numeric     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION decrement_stock_quantity TO anon, authenticated, service_role;