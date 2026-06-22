-- LOY-REFERRALS — wire the existing loyalty_referrals scaffold. Additive: a lifecycle status, a
-- reward timestamp, a one-referral-per-referee guard, a referrer lookup index, and an owner opt-in flag.
alter table loyalty_referrals add column if not exists status text not null default 'pending';
alter table loyalty_referrals add column if not exists rewarded_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='loyalty_referrals_status_chk') then
    alter table loyalty_referrals add constraint loyalty_referrals_status_chk
      check (status in ('pending','rewarded','cancelled'));
  end if;
end $$;

-- A referee can be referred at most once (the core anti-double-referral guard).
create unique index if not exists loyalty_referrals_referred_once
  on loyalty_referrals (referred_customer_id) where referred_customer_id is not null;
create index if not exists idx_loyalty_ref_referrer on loyalty_referrals (referrer_customer_id);

-- Owner opt-in (bonuses already exist: referral_bonus_points / referee_bonus_points).
alter table pos_loyalty_config add column if not exists referrals_enabled boolean default false;
