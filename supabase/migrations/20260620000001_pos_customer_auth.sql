-- LOY-P1-IDENTITY — passwordless email + 6-digit-PIN identity for loyalty customers.
-- Separate, RLS-locked table (NOT columns on pos_customers) so pin_hash / otp_hash /
-- session_token are unreachable by any owner/public pos_customers select. Keyed by a
-- surrogate id with unique(business_id, lower(email)) and a NULLABLE customer_id, so a
-- brand-new self-signup email gets a pending auth row without creating a junk customer
-- until the email is verified. Only the service role (supabaseAdmin) can read/write it.
create table if not exists pos_customer_auth (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references pos_customers(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  pin_hash text,
  pin_set_at timestamptz,
  email_verified boolean not null default false,
  failed_pin_attempts int not null default 0,
  locked_until timestamptz,
  invite_token text,
  invite_sent_at timestamptz,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts int not null default 0,
  verified_until timestamptz,
  session_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_customer_auth_business_email on pos_customer_auth (business_id, lower(email));
create index if not exists pos_customer_auth_session on pos_customer_auth (session_token) where session_token is not null;
create unique index if not exists pos_customer_auth_invite on pos_customer_auth (invite_token) where invite_token is not null;
create index if not exists pos_customer_auth_customer on pos_customer_auth (customer_id);

-- RLS on, zero policies → anon/owner clients get nothing; only the service role reaches pin_hash.
alter table pos_customer_auth enable row level security;
