-- API-RESILIENCE-1 — provider incident log + circuit-breaker state.
-- An unresolved row (resolved_at IS NULL) started within the last 2 minutes means the Anthropic
-- circuit is OPEN, and Aria is serving answers from a backup provider. fallback_provider_used records
-- which provider (gemini/openai/haiku) actually answered while the primary was down.
create table if not exists public.aria_provider_incidents (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  fallback_provider_used text,
  trigger_error text,
  created_at timestamptz not null default now()
);

-- Fast lookup for "currently open" incidents (resolved_at IS NULL, recent started_at).
create index if not exists idx_provider_incidents_open
  on public.aria_provider_incidents (provider, resolved_at, started_at desc);

-- RLS deny-all: only the service role (supabaseAdmin) bypasses RLS; no anon/authenticated policies.
alter table public.aria_provider_incidents enable row level security;

comment on table public.aria_provider_incidents is 'API-RESILIENCE-1: records each time the Anthropic circuit opens (provider down) and which fallback provider served Aria. resolved_at set when the provider recovers.';
