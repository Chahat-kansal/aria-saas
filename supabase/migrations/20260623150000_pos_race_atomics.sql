-- BUGFIX-POS-RACES-5 — atomic primitives that close the P1 concurrency races from POS-AUDIT-29.
-- Each replaces a non-atomic JS read-modify-write with a guarded SQL operation that succeeds at most once.
-- Reuses the codebase's existing RPC pattern (decrement_numeric / increment_session_totals / reverse_outlet_inventory).

-- FIX 1 — atomic guarded gift-card deduct. Row-locks the card (FOR UPDATE) so concurrent redemptions of
-- DIFFERENT sales serialize and can never overspend below 0. Charges LEAST(requested, balance) and returns the
-- actual charge + post-deduct balance. Returns NO row when the card is missing/depleted (caller → insufficient).
create or replace function redeem_gift_card(p_card_id uuid, p_bid uuid, p_charge numeric)
returns table(charged numeric, new_balance numeric)
language plpgsql
as $$
declare
  v_balance numeric;
  v_charged numeric;
begin
  select balance into v_balance from pos_gift_cards
    where id = p_card_id and business_id = p_bid
    for update;
  if v_balance is null or v_balance <= 0 then
    return; -- no row → insufficient / depleted by a concurrent redemption
  end if;
  v_charged := least(p_charge, v_balance);
  update pos_gift_cards
    set balance = v_balance - v_charged,
        redeemed_amount = coalesce(redeemed_amount, 0) + v_charged,
        is_active = (v_balance - v_charged) > 0,
        last_used_at = now()
    where id = p_card_id;
  charged := v_charged;
  new_balance := v_balance - v_charged;
  return next;
end;
$$;

-- FIX 3 — atomic returned-quantity claim. The arithmetic guard is evaluated under the row lock taken by UPDATE,
-- so two concurrent returns of the same line can never push returned_quantity past quantity (the loser matches
-- 0 rows → NULL). A negative p_qty cleanly releases a prior claim (rollback). Returns the new returned_quantity,
-- or NULL when the claim would exceed what was sold.
create or replace function claim_return_qty(p_item_id uuid, p_qty numeric)
returns numeric
language sql
as $$
  update pos_sale_items
  set returned_quantity = coalesce(returned_quantity, 0) + p_qty
  where id = p_item_id
    and coalesce(returned_quantity, 0) + p_qty <= quantity
  returning returned_quantity;
$$;
