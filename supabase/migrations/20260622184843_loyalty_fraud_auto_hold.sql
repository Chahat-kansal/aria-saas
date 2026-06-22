-- LOY-FRAUD — optional owner-enabled auto-hold flag (default OFF). Detection NEVER silently blocks;
-- this only annotates flags as auto_held for the owner-review surface when explicitly enabled.
alter table pos_loyalty_config add column if not exists fraud_auto_hold boolean not null default false;
-- Helps the de-dupe lookup (don't re-create an unresolved flag of the same type for the same member).
create index if not exists idx_fraud_flags_lookup on loyalty_fraud_flags (business_id, customer_id, flag_type, resolved);
