-- LOY-REDEEM-SCAN — short-lived, single-use in-store redeem code on the existing pos_customer_auth
-- row (mirrors the otp_hash/otp_expires_at pattern). The customer shows a QR encoding a random token;
-- the cashier scans it, the token is resolved (hashed lookup, business-scoped) and atomically consumed.
-- The raw customer_id is never in the barcode (it would be a permanent, replayable identifier).
alter table pos_customer_auth
  add column if not exists redeem_token_hash text,
  add column if not exists redeem_token_expires_at timestamptz,
  add column if not exists redeem_token_consumed_at timestamptz;

create index if not exists pos_customer_auth_redeem_token on pos_customer_auth (redeem_token_hash)
  where redeem_token_hash is not null;
