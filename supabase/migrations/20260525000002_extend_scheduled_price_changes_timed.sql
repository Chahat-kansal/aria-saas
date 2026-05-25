alter table pos_scheduled_price_changes
  add column if not exists ends_at timestamptz,
  add column if not exists original_price numeric(10,2),
  add column if not exists label text,
  add column if not exists print_ticket boolean default false,
  add column if not exists status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled'));

update pos_scheduled_price_changes
  set status = case when applied then 'completed' else 'scheduled' end
  where status = 'scheduled';

create index if not exists idx_pos_spc_status_effective
  on pos_scheduled_price_changes(status, effective_date);
create index if not exists idx_pos_spc_status_ends
  on pos_scheduled_price_changes(status, ends_at);

alter table pos_scheduled_price_changes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'pos_scheduled_price_changes' and policyname = 'owner_all'
  ) then
    execute 'create policy owner_all on pos_scheduled_price_changes for all using (
      business_id in (select id from businesses where user_id = auth.uid())
    )';
  end if;
end $$;
