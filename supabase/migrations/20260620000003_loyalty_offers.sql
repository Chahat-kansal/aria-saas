-- LOY-OFFERS — owner-posted loyalty offers shown on customers' loyalty dashboards.
-- Audit verdict: NEITHER pos_promotions (a checkout discount/coupon engine) nor aria_promotions
-- (AI SMS campaign suggestions) nor loyalty_reward_rules (behavior point-triggers) models a
-- customer-browsable loyalty offer card — so this is a NEW, distinct concept, not a third copy.
-- RLS enabled with no policies → only the service role (supabaseAdmin) reads/writes it; scoping is
-- enforced in the routes (owner via getBid, customer via getLoyaltyCustomer), like the rest of the
-- loyalty system.
create table if not exists loyalty_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  offer_type text not null default 'info',   -- 'info' | 'points_reward' | 'bonus'
  point_cost int,                            -- nullable; for points-redeemable offers
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists loyalty_offers_business_active on loyalty_offers (business_id, active);
alter table loyalty_offers enable row level security;
