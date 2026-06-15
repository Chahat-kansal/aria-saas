-- SS — feature_flags → plan mapping (config on existing rows; applied live 2026-06-15).
-- Reconciliation: businesses.plan is canonical; these arrays drive plan-based entitlement
-- via hasFeature/requireFeature. Idempotent.
update public.feature_flags set enabled_for_plans = '{starter,growth,pro}'::text[] where flag_key = 'pos_terminal';
update public.feature_flags set enabled_for_plans = '{growth,pro}'::text[]        where flag_key in ('social_media','winback_sms','weekly_orders','mobile_scanner','ai_receipt');
update public.feature_flags set enabled_for_plans = '{pro}'::text[]               where flag_key in ('warehouse','competitor_analysis','advanced_reports','custom_features');
-- advanced_reports was is_globally_enabled=true (short-circuited the plan gate) — clear it so Pro-gating applies.
update public.feature_flags set is_globally_enabled = false where flag_key = 'advanced_reports';
