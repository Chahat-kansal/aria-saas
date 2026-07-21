-- BOOKINGS-AVAIL-WRITE-FIX
-- 1) booking_availability had no updated_at — no way to tell whether a write actually landed.
--    Reuses the existing canonical set_updated_at() trigger function (same as other tables).
alter table booking_availability add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_booking_availability_updated_at on booking_availability;
create trigger trg_booking_availability_updated_at
before update on booking_availability
for each row execute function set_updated_at();

-- 2) booking_availability_rules: confirmed dead — zero references in src/ (only a generated
--    types file), no views depend on it, only its own PK/FK. A duplicate-shaped table that
--    looked authoritative next to the real one is the same trap as a dead route that looks live.
drop table if exists booking_availability_rules;
