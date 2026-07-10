-- LOYALTY-LOOP-2: card-linked auto-earn. The payment card becomes the
-- loyalty key. Zero PCI burden — stores ONLY Stripe's card fingerprint
-- (payment_method.card.fingerprint), never a PAN or any raw card data.
-- RLS admin-only: no policies → only service_role (supabaseAdmin) can
-- read/write. The fingerprint must never reach the client.

create table if not exists loyalty_card_links (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references businesses(id) on delete cascade,
  loyalty_identity_id  uuid not null references loyalty_identity(id) on delete cascade,
  card_fingerprint     text not null,
  brand                text,
  last4                text,
  created_at           timestamptz not null default now(),
  unique (business_id, card_fingerprint)
);

create index if not exists loyalty_card_links_identity on loyalty_card_links (loyalty_identity_id, business_id);

alter table loyalty_card_links enable row level security;
-- No policies → only service_role (supabaseAdmin) can read/write.
