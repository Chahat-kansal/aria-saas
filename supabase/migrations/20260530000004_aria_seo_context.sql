create table if not exists aria_seo_context (
  business_id uuid primary key references businesses(id) on delete cascade,
  health_score integer not null default 0,
  critical_issues jsonb not null default '[]',
  top_keyword text,
  top_keyword_rank integer,
  updated_at timestamptz not null default now()
);

alter table aria_seo_context enable row level security;

create policy "Users own seo context" on aria_seo_context
  for all using (
    business_id in (select id from businesses where user_id = auth.uid())
  );