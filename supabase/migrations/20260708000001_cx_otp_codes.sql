-- CX-AUTH-1a: OTP codes for phone-based CX customer authentication.
-- Business-scoped: one code per (phone, business_id). Cleaned up async.
-- RLS admin-only: no policies → anon/authenticated see nothing; service_role bypasses.

create table if not exists cx_otp_codes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone       text not null,
  code_hash   text not null,            -- sha256 of the 6-digit code
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists cx_otp_codes_lookup on cx_otp_codes (phone, business_id);

alter table cx_otp_codes enable row level security;
-- No policies → only service_role (supabaseAdmin) can read/write.