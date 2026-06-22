-- LOY-WHATSAPP — WhatsApp loyalty channel. Additive: per-member opt-in, an owner enable flag, and an
-- audit log. Actual sending is gated behind a provider env flag (no Twilio); when unconfigured nothing
-- is sent externally. Opt-out reuses the existing sms_suppression list by phone.
alter table pos_customers add column if not exists whatsapp_consent boolean not null default false;
alter table pos_customers add column if not exists whatsapp_opt_in_at timestamptz;
alter table pos_loyalty_config add column if not exists whatsapp_enabled boolean not null default false;

create table if not exists loyalty_whatsapp_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  customer_id uuid,
  to_number text not null,
  template text not null,            -- 'enrol' | 'balance' | 'offer' | 'birthday' | 'winback' | …
  status text not null,              -- 'sent' | 'skipped' | 'failed'
  error text,
  created_at timestamptz not null default now()
);
alter table loyalty_whatsapp_log enable row level security;
create index if not exists idx_wa_log_biz on loyalty_whatsapp_log (business_id, created_at);
