-- COST-LEDGER-1 — unified cost ledger. Every dollar Aria spends, in one place.
--
-- cost_events is the metered (per-send/per-transaction) ledger for everything that ISN'T already
-- captured in aria_ai_calls (SMS, email, Stripe processing fees, infra, other). AI costs deliberately
-- stay in aria_ai_calls (it has a richer schema: tokens, cache, latency, model_provider) rather than
-- being migrated here — v_ai_costs (below) is the read-side union so callers get one query surface
-- for "all AI costs" without a data migration.
CREATE TABLE IF NOT EXISTS cost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('ai', 'sms', 'email', 'payment_fee', 'infra', 'other')),
  provider text NOT NULL,
  business_id uuid NULL REFERENCES businesses(id) ON DELETE SET NULL,
  reference_id text NULL,
  amount_usd_cents integer NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'unit',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_events_category_created ON cost_events (category, created_at);
CREATE INDEX IF NOT EXISTS idx_cost_events_business_created ON cost_events (business_id, created_at);
-- Backfill idempotency: a (provider, reference_id) pair should only ever be logged once (e.g. the
-- same Stripe balance_transaction id must never be double-counted between the webhook path and a
-- backfill script run). Partial index — reference_id is often NULL (e.g. most SMS/email sends don't
-- have a natural dedup key beyond the row itself), so this only constrains rows that DO have one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_events_provider_reference_dedup
  ON cost_events (provider, reference_id) WHERE reference_id IS NOT NULL;

-- v_ai_costs — read-only union of aria_ai_calls (the real, current AI cost ledger) with any
-- category='ai' rows that land in cost_events (e.g. a future AI-adjacent cost with no natural home
-- in aria_ai_calls's per-call schema). Common shape so admin/reporting code queries ONE thing.
CREATE OR REPLACE VIEW v_ai_costs AS
SELECT
  id,
  business_id,
  COALESCE(provider, 'anthropic') AS provider,
  agent_key AS reference_id,
  COALESCE(cost_usd_cents, 0) AS amount_usd_cents,
  1::numeric AS quantity,
  'call'::text AS unit,
  jsonb_build_object(
    'model_id', model_id, 'role', role, 'success', success,
    'input_tokens', input_tokens, 'output_tokens', output_tokens,
    'cache_write_tokens', cache_write_tokens, 'cache_read_tokens', cache_read_tokens,
    'latency_ms', latency_ms
  ) AS metadata,
  created_at,
  'aria_ai_calls'::text AS source
FROM aria_ai_calls
UNION ALL
SELECT
  id, business_id, provider, reference_id, amount_usd_cents, quantity, unit, metadata, created_at,
  'cost_events'::text AS source
FROM cost_events
WHERE category = 'ai';

-- cost_subscriptions — fixed/recurring costs. Founder-maintained by design (no provider-dashboard
-- scraping) via the admin CRUD UI. Anthropic top-ups are modeled here as prepaid credit purchases
-- (billing_cadence='one_time', category='ai', provider='anthropic') so the admin cost page can
-- reconcile purchased credit against metered v_ai_costs spend and show credits remaining.
CREATE TABLE IF NOT EXISTS cost_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  plan_name text NOT NULL,
  amount_usd_cents integer NOT NULL,
  billing_cadence text NOT NULL CHECK (billing_cadence IN ('monthly', 'yearly', 'one_time')),
  renewal_date date NULL,
  category text NOT NULL CHECK (category IN ('ai', 'sms', 'email', 'payment_fee', 'infra', 'other')),
  notes text NULL,
  active boolean NOT NULL DEFAULT true,
  renewal_alert_sent_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_subscriptions_active_renewal ON cost_subscriptions (active, renewal_date);

-- Seed rows — known fixed costs found in env/config during this sprint. amount_usd_cents / renewal_date
-- are best-effort placeholders (0 / NULL) where the real figure isn't knowable from code alone; the
-- founder corrects these via the admin CRUD UI, which is the entire point of "founder-maintained".
INSERT INTO cost_subscriptions (provider, plan_name, amount_usd_cents, billing_cadence, category, notes, active)
SELECT * FROM (VALUES
  ('Vercel', 'Pro', 0, 'monthly', 'infra', 'Hosting/build/function execution. Confirm plan tier + seat count and set the real amount.', true),
  ('Supabase', 'Pro', 0, 'monthly', 'infra', 'Postgres + auth + storage. Confirm plan tier and set the real amount.', true),
  ('ClickSend', 'Balance top-up', 0, 'one_time', 'sms', 'Pay-as-you-go SMS credit. Log each top-up as a new one_time row (or update amount_usd_cents to the last top-up) — this is a balance, not a subscription.', true),
  ('Resend', 'Free/Pro', 0, 'monthly', 'email', 'See RESEND_MONTHLY_QUOTA in src/lib/external-apis.ts for the send-volume ceiling this plan implies.', true),
  ('Domain registrar', 'ariaos.site + related domains', 0, 'yearly', 'infra', 'Confirm registrar + renewal date.', true),
  ('Apple', 'Apple Developer Program', 0, 'yearly', 'infra', 'Required for iOS distribution if/when shipped.', true),
  ('Google', 'Google Wallet API', 0, 'monthly', 'infra', 'Only if usage-billed beyond free tier — confirm.', true),
  ('Higgsfield', 'Plan', 0, 'monthly', 'other', 'AI media generation (image/video/3D) — confirm plan tier.', true),
  ('Anthropic', 'Prepaid credit', 0, 'one_time', 'ai', 'Prepaid credit purchase, NOT a subscription. Set amount_usd_cents to the actual top-up amount each time credit is purchased — the admin cost page reconciles this against metered v_ai_costs spend to estimate credits remaining.', true)
) AS seed(provider, plan_name, amount_usd_cents, billing_cadence, category, notes, active)
WHERE NOT EXISTS (SELECT 1 FROM cost_subscriptions WHERE cost_subscriptions.provider = seed.provider AND cost_subscriptions.plan_name = seed.plan_name);
