-- MSG-COMPLIANCE-1: Spam Act guardrails at the sendSMS chokepoint.
-- Two tables behind the single SMS sender (@/lib/clicksend):
--   * sms_send_log   — every outbound attempt (sent / skipped / failed), the 5-year audit record.
--   * sms_suppression — the opt-out list (STOP / manual / bounce), checked before MARKETING sends.
-- Both hold PII (phone numbers, message bodies) and are written only by the service role
-- (supabaseAdmin) from the chokepoint, so RLS is enabled with no policies (deny-all to anon/auth;
-- service role bypasses RLS). A read path (compliance dashboard) can add policies later.

create table if not exists public.sms_send_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  to_number text not null,
  body text,
  category text not null default 'transactional' check (category in ('marketing','transactional')),
  consent_ok boolean,
  suppressed boolean not null default false,
  clicksend_message_id text,
  status text not null check (status in ('sent','failed','skipped')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sms_send_log_biz_created on public.sms_send_log(business_id, created_at desc);

create table if not exists public.sms_suppression (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  phone text not null,
  reason text not null default 'manual' check (reason in ('stop','manual','bounce')),
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);
create index if not exists idx_sms_suppression_lookup on public.sms_suppression(business_id, phone);

alter table public.sms_send_log enable row level security;
alter table public.sms_suppression enable row level security;
