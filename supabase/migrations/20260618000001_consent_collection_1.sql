-- CONSENT-COLLECTION-1: per-channel express consent + provenance on pos_customers (the
-- marketing-canonical customer table — all SMS/email senders + MSG-COMPLIANCE-1 read it).
-- Collection + safe migration only; no send-side enforcement here.

alter table public.pos_customers
  add column if not exists sms_consent boolean default false,
  add column if not exists email_consent boolean default false,
  add column if not exists consent_captured_at timestamptz,
  add column if not exists consent_source text;  -- pos_add | dashboard_add | import | online | staff_update | legacy_unverified

-- SAFE BACKFILL of the existing marketing_consent=true rows (the legal trap): they were set true
-- WITHOUT a provable express opt-in record. Mark them legacy_unverified, leave the per-channel flags
-- false (NOT migrated to true) and captured_at null — so they are NOT marketing-eligible until the
-- owner re-confirms. As an extra safety backstop (per CONSENT-COLLECTION-1 directive), also flip the
-- legacy marketing_consent flag to false so they are suppressed under TODAY's enforcement too (which
-- reads marketing_consent). Owner re-confirmation later flips marketing_consent AND the per-channel
-- flags back on together.
update public.pos_customers
set consent_source = 'legacy_unverified',
    consent_captured_at = null,
    sms_consent = false,
    email_consent = false,
    marketing_consent = false
where marketing_consent = true
  and consent_source is null;
