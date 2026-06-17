-- MSG-COMPLIANCE-EMAIL: Spam Act guardrails at the email (Resend) chokepoint — mirrors the SMS
-- tables (sms_suppression / sms_send_log). Both hold PII (addresses, subjects) and are written only
-- by the service role from sendEmail, so RLS is enabled with no policies (deny-all; service bypasses).

create table if not exists public.email_suppression (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  email text not null,
  reason text not null default 'manual' check (reason in ('unsubscribe','manual','bounce','complaint')),
  created_at timestamptz not null default now(),
  unique (business_id, email)
);
create index if not exists idx_email_suppression_lookup on public.email_suppression(business_id, email);

create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  to_email text not null,
  subject text,
  category text not null default 'transactional' check (category in ('marketing','transactional')),
  consent_ok boolean,
  suppressed boolean not null default false,
  resend_id text,
  status text not null check (status in ('sent','failed','skipped')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_email_send_log_biz_created on public.email_send_log(business_id, created_at desc);

alter table public.email_suppression enable row level security;
alter table public.email_send_log enable row level security;
