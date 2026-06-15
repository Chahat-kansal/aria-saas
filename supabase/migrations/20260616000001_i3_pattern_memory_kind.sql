-- I3 PATTERN-MEMORY Part 0 — add 'pattern' to the aria_business_memory.kind CHECK so the
-- pattern-detector cron can write durable, SQL-detected data patterns (kind='pattern',
-- source_type='signal'). Additive only — all existing kinds preserved.
alter table public.aria_business_memory drop constraint if exists aria_business_memory_kind_check;
alter table public.aria_business_memory add constraint aria_business_memory_kind_check
  check (kind = any (array['preference', 'fact', 'tried', 'decision', 'concern', 'goal', 'pattern']));
