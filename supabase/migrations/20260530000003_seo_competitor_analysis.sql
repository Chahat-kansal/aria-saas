create table if not exists seo_competitor_analysis (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  competitor_url text not null,
  analysis jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists seo_competitor_analysis_business_idx on seo_competitor_analysis(business_id, created_at desc);

alter table seo_competitor_analysis enable row level security;

create policy "Users own competitor analyses" on seo_competitor_analysis
  for all using (
    business_id in (select id from businesses where user_id = auth.uid())
  );