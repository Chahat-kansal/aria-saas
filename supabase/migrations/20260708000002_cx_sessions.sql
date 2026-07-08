-- CX-AUTH-1a: Session tokens for authenticated CX customers.
-- token_hash stores sha256(raw_token). Raw token goes in the httpOnly cookie.
-- RLS admin-only: no policies → only service_role can read/write.

create table if not exists cx_sessions (
  id                   uuid primary key default gen_random_uuid(),
  loyalty_identity_id  uuid not null references loyalty_identity(id) on delete cascade,
  business_id          uuid not null references businesses(id) on delete cascade,
  token_hash           text not null unique,
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  revoked_at           timestamptz
);

create index if not exists cx_sessions_token on cx_sessions (token_hash);
create index if not exists cx_sessions_identity on cx_sessions (loyalty_identity_id, business_id);

alter table cx_sessions enable row level security;
-- No policies → only service_role (supabaseAdmin) can read/write.