alter table pos_shelf_ticket_templates
  add column if not exists band_color text default '#374151',
  add column if not exists band_text_color text default '#ffffff',
  add column if not exists band_label text default 'PRICE',
  add column if not exists price_color text default '#111827',
  add column if not exists show_was_price boolean default false,
  add column if not exists show_save_badge boolean default false,
  add column if not exists show_member_price boolean default false,
  add column if not exists show_per_unit boolean default false,
  add column if not exists show_multibuy boolean default false,
  add column if not exists show_valid_date boolean default false,
  add column if not exists show_promo_band boolean default true,
  add column if not exists ticket_type text default 'standard'
    check (ticket_type in ('standard','special','member','multibuy','clearance','premium')),
  add column if not exists paper_type text default 'label'
    check (paper_type in ('label','card','thermal','poster')),
  add column if not exists corner_radius int default 0,
  add column if not exists canvas_elements jsonb default '[]'::jsonb,
  add column if not exists updated_at timestamptz default now();

alter table pos_shelf_ticket_templates enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'pos_shelf_ticket_templates' and policyname = 'owner_all'
  ) then
    execute 'create policy owner_all on pos_shelf_ticket_templates for all using (
      business_id in (select id from businesses where user_id = auth.uid())
    )';
  end if;
end $$;
