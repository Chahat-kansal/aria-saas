-- LOY-LIFECYCLE — wire the existing birthday/winback config into real automation. Additive: reward
-- POINTS amounts, ENABLE flags, and a sent-marker log table guaranteeing idempotency. Existing text
-- fields (birthday_reward_text / winback_reward_text / winback_after_days) are reused unchanged.
alter table pos_loyalty_config add column if not exists birthday_reward_points integer not null default 0;
alter table pos_loyalty_config add column if not exists winback_reward_points  integer not null default 0;
alter table pos_loyalty_config add column if not exists birthday_enabled boolean not null default false;
alter table pos_loyalty_config add column if not exists winback_enabled  boolean not null default false;

-- Preserve any pre-existing usage (a configured reward text means it was already running).
update pos_loyalty_config set birthday_enabled = true
  where birthday_reward_text is not null and program_type <> 'off';
update pos_loyalty_config set winback_enabled = true
  where winback_reward_text is not null and program_type <> 'off' and coalesce(winback_after_days,0) > 0;

-- Sent-marker log = idempotency. Birthday: one row per (customer, year). Winback: one per (customer,
-- day) + an application-level cooldown so a lapsed member isn't messaged daily.
create table if not exists loyalty_lifecycle_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  kind text not null check (kind in ('birthday','winback')),
  period_key text not null,                 -- birthday: 'YYYY'; winback: 'YYYY-MM-DD'
  reward_points integer not null default 0,
  channel text,                             -- 'sms' | 'email' | 'none'
  message_status text,                      -- 'sent' | 'failed' | 'no_channel'
  sent_at timestamptz not null default now()
);
-- The hard idempotency guard: a kind can fire at most once per period per customer.
create unique index if not exists loyalty_lifecycle_once on loyalty_lifecycle_log (customer_id, kind, period_key);
create index if not exists idx_loyalty_lifecycle_lookup on loyalty_lifecycle_log (business_id, customer_id, kind, sent_at);

alter table loyalty_lifecycle_log enable row level security;
