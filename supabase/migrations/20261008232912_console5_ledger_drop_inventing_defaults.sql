alter table public.aria_ai_calls alter column model_provider drop default;
alter table public.aria_ai_calls alter column cost_usd_cents drop default;

comment on column public.aria_ai_calls.model_provider is
  'The provider that actually served this call, derived from the client used. NULL means not recorded. Rows before 2026-10-09 carry a defaulted ''anthropic'' regardless of the real provider and must not be trusted for provider analysis.';

comment on column public.aria_ai_calls.cost_usd_cents is
  'Cost in US cents where known. NULL means unknown — never 0, which is a claim that the call was free. Rows before 2026-10-09 default to 0 and understate real spend.';
