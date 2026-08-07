-- SEC-PIN-3 §1 — stop storing plaintext staff PINs.
--
-- This migration does ONE thing: drops the NOT NULL on pos_users.pin so the application can stop
-- writing it. The column itself stays, every value in it stays, and every legacy read-fallback stays
-- (RULE 0). Dropping the column is §2, a SEPARATE commit, deliberately — if a reader was missed, a
-- code-only revert fixes it; a dropped column needs a restore.
--
-- WHY THE TWO TABLES DIFFER: pos_staff.pin has always been nullable (staff can exist before an owner
-- gives them a PIN — that is what the "set a PIN so they can log in" state on the inventory-team page
-- means). pos_users.pin was declared NOT NULL by 20260503000001_pos_users.sql, whose comment reads
-- "4-digit PIN, not sensitive — no hashing needed". That line is the origin of this whole sprint.
--
-- ── PRE-MIGRATION DUMP (RULE 10) ────────────────────────────────────────────────────────────────
--   pos_users: 1 row  — pin 1, pin_hash 1, pin_lookup 1, plaintext-only 0
--   pos_staff: 5 rows — pin 5, pin_hash 5, pin_lookup 5, plaintext-only 0
--   pos_users.pin is_nullable = NO; pos_staff.pin is_nullable = YES
--   is_generated = NEVER on all six pin/pin_hash/pin_lookup columns (so nothing is computed FROM
--   the plaintext column by the database), zero triggers on either table, and zero views, functions
--   or RLS policies referencing either table. Verified live 2026-08-07 before writing this file.
--
-- ── WHY pin_lookup MATTERS HERE, NOT JUST pin_hash ──────────────────────────────────────────────
-- Four routes identify a person from the PIN ALONE — verify-override, timesheets clock-in and
-- clock-out, and canopy-pin. bcrypt is salted, so there is no `where pin_hash = hash(input)`; they
-- narrow on pin_lookup and confirm with pin_hash, and today they fall through to `.eq('pin', pin)`
-- when the lookup misses. Three of the four writers wrote pin_hash but NOT pin_lookup, so removing
-- the plaintext write without adding the lookup would leave newly created staff able to log in
-- (their id is known) but unable to clock in or authorise an override — findable by nothing. The
-- accompanying code change adds pin_lookup to every writer for exactly that reason.

alter table public.pos_users alter column pin drop not null;

comment on column public.pos_users.pin is
  'LEGACY plaintext. SEC-PIN-3 §1 stopped writing it; §2 drops the column. Authoritative value is pin_hash (bcrypt); pin_lookup is the HMAC index. Do not read this column in new code — staff-pin.test.ts fails the build on any comparison against it.';
comment on column public.pos_staff.pin is
  'LEGACY plaintext. SEC-PIN-3 §1 stopped writing it; §2 drops the column. Authoritative value is pin_hash (bcrypt); pin_lookup is the HMAC index. Do not read this column in new code — staff-pin.test.ts fails the build on any comparison against it.';

-- ── SEC-PIN-3 §2, THE FOLLOW-UP ─────────────────────────────────────────────────────────────────
-- Only after §1 is deployed AND a real staff login + manager override have happened against it:
--   alter table public.pos_users drop column pin;
--   alter table public.pos_staff drop column pin;
-- Preconditions, both checkable and both required:
--   1. select count(*) from pos_users where pin_hash is null  -->  must be 0   (same for pos_staff)
--   2. select count(*) from pos_staff where pin is not null and pin_lookup is null  -->  must be 0
--      A row with a hash but no lookup can log in but cannot clock in — see the block above.
-- If (2) is non-zero, STAFF_PIN_PEPPER is not set in the runtime that created those rows. Set it and
-- re-backfill BEFORE dropping, or those staff lose the PIN-only routes with no fallback left.
