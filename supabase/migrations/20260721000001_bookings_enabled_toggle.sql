-- BOOKINGS-OWNER-CONTROL-1: on/off switch for online bookings.
-- Backfill true for any business that already has a public booking link configured,
-- so existing live booking pages (e.g. Sip) don't go dark on this additive change.
alter table businesses add column if not exists bookings_enabled boolean not null default false;
update businesses set bookings_enabled = true where booking_link_slug is not null and bookings_enabled = false;
