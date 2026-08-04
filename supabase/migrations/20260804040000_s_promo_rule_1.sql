-- S-PROMO-RULE-1 — conditional promotions (weather trigger).
--
-- Almost all of this already existed: pos_promotions has 43 columns covering time-of-day windows,
-- day-of-week, per-member and per-day caps, member gating, scope, stacking and lifetime caps, and
-- discount-engine.ts already enforces every one of them. This sprint adds the TRIGGER and nothing
-- else — two columns.
--
-- trigger_type IS NULL means unconditional, so all existing promotions keep working untouched.
-- trigger_config for weather: {"celsius": 10, "location": "melbourne_airport"}
--
-- Only weather ships now. Stock and velocity triggers are later values in the same CHECK — the
-- column is shaped for them, this sprint does not build them.

alter table pos_promotions
  add column if not exists trigger_type text,
  add column if not exists trigger_config jsonb not null default '{}'::jsonb;

-- Guarded so re-running is safe (ADD CONSTRAINT has no IF NOT EXISTS).
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid='public.pos_promotions'::regclass
                   and conname='pos_promotions_trigger_type_check') then
    alter table pos_promotions
      add constraint pos_promotions_trigger_type_check
      check (trigger_type is null or trigger_type in ('weather_max_temp_below','weather_max_temp_above'));
  end if;
end $$;

comment on column pos_promotions.trigger_type is
  'S-PROMO-RULE-1. NULL = unconditional. Weather triggers read aria_signal_cache signal_type=weather_daily and FAIL CLOSED when the signal is missing or expired.';

-- ── STEP 0 GATE RESULT (both unknowns resolved before any code was written) ─────────────────────
-- 1. THE EVALUATOR IS LIVE, not inert. Full chain verified:
--      components/pos/DiscountBar.tsx:52  -> POST /api/pos/promotions/applicable
--      applicable/route.ts                -> calculateApplicableDiscounts()
--      lib/pos/discount-engine.ts:85-121  -> enforces starts_at/ends_at, active_days,
--                                            active_hour_start/end, max_total_uses,
--                                            max_uses_per_customer, max_uses_per_day
--      terminal/page.tsx:1537             -> captures appliedDiscounts at checkout
--      api/pos/sale/route.ts:154          -> passes them to createSale
--      lib/pos/create-sale.ts:257-265     -> INSERTs pos_promotion_redemptions
--    The 0-redemptions-ever figure is a DATA story, not a code story: exactly one promotion
--    exists ("10% Off Iced Coffee", created 2026-06-24) and this business has had no sales at all
--    since 2026-07-17. Honest limit: the redemption insert is verified by code path, never yet
--    observed firing in production.
-- 2. A WEATHER FETCHER ALREADY EXISTS — Open-Meteo, no API key, in six places. Crucially
--    api/cron/generate-briefings/route.ts:62 already requests daily temperature_2m_max on the
--    existing daily cron, which is exactly the signal this sprint needs. No new integration, no
--    new route, no new Vercel function.
