-- LOY-REWARD-RULES — wire the existing loyalty_reward_rules scaffold. Additive: a trigger threshold,
-- a per-rule config blob, and an awards-dedupe table whose UNIQUE(rule_id, sale_id) makes each rule
-- award at most once per qualifying sale.
alter table loyalty_reward_rules add column if not exists threshold_value numeric;
alter table loyalty_reward_rules add column if not exists config jsonb not null default '{}'::jsonb;

create table if not exists loyalty_rule_awards (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references loyalty_reward_rules(id) on delete cascade,
  business_id uuid not null,
  customer_id uuid not null,
  sale_id uuid not null,
  points_awarded integer not null default 0,
  awarded_at timestamptz not null default now(),
  unique (rule_id, sale_id)   -- idempotency: one award per rule per sale
);
create index if not exists idx_loyalty_rule_awards_cust on loyalty_rule_awards (business_id, customer_id);
alter table loyalty_rule_awards enable row level security;
