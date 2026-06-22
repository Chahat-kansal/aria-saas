-- LOY-TIER-PERKS — per-tier benefits beyond pricing. Tiers are derived from pos_loyalty_config
-- tier_silver/gold/platinum_points vs a member's real points_balance (loyalty_tiers is dead, not used).
create table if not exists loyalty_tier_perks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  tier text not null check (tier in ('silver','gold','platinum')),
  perk_type text not null,           -- 'points_multiplier' | 'priority' (extensible)
  perk_value numeric,                -- e.g. 2 = earn x2
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, tier, perk_type)
);
create index if not exists idx_tier_perks_biz on loyalty_tier_perks (business_id, tier);
alter table loyalty_tier_perks enable row level security;

-- Idempotency for sale-based perks (the points multiplier): one grant per perk per sale.
create table if not exists loyalty_tier_perk_grants (
  id uuid primary key default gen_random_uuid(),
  perk_id uuid not null references loyalty_tier_perks(id) on delete cascade,
  business_id uuid not null,
  customer_id uuid not null,
  sale_id uuid not null,
  points_awarded integer not null default 0,
  granted_at timestamptz not null default now(),
  unique (perk_id, sale_id)
);
alter table loyalty_tier_perk_grants enable row level security;
