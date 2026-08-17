-- ARIA-MERGE-FIX-1 — /api/customers/merge destroyed the record it was asked to consolidate.
--
-- THE BUG (customers/merge/route.ts, before this migration):
--
--   :42  update pos_customers set ..., phone = coalesce(primary.phone, secondary.phone) ...
--   :61  update pos_customers set deleted_at = now() where id = secondary_id
--
-- When the primary had no phone and the secondary did, :42 copied the secondary's phone onto the
-- primary WHILE THE SECONDARY WAS STILL LIVE. Two live rows, one business, one phone —
-- pos_customers_phone_uniq (business_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL
-- rejected the update with 23505. The route never destructured that error, so it carried on to :61
-- and soft-deleted the secondary anyway.
--
-- Net result: merged totals, points, phone, email, notes and tags were NEVER written, and the row
-- they came from was deleted. Unrecoverable from the primary alone. Merging into a sparse primary
-- is the NORMAL case, so this was the common path, not an edge.
--
-- WHY A FUNCTION AND NOT JUST A REORDER IN TYPESCRIPT:
--
-- 1. ATOMICITY. The route issues five separate writes over PostgREST, which cannot share a
--    transaction — supabase-js has no BEGIN. Any failure part-way leaves the customer in a WORSE
--    state than before the merge: sales repointed to a primary that never received the totals, or
--    a secondary soft-deleted with its data still only on itself. A plpgsql function body runs in
--    a single transaction, so the whole merge either happens or none of it does. That is the only
--    honest fix for a multi-row consolidation.
--
-- 2. NO READ-MODIFY-WRITE RACE. The old route read both rows over the network, computed the merged
--    values in JavaScript, and wrote them back unlocked. A sale landing in that window was silently
--    overwritten by a stale maximum. Here both rows are locked FOR UPDATE before anything is read.
--
-- ORDER IS THE FIX: the secondary is soft-deleted FIRST, which removes it from every partial unique
-- index predicated on `deleted_at IS NULL`, so the primary can then take its phone.
--
-- ...EXCEPT WHERE THE INDEX HAS NO SUCH PREDICATE. idx_pos_customers_square is
-- UNIQUE (business_id, square_customer_id) WHERE square_customer_id IS NOT NULL — no deleted_at
-- clause at all. Soft-deleting the secondary does NOT free that value, so reordering alone would
-- have left a second, identical silent failure for any business that has ever run a Square import.
-- The secondary's square_customer_id is therefore CLEARED in the same statement that soft-deletes
-- it, but only when the primary is actually taking it. (shopify/lightspeed have the same
-- predicate-less shape but are not copied by the merge, so they cannot collide.)

create or replace function merge_pos_customers_atomic(
  p_business_id uuid,
  p_primary_id uuid,
  p_secondary_id uuid,
  p_performed_by uuid
) returns pos_customers
language plpgsql
as $$
declare
  v_primary   pos_customers;
  v_secondary pos_customers;
  v_merged    pos_customers;
  v_spend     numeric;
  v_visits    integer;
  v_points    integer;
  v_last      timestamptz;
  v_notes     text;
  v_tags      text[];
  v_takes_square boolean;
begin
  if p_primary_id = p_secondary_id then
    raise exception 'merge_self' using errcode = 'check_violation';
  end if;

  -- Lock BOTH rows for the rest of the transaction, in id order. Ordering the lock acquisition is
  -- what stops two concurrent merges over the same pair in opposite directions from deadlocking.
  perform 1 from pos_customers
   where id in (p_primary_id, p_secondary_id)
     and business_id = p_business_id
   order by id
     for update;

  select * into v_primary   from pos_customers where id = p_primary_id   and business_id = p_business_id;
  select * into v_secondary from pos_customers where id = p_secondary_id and business_id = p_business_id;

  -- Scoped by business_id on both reads, so a caller cannot merge across tenants even if it
  -- somehow passed ids it does not own.
  if v_primary.id is null or v_secondary.id is null then
    raise exception 'merge_not_found' using errcode = 'no_data_found';
  end if;

  -- ── Merged values: IDENTICAL RULES TO THE ORIGINAL ROUTE (RULE 0) ──────────────────────────────
  -- greatest() ignores NULLs and returns NULL only when every argument is NULL, which is exactly
  -- what the old `[...].filter(Boolean).sort().reverse()[0] ?? null` produced for timestamps.
  -- coalesce(total_spent, total_spend, 0) mirrors `?? ... ?? 0`, so a real 0 is preserved rather
  -- than falling through to the next field the way `||` would have.
  v_spend  := greatest(coalesce(v_primary.total_spent, v_primary.total_spend, 0),
                       coalesce(v_secondary.total_spent, v_secondary.total_spend, 0));
  v_visits := greatest(coalesce(v_primary.visit_count, 0), coalesce(v_secondary.visit_count, 0));
  v_points := greatest(coalesce(v_primary.loyalty_points, v_primary.points_balance, 0),
                       coalesce(v_secondary.loyalty_points, v_secondary.points_balance, 0));
  v_last   := greatest(v_primary.last_visit, v_primary.last_visit_at,
                       v_secondary.last_visit, v_secondary.last_visit_at);

  -- array_to_string omits NULL elements, so this is `[p.notes, s.notes].filter(Boolean).join('\n')`
  -- and the outer nullif reproduces the trailing `|| null` for the both-empty case.
  v_notes := nullif(
    array_to_string(array[nullif(v_primary.notes, ''), nullif(v_secondary.notes, '')], E'\n'),
    '');

  -- Order-preserving union, matching `[...new Set([...p.tags, ...s.tags])]`. A plain
  -- array_agg(distinct) would silently re-sort the owner's tags alphabetically.
  select coalesce(array_agg(d.t order by d.ord), '{}'::text[])
    into v_tags
    from (
      select u.t, min(u.ord) as ord
        from unnest(coalesce(v_primary.tags, '{}'::text[]) || coalesce(v_secondary.tags, '{}'::text[]))
             with ordinality as u(t, ord)
       group by u.t
    ) d;

  v_takes_square := v_primary.square_customer_id is null
                and v_secondary.square_customer_id is not null;

  -- ── STEP 1 — SOFT-DELETE THE SECONDARY FIRST. THIS IS THE FIX. ────────────────────────────────
  -- Every partial unique index carrying `deleted_at IS NULL` stops seeing this row here, which is
  -- what lets step 2 take its phone. Nothing below reads the secondary from the table again — both
  -- snapshots were taken above, under the lock — so moving this first loses nothing.
  update pos_customers
     set deleted_at = now(),
         merged_into = p_primary_id,
         -- idx_pos_customers_square has NO deleted_at predicate, so the soft-delete alone does not
         -- release it. Cleared only when the primary is actually taking it; when both rows have
         -- their own Square id the primary keeps its own and there is no collision to resolve.
         square_customer_id = case when v_takes_square then null else square_customer_id end,
         updated_at = now()
   where id = p_secondary_id
     and business_id = p_business_id;

  -- ── STEP 2 — the merged primary ───────────────────────────────────────────────────────────────
  update pos_customers
     set total_spent  = v_spend,
         total_spend  = v_spend,
         visit_count  = v_visits,
         loyalty_points = v_points,
         points_balance = v_points,
         last_visit    = v_last,
         last_visit_at = v_last,
         email    = coalesce(v_primary.email, v_secondary.email),
         phone    = coalesce(v_primary.phone, v_secondary.phone),
         birthday = coalesce(v_primary.birthday, v_secondary.birthday),
         notes    = v_notes,
         tags     = v_tags,
         square_customer_id = coalesce(v_primary.square_customer_id, v_secondary.square_customer_id),
         updated_at = now()
   where id = p_primary_id
     and business_id = p_business_id
  returning * into v_merged;

  -- ── STEP 3 — repoint the secondary's history ──────────────────────────────────────────────────
  update pos_sales set customer_id = p_primary_id
   where customer_id = p_secondary_id and business_id = p_business_id;
  update campaigns  set customer_id = p_primary_id
   where customer_id = p_secondary_id and business_id = p_business_id;

  -- ── STEP 4 — audit trail ──────────────────────────────────────────────────────────────────────
  -- old_data is the PRE-MERGE snapshot taken under the lock, so it still carries the secondary's
  -- square_customer_id and its live deleted_at = null. That snapshot is the repair path if a merge
  -- ever turns out to have been wrong.
  --
  -- Inside the transaction, unlike the old route's fire-and-forget `.catch(() => {})`: if the audit
  -- row cannot be written, the merge did not happen. An unlogged irreversible consolidation is not
  -- an acceptable success.
  insert into deletion_audit_log (table_name, row_id, action, old_data, performed_by, business_id, reason)
  values ('pos_customers', p_secondary_id, 'soft_delete_merged', to_jsonb(v_secondary),
          p_performed_by, p_business_id, 'merged_into:' || p_primary_id::text);

  return v_merged;
end;
$$;

-- Service-role only. The function is SECURITY INVOKER, so an anon caller would already be stopped
-- by RLS, but there is no reason for the grant to exist at all.
revoke all on function merge_pos_customers_atomic(uuid, uuid, uuid, uuid) from public;
revoke all on function merge_pos_customers_atomic(uuid, uuid, uuid, uuid) from anon;
revoke all on function merge_pos_customers_atomic(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function merge_pos_customers_atomic(uuid, uuid, uuid, uuid) to service_role;
