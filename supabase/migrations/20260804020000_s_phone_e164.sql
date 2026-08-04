-- S-PHONE-E164 — normalise pos_customers.phone to canonical AU E.164.
--
-- The gap was NORMALISATION, not uniqueness. pos_customers_phone_uniq already enforces
-- UNIQUE(business_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL — but it compares RAW
-- strings, so '0412345678' and '+61412345678' are different values and both insert cleanly. The
-- index needs no change; the values do.
--
-- The CASE below is a line-for-line transcription of toE164AU() in src/lib/phone.ts, so the
-- database and the application agree on what canonical means. The brief's version handled only the
-- 61-prefixed and 0-led forms; the bare-9-digit rule is included here too, otherwise an existing
-- '234567890' row would stay raw while a new identical input normalised — creating the very
-- duplicate this sprint removes.
--
-- ── DRY RUN BEFORE APPLYING (not assumed — executed) ────────────────────────────────────────────
--   rows with phone, not deleted ... 47
--   rows that change ............... 2   ('234567890' -> '+61234567890', '123456789' -> '+61123456789')
--   collisions after normalising ... 0
-- So NO merge was required and none was performed. See the note on the reported collision below.

update pos_customers
set phone = (
  with d as (select regexp_replace(phone, '[^0-9+]', '', 'g') as x)
  select case
    when (select x from d) ~ '^61[0-9]{9}$'    then '+' || (select x from d)
    when (select x from d) ~ '^0[0-9]{9}$'     then '+61' || substr((select x from d), 2)
    when (select x from d) ~ '^[1-9][0-9]{8}$' then '+61' || (select x from d)
    else phone
  end
)
where phone is not null and deleted_at is null;

-- ── THE "1 COLLISION" IN THE BRIEF WAS A MEASUREMENT ARTIFACT ───────────────────────────────────
-- The verify query normalises with right(digits, 9), which truncates. That maps BOTH '234567890'
-- and '1234567890' to '+61234567890' and reports them as one duplicate customer. They are two
-- distinct strings and toE164AU resolves them differently ('1234567890' is 10 digits not starting
-- with 0, so it stays raw). Under the real algorithm they never collide.
--
-- Had it been a genuine duplicate it would still not have been merged here: the losing row holds 15
-- loyalty_points, and the brief's own rule is to stop and report rather than move points by hand.
--
-- The one REAL duplicate pair on this table ('+61470446388' / '0470446388') was already merged on
-- 2026-07-08 — the loser carries merged_into and deleted_at, and this UPDATE skips it via
-- `deleted_at is null`, so the unique index cannot be violated by that pair either.

-- ── NOTE ON THE BARE-9-DIGIT RULE ───────────────────────────────────────────────────────────────
-- toE164AU accepts /^[1-9]/ for the 9-digit form, per spec. AU reserves the leading 1 for service
-- numbers (13/1300/1800), so '123456789' -> '+61123456789' is not a dialable number. Implemented as
-- specified rather than silently narrowed to [2-9]; the only affected row is test data, and
-- tightening it later is a one-character change in one place now that there is one implementation.
