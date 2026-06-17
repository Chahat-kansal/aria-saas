-- SEC-H1: serverless-safe rate limiting via an atomic Supabase counter (Upstash isn't configured;
-- in-memory limiters don't persist across Vercel invocations/regions). rate_limit_hit() buckets by a
-- fixed time window and atomically increments in a single INSERT…ON CONFLICT…RETURNING (no race /
-- double-count under concurrent hits). Opportunistic TTL purge (~1% of calls) keeps the table tiny
-- without a cron.

create table if not exists public.rate_limits (
  bucket_key text primary key,
  count int not null default 0,
  expires_at timestamptz not null
);
create index if not exists idx_rate_limits_expires on public.rate_limits(expires_at);
alter table public.rate_limits enable row level security; -- service-role only (limiter uses supabaseAdmin)

create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_sec int)
returns table(allowed boolean, current_count int, retry_after int)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_bucket bigint := floor(extract(epoch from now()) / p_window_sec);
  v_bucket_key text := p_key || ':' || v_bucket::text;
  v_expires timestamptz := to_timestamp((v_bucket + 1) * p_window_sec);
  v_count int;
begin
  insert into rate_limits (bucket_key, count, expires_at)
  values (v_bucket_key, 1, v_expires)
  on conflict (bucket_key) do update set count = rate_limits.count + 1
  returning count into v_count;

  -- bounded opportunistic cleanup of expired buckets (no cron needed)
  if random() < 0.01 then
    delete from rate_limits where expires_at < now();
  end if;

  return query select (v_count <= p_limit), v_count,
    greatest(0, ceil(extract(epoch from (v_expires - now())))::int);
end;
$function$;

grant execute on function public.rate_limit_hit(text, int, int) to authenticated, anon, service_role;
