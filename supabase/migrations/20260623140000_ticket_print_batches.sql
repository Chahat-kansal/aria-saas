-- TICKETS-FIX+BATCH-1 — scan-to-batch print queue. NOT pos_product_batches (that's expiry/PO-receipt). A
-- ticket_print_batch is a set of products a staffer scanned in the inventory app to print shelf/price tickets
-- for. Each item snapshots the price (and any active promo) AT SCAN TIME so a later price change never silently
-- alters a queued batch. RLS on (deny-by-default; all access is service-role + business-scoped in the routes).

create table if not exists ticket_print_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  outlet_id uuid,
  name text not null,
  status text not null default 'open' check (status in ('open', 'queued', 'printed')),
  created_by_staff_id uuid,
  template_id uuid references pos_shelf_ticket_templates(id) on delete set null,
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  printed_at timestamptz
);
create index if not exists idx_ticket_batches_lookup on ticket_print_batches(business_id, status, created_at desc);
alter table ticket_print_batches enable row level security;

create table if not exists ticket_print_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references ticket_print_batches(id) on delete cascade,
  business_id uuid not null,
  product_id uuid not null,
  qty integer not null default 1,
  price_snapshot numeric not null,
  was_price_snapshot numeric,
  promo_label text,
  added_at timestamptz not null default now()
);
create index if not exists idx_ticket_batch_items_batch on ticket_print_batch_items(batch_id);
alter table ticket_print_batch_items enable row level security;
