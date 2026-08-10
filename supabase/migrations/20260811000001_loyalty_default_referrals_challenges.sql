-- ARIA-LOYALTY-FIX-2 §2 — referrals and challenges ON by default for NEW businesses.
--
-- THE PRINCIPLE (from ARIA-LOYALTY-FIX-1): on by default if it only REACTS to something the
-- customer did; off if it INITIATES contact or takes money.
--   referrals  — a customer chooses to share a link. No outbound messaging, no cost.   -> ON
--   challenges — in-app only, on a rewards screen the customer chose to open.          -> ON
--   birthday   — unsolicited message on a date we hold.                    UNCHANGED, off
--   winback    — messages people who have drifted away; highest complaint risk. UNCHANGED, off
--   preload    — takes money up front; stored value carries consumer-law duties. UNCHANGED, off
--
-- ── THE (a)/(b) DETERMINATION THE BRIEF REQUIRED — it is (a), and provably ─────────────────────
-- (b) would be: code falls back to a default when the row/column is absent, so changing the default
-- silently switches the feature on for every existing business. That is NOT what happens here.
-- Every read is falsy-coerced with NO fallback:
--   lib/loyalty/referrals.ts:102          if (!cfg?.referrals_enabled) return
--   api/loyalty/referral-link/route.ts:19 enabled: !!data?.referrals_enabled
--   api/loyalty/referrals/route.ts:51     enabled: !!cfg?.referrals_enabled
--   api/loyalty/challenges/route.ts:20    enabled: !!data?.challenges_enabled
-- There is no `?? true` anywhere in the codebase for either flag. An absent row or column reads as
-- FALSE. So the only default that exists is this column default, and ALTER COLUMN SET DEFAULT does
-- not rewrite existing rows — it applies to rows inserted afterwards.
--
-- ── WHY NO EXISTING BUSINESS CAN BE CAUGHT (queried live, 2026-08-11) ──────────────────────────
--   businesses: 5 · pos_loyalty_config rows: 5 · businesses with NO config row: 0
--   referrals_enabled true today: 0 · challenges_enabled true today: 0
-- Every existing business ALREADY HAS a config row, so every one keeps its stored false. The
-- subtle version of the trap — an existing business with no row yet, which would pick up the new
-- default on its first settings save — has a population of ZERO. If that count is ever non-zero
-- again, re-run this reasoning before adding another default.
--
-- Pre-change column state, read from information_schema:
--   referrals_enabled   boolean NULL     default false
--   challenges_enabled  boolean NOT NULL default false
-- (nullability differs between the two; left exactly as-is — this changes defaults only.)

alter table public.pos_loyalty_config alter column referrals_enabled  set default true;
alter table public.pos_loyalty_config alter column challenges_enabled set default true;

comment on column public.pos_loyalty_config.referrals_enabled is
  'ON by default for new businesses (ARIA-LOYALTY-FIX-2). Customer-initiated, no outbound messaging, no cost. Existing rows keep their stored value.';
comment on column public.pos_loyalty_config.challenges_enabled is
  'ON by default for new businesses (ARIA-LOYALTY-FIX-2). In-app only, shown on a rewards screen the customer opened. Existing rows keep their stored value.';

-- DELIBERATELY NOT CHANGED — each initiates contact or takes money, so each stays an explicit
-- owner decision rather than a default:
--   birthday_enabled, winback_enabled, preload_enabled  -> remain default false
