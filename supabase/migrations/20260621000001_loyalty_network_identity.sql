-- LOY-NETWORK — GLOBAL loyalty identity (one email + PIN + barcode) linking to many per-business
-- memberships. Additive: pos_customer_auth (the LOY-P1 per-business model, 0 rows) is left in place,
-- deprecated. Identity secrets live on the RLS-locked loyalty_identity table; memberships are the
-- existing pos_customers rows, linked via loyalty_identity_id (points/tier/stamps stay per-business).
create table if not exists loyalty_identity (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  pin_hash text, pin_set_at timestamptz,
  email_verified boolean not null default false,
  failed_pin_attempts int not null default 0,
  locked_until timestamptz,
  otp_hash text, otp_expires_at timestamptz, otp_attempts int not null default 0,
  verified_until timestamptz,
  session_token text,
  redeem_token_hash text, redeem_token_expires_at timestamptz, redeem_token_consumed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists loyalty_identity_email on loyalty_identity (lower(email));
create index if not exists loyalty_identity_session on loyalty_identity (session_token) where session_token is not null;
create unique index if not exists loyalty_identity_redeem on loyalty_identity (redeem_token_hash) where redeem_token_hash is not null;
alter table loyalty_identity enable row level security;

-- Membership link + per-business cashier invite token (on the membership row).
alter table pos_customers add column if not exists loyalty_identity_id uuid references loyalty_identity(id) on delete set null;
alter table pos_customers add column if not exists loyalty_invite_token text;
alter table pos_customers add column if not exists loyalty_invite_sent_at timestamptz;
create index if not exists pos_customers_loyalty_identity on pos_customers (loyalty_identity_id) where loyalty_identity_id is not null;
create unique index if not exists pos_customers_loyalty_invite on pos_customers (loyalty_invite_token) where loyalty_invite_token is not null;
