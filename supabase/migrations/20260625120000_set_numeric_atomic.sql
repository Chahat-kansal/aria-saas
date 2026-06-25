-- ASK-ARIA-CONSOLIDATE-2 (RC1): atomic absolute SET for a numeric column, floored at 0.
-- Mirrors increment_numeric/decrement_numeric. A single UPDATE sets the absolute target, so two concurrent
-- "set 50" both land on 50 (no read-modify-write race / lost update). Returns the post-set value.
create or replace function set_numeric(p_table text, p_id uuid, p_column text, p_value numeric)
returns numeric
language plpgsql
as $$
declare v_new numeric;
begin
  execute format('update %I set %I = GREATEST(0, $1) where id = $2 returning %I', p_table, p_column, p_column)
    into v_new using p_value, p_id;
  return v_new;
end $$;
