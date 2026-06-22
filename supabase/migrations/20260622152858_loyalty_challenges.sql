-- LOY-CHALLENGES — AI-personalised loyalty missions grounded in REAL purchase history.
-- Additive: a new table + two config columns. Nothing existing is altered or removed.

create table if not exists loyalty_challenges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  loyalty_identity_id uuid,
  title text not null,
  description text,
  target_metric text not null check (target_metric in ('item_count','visit_count','spend')),
  target_item text,                       -- the REAL product name (item_count only); validated by code before insert
  target_count integer not null default 1,
  progress integer not null default 0,    -- recomputed from real pos_sale_items, never client-set
  reward_points integer not null default 50,
  status text not null default 'active' check (status in ('active','completed','expired','claimed')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_challenges_customer_status on loyalty_challenges (customer_id, status);
create index if not exists loyalty_challenges_business on loyalty_challenges (business_id);

-- Service-role only (mirrors the rest of the loyalty surface). Customer reads go through the
-- identity-scoped API, never directly; progress is mutated only by the server-side sale path.
alter table loyalty_challenges enable row level security;

-- Owner config: opt-in + reward size. Defaults keep challenges OFF until the owner enables them.
alter table pos_loyalty_config add column if not exists challenges_enabled boolean default false;
alter table pos_loyalty_config add column if not exists challenge_reward_points integer default 50;
