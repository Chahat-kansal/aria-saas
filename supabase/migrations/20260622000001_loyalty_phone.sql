-- LOY-PHONE — sign in with EITHER email OR phone. Additive: email stays exactly as-is (only relaxed to
-- nullable so a phone-only identity can exist); a new phone column is added, unique when present.
alter table loyalty_identity alter column email drop not null;
alter table loyalty_identity add column if not exists phone text;
create unique index if not exists loyalty_identity_phone on loyalty_identity (phone) where phone is not null;
