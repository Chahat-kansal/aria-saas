-- INV-STAFF-APP-2 — daily tasks + the owner-review spine. The locked principle: a count NEVER mutates
-- items_on_hand; a mismatch raises a review-queue row for the owner to decide. RLS on (service-role/
-- business-scoped via the API).

create table if not exists inventory_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  outlet_id uuid,
  assigned_staff_id uuid,
  task_type text not null check (task_type in ('count','receive','waste','expiring','cycle_count')),
  product_id uuid,
  title text not null,
  detail text,
  hypothesis text,
  priority integer not null default 0,
  status text not null default 'open' check (status in ('open','done','skipped')),
  generated_by text not null default 'aria' check (generated_by in ('aria','owner')),
  due_date date not null default (now() at time zone 'Australia/Sydney')::date,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_inv_tasks_lookup on inventory_tasks (business_id, outlet_id, status, due_date);
-- one auto task per (product, type, outlet, day) so generation is idempotent.
create unique index if not exists inv_tasks_dedupe on inventory_tasks (business_id, outlet_id, product_id, task_type, due_date) where product_id is not null;
alter table inventory_tasks enable row level security;

create table if not exists inventory_review_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  outlet_id uuid,
  flag_type text not null check (flag_type in ('count_variance','short_delivery','waste_spike','velocity_drop')),
  product_id uuid,
  expected_value numeric,
  actual_value numeric,
  variance numeric,
  evidence jsonb,
  raised_by_staff_id uuid,
  status text not null default 'open' check (status in ('open','accepted','investigating','resolved')),
  resolution text,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_inv_review_lookup on inventory_review_queue (business_id, status);
alter table inventory_review_queue enable row level security;
