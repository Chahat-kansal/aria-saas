-- SEC-PIN-1 — staff PINs were stored and compared in PLAINTEXT across two tables and six routes,
-- while loyalty members have had bcrypt since launch (lib/loyalty/auth.ts). Same product, two
-- standards. Adds hash + lookup columns; the plaintext column STAYS until the backfill is verified
-- and every route is migrated (RULE 0), then goes in the follow-up (see SEC-PIN-2 below).
--
-- WHY TWO COLUMNS, NOT ONE: bcrypt is salted, so the same PIN hashes differently every time and
-- there is no `WHERE pin_hash = hash(input)`. Two routes (till clock-in, manager override) identify
-- a person FROM THE PIN ALONE — that is the entire UX. So:
--   pin_hash   — bcrypt cost 10. The thing that actually authenticates.
--   pin_lookup — HMAC-SHA256(business_id + ':' + pin, STAFF_PIN_PEPPER), hex. Deterministic, so it
--                is indexable; useless without the pepper, which lives in Vercel env and never
--                touches this database. Scoped by business_id so the same PIN at two cafés produces
--                different values.
-- Lookup narrows to a candidate row; bcrypt confirms it. Both steps, always.
--
-- Threat model, stated plainly: if the pepper leaks AND the database leaks, a 4-digit space is
-- trivially enumerable offline. That is strictly better than today, where the PIN is readable in
-- plaintext from a database dump alone with no second secret required.

-- ── PRE-MIGRATION DUMP (standing rule) ──────────────────────────────────────────────────────────
-- pos_users: 1 row, 1 with pin, all 4 digits.  pos_staff: 5 rows, 5 with pin, all 4 digits.
-- Duplicate (business_id, pin) pairs: ZERO in both tables — verified before creating the unique
-- indexes below, which would otherwise fail to build.
-- Confirmed ABSENT before this migration: pin_hash, pin_lookup on both tables.

alter table public.pos_users  add column if not exists pin_hash   text;
alter table public.pos_users  add column if not exists pin_lookup text;
alter table public.pos_staff  add column if not exists pin_hash   text;
alter table public.pos_staff  add column if not exists pin_lookup text;

-- Lookup must be unique per business, or a collision silently makes two people the same person.
-- Partial (WHERE pin_lookup is not null) so rows not yet backfilled do not collide on NULL.
create unique index if not exists pos_users_pin_lookup_uniq
  on public.pos_users (business_id, pin_lookup) where pin_lookup is not null;
create unique index if not exists pos_staff_pin_lookup_uniq
  on public.pos_staff (business_id, pin_lookup) where pin_lookup is not null;

comment on column public.pos_users.pin_lookup is
  'HMAC-SHA256(business_id:pin, STAFF_PIN_PEPPER). Deterministic index for PIN-only login; auth is pin_hash. Rotating the pepper REQUIRES recomputing every value in this column.';
comment on column public.pos_staff.pin_lookup is
  'HMAC-SHA256(business_id:pin, STAFF_PIN_PEPPER). Deterministic index for PIN-only login; auth is pin_hash. Rotating the pepper REQUIRES recomputing every value in this column.';
comment on column public.pos_users.pin_hash is 'bcrypt(pin, cost 10). Authoritative. Plaintext pin column is legacy and slated for removal — SEC-PIN-2.';
comment on column public.pos_staff.pin_hash is 'bcrypt(pin, cost 10). Authoritative. Plaintext pin column is legacy and slated for removal — SEC-PIN-2.';

-- ── SEC-PIN-2, THE FOLLOW-UP THAT MUST NOT BE FORGOTTEN ─────────────────────────────────────────
-- Until the plaintext column is dropped, #16 IS NOT CLOSED. This migration closes #17 (null-unsafe
-- compare) and #18 (non-constant-time compare) and builds the machinery for #16.
-- When have_hash == have_pin on both tables and all routes are confirmed live:
--   1. remove every legacy fallback branch in the routes
--   2. alter table public.pos_users drop column pin;  (same for pos_staff)
--   3. alter table public.pos_users alter column pin_hash set not null;  (same for pos_staff)
-- A half-migrated auth path is worse than either end state.
