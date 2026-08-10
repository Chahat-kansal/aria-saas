-- ARIA-DISPLAY-2B — let an owner choose what the customer display shows behind the order.
--
-- 'classic'  = today's canvas backdrop. THE DEFAULT, so no existing screen changes behaviour
--              because we shipped a sprint.
-- 'journey'  = DISPLAY-1's journey player as the backdrop. Opt-in until it has been watched in a
--              real venue.
--
-- This is a BACKGROUND choice only. The order mirror, SaleCelebration, AdRotator and the Aria
-- greeting are identical in both modes — journey changes what is behind them, not what they do.
--
-- ── PRE-MIGRATION DUMP (RULE 10 / DB-touching sprint rules) ─────────────────────────────────────
-- pos_settings, read live 2026-08-10 before this file was written:
--   54 columns. Relevant shape:
--     id                       uuid    NOT NULL  default gen_random_uuid()
--     business_id              uuid    NULL      (nullable — see the UNIQUE note below)
--     timezone                 text    NULL      default 'Australia/Melbourne'
--     accepted_payment_methods jsonb   NULL      default '["cash","card","gift_card"]'
--     receipt_template         jsonb   NULL      default null
--   The only two jsonb columns are accepted_payment_methods and receipt_template. NEITHER is a
--   general-purpose settings blob, so there is nowhere to tuck this without a new column — the
--   brief's "prefer an existing settings blob" preference does not apply here.
--
--   CONSTRAINTS (pg_constraint, all of them):
--     pos_settings_pkey             PRIMARY KEY (id)
--     pos_settings_business_id_key  UNIQUE (business_id)
--     pos_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
--   ZERO CHECK constraints exist on this table today. The one below is its first — worth knowing,
--   because it means nothing else on pos_settings is value-validated at the database level and a
--   future reader should not infer a convention from this file alone.
--
-- ── WHY NOT NULL + DEFAULT RATHER THAN NULLABLE ────────────────────────────────────────────────
-- A nullable mode would make every reader write `?? 'classic'` and one of them would eventually
-- forget. NOT NULL DEFAULT 'classic' backfills every existing row in the same statement, so there
-- is no window where a display sees null and no backfill script to remember to run.

alter table public.pos_settings
  add column if not exists display_mode text not null default 'classic';

alter table public.pos_settings
  drop constraint if exists pos_settings_display_mode_check;

alter table public.pos_settings
  add constraint pos_settings_display_mode_check
  check (display_mode in ('classic', 'journey'));

comment on column public.pos_settings.display_mode is
  'Customer display backdrop: classic (canvas, default) | journey (DISPLAY-1 journey player). Background only — the order mirror, celebration, ad rotator and greeting are identical in both. Must also appear in SETTINGS_FIELDS in api/pos/settings/route.ts or writes silently no-op.';
