-- council_cache: 30-min synthesis cache for runAriaCouncil
-- Cache key: business_id + intent_hash (8-char hash of normalised question)
-- TTL enforced in application layer; cleanup via expires_at

create table if not exists council_cache (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  intent_hash  text not null,
  result       jsonb not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

create unique index if not exists idx_council_cache_bid_hash
  on council_cache (business_id, intent_hash);

-- Partial index to quickly find non-expired entries
create index if not exists idx_council_cache_expires
  on council_cache (expires_at);

-- RLS: only service role accesses this table (server-side only)
alter table council_cache enable row level security;