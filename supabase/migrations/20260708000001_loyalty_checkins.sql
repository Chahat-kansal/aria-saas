-- loyalty_checkins: customer scans counter QR → row appears in POS "Here now" list
-- Rate-limit enforced in application: 1 active (unconsumed + unexpired) check-in per identity
create table if not exists public.loyalty_checkins (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references businesses(id) on delete cascade,
  outlet_id           uuid references pos_outlets(id) on delete set null,
  loyalty_identity_id uuid not null references loyalty_identity(id) on delete cascade,
  customer_id         uuid references pos_customers(id) on delete set null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '15 minutes'),
  consumed_sale_id    uuid references pos_sales(id) on delete set null,
  consumed_at         timestamptz
);

-- POS polling: active check-ins per outlet (unexpired, unconsumed)
create index if not exists idx_loyalty_checkins_outlet_active
  on public.loyalty_checkins (business_id, outlet_id, expires_at)
  where consumed_at is null;

-- Rate-limit lookup: active check-ins per identity
create index if not exists idx_loyalty_checkins_identity
  on public.loyalty_checkins (loyalty_identity_id, created_at desc)
  where consumed_at is null;

alter table public.loyalty_checkins enable row level security;

-- All access via supabaseAdmin (service-role bypasses RLS)
create policy "service_role_all" on public.loyalty_checkins
  for all
  to service_role
  using (true)
  with check (true);