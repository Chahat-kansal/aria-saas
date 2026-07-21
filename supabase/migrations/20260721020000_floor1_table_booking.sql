-- FLOOR-1 — owner-controlled table selection for bookings, generic across cafés/restaurants.

-- Additive schema
alter table bookings add column if not exists table_id uuid references pos_tables(id);
alter table pos_tables add column if not exists is_guest_selectable boolean not null default false;
alter table pos_tables add column if not exists seating_area text;
alter table pos_tables add column if not exists display_name text;
alter table businesses add column if not exists booking_table_mode text not null default 'auto'
  check (booking_table_mode in ('auto', 'area', 'table'));

-- Atomic table assignment + booking confirm, mirroring the existing sale-path atomics
-- (redeem_gift_card / claim_return_qty, supabase/migrations/20260623150000_pos_race_atomics.sql):
-- row-locks the candidate table(s) FOR UPDATE SKIP LOCKED so two concurrent confirms for the
-- last fitting table serialize instead of double-booking it. Graceful degrade: a business with
-- zero pos_tables rows at all behaves exactly as before this migration (no table_id assigned,
-- same insert shape) — a new business must never see broken table logic it never configured.
create or replace function confirm_booking_atomic(
  p_business_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_booking_date date,
  p_booking_time time,
  p_duration_minutes int,
  p_party_size int,
  p_notes text,
  p_source text,
  p_table_id uuid default null,
  p_seating_area text default null
)
returns bookings
language plpgsql
as $$
declare
  v_buffer int;
  v_end_time time;
  v_assigned_table uuid;
  v_has_tables boolean;
  v_booking bookings;
begin
  select exists(select 1 from pos_tables where business_id = p_business_id) into v_has_tables;

  if not v_has_tables then
    insert into bookings (
      business_id, service_id, customer_name, customer_email, customer_phone,
      booking_date, booking_time, duration_minutes, party_size, notes,
      status, source, confirmed_at
    ) values (
      p_business_id, p_service_id, p_customer_name, p_customer_email, p_customer_phone,
      p_booking_date, p_booking_time, p_duration_minutes, p_party_size, p_notes,
      'confirmed', p_source, now()
    ) returning * into v_booking;
    return v_booking;
  end if;

  select buffer_minutes into v_buffer
  from booking_availability
  where business_id = p_business_id and day_of_week = extract(dow from p_booking_date)::int;
  v_buffer := coalesce(v_buffer, 15);
  v_end_time := p_booking_time + ((p_duration_minutes + v_buffer) || ' minutes')::interval;

  if p_table_id is not null then
    -- 'table' mode: customer picked a specific table — re-verify guest-selectable + free,
    -- never trust the client's own claim that it was free when the picker was drawn.
    select id into v_assigned_table
    from pos_tables t
    where t.id = p_table_id
      and t.business_id = p_business_id
      and t.is_guest_selectable = true
      and t.seats >= p_party_size
      and not exists (
        select 1 from bookings b
        where b.table_id = t.id
          and b.booking_date = p_booking_date
          and b.status != 'cancelled'
          and b.booking_time < v_end_time
          and (b.booking_time + ((coalesce(b.duration_minutes, 60) + v_buffer) || ' minutes')::interval) > p_booking_time
      )
    for update skip locked;
  else
    -- 'auto' / 'area' mode: smallest fitting table, any (auto) or within the chosen area (area).
    select id into v_assigned_table
    from pos_tables t
    where t.business_id = p_business_id
      and t.seats >= p_party_size
      and (p_seating_area is null or t.seating_area = p_seating_area)
      and not exists (
        select 1 from bookings b
        where b.table_id = t.id
          and b.booking_date = p_booking_date
          and b.status != 'cancelled'
          and b.booking_time < v_end_time
          and (b.booking_time + ((coalesce(b.duration_minutes, 60) + v_buffer) || ' minutes')::interval) > p_booking_time
      )
    order by t.seats asc
    for update skip locked
    limit 1;
  end if;

  if v_assigned_table is null then
    return null; -- no eligible table free right now — caller reports "slot no longer available"
  end if;

  insert into bookings (
    business_id, service_id, customer_name, customer_email, customer_phone,
    booking_date, booking_time, duration_minutes, party_size, notes,
    status, source, confirmed_at, table_id
  ) values (
    p_business_id, p_service_id, p_customer_name, p_customer_email, p_customer_phone,
    p_booking_date, p_booking_time, p_duration_minutes, p_party_size, p_notes,
    'confirmed', p_source, now(), v_assigned_table
  ) returning * into v_booking;

  return v_booking;
end;
$$;
