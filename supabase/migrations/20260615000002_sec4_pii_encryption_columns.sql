-- SEC-4 Part 2a — additive encrypted PII columns on pos_customers.
-- App-layer AES-256-GCM ciphertext ("iv:tag:ciphertext" hex) stored as text.
-- Plaintext columns are RETAINED during the staged migration (chosen scope:
-- dual-write foundation; null-out of plaintext is a follow-up after all reads migrate).
-- Applied live 2026-06-15 via Supabase; 39 existing rows backfilled by
-- scripts/sec4-backfill-pii.ts (app-layer encrypt, per-business key).
alter table public.pos_customers
  add column if not exists email_enc text,
  add column if not exists phone_enc text,
  add column if not exists name_enc  text,
  add column if not exists notes_enc text;

comment on column public.pos_customers.email_enc is 'SEC-4 AES-256-GCM ciphertext of email (per-business key from ARIA_MASTER_ENCRYPTION_KEY). Plaintext email retained during staged migration.';
comment on column public.pos_customers.phone_enc is 'SEC-4 AES-256-GCM ciphertext of phone. Plaintext retained during staged migration.';
comment on column public.pos_customers.name_enc  is 'SEC-4 AES-256-GCM ciphertext of name. Plaintext retained during staged migration.';
comment on column public.pos_customers.notes_enc is 'SEC-4 AES-256-GCM ciphertext of notes. Plaintext retained during staged migration.';

-- Part 1 — register the active key version (extend existing scaffolding, do not recreate).
insert into public.encryption_key_versions (id, version, activated_at, notes)
values (
  gen_random_uuid(), 2, now(),
  'SEC-4: pos_customers PII (email, phone, name, notes) encrypted app-layer AES-256-GCM, per-business key derived from ARIA_MASTER_ENCRYPTION_KEY env. Ciphertext in *_enc text columns. Plaintext retained (staged migration; null-out is a follow-up).'
);
