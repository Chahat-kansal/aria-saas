-- OWNER-APP PH-4 — push notifications ("buzz the phone").
--
-- REUSE NOTE: web-push@^3.6.7 and a working VAPID sender already exist
-- (src/lib/community/push.ts — configure/send/404-410-prune, no-op when VAPID env is unset). That
-- implementation is CUSTOMER-scoped (community_push_subscriptions keyed by member_id, for café
-- followers). PH-4 is OWNER-scoped (an authenticated auth.users owner of a business), which is a
-- different subject with different RLS — hence new tables rather than overloading the customer
-- table with a nullable owner column. The TRANSPORT (webpush.sendNotification + stale-subscription
-- pruning) is reused via src/lib/push/notifyOwner.ts, not rewritten.

-- ── push_subscriptions — one row per owner DEVICE (an owner may install the PWA on several) ──
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null,
  endpoint text not null,
  -- keys jsonb {p256dh, auth} — jsonb (not the community table's flat columns) because that is the
  -- exact shape the Web Push API's PushSubscription.toJSON() hands the client, so the browser's
  -- payload is stored verbatim with no lossy destructuring.
  keys jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled boolean not null default false,
  constraint push_subscriptions_endpoint_key unique (endpoint)
);
create index if not exists idx_push_subscriptions_owner on push_subscriptions (business_id, user_id) where disabled = false;

-- ── owner_notifications — the dedupe ledger AND history ──
--
-- ★ THE ATTENTION-LAW ENFORCER ★
-- unique (subject_type, subject_id, reason) is the single most important line in this sprint. The
-- locked definition's hard rule is ONE interruption per DECISION, never one per EVENT. Enforcing
-- that only in application code would mean a race (two agents proposing concurrently), a retry, or
-- a future call site could double-buzz an owner. Over-notification is the documented #1 failure of
-- this product category — owners mute the app within a week and the surface goes dark. So the
-- constraint lives in the DATABASE: the send path INSERTs first and only delivers if the insert
-- actually created a row. A second attempt for the same subject+reason conflicts and is dropped by
-- Postgres itself, not by a code branch someone can later forget.
create table if not exists owner_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid,
  subject_type text not null check (subject_type in ('decision', 'job')),
  subject_id uuid not null,
  reason text not null check (reason in ('decision_waiting', 'job_needs_input', 'job_failed', 'job_done')),
  title text not null,
  body text not null,
  sent_at timestamptz not null default now(),
  delivered boolean not null default false,
  read_at timestamptz,
  constraint owner_notifications_dedupe_key unique (subject_type, subject_id, reason)
);
create index if not exists idx_owner_notifications_business_sent on owner_notifications (business_id, sent_at desc);

-- RLS — owner-scoped read on both; writes are server-only (service_role bypasses RLS, and no
-- insert/update policy is granted to authenticated, so a browser can never forge a notification
-- record or another owner's subscription). Matches the PH-1/PH-2 owner-app pattern
-- (business_id in (select id from businesses where user_id = auth.uid())).
alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_owner_read on push_subscriptions;
create policy push_subscriptions_owner_read on push_subscriptions for select
  using (business_id in (select id from businesses where user_id = auth.uid()));

alter table owner_notifications enable row level security;
drop policy if exists owner_notifications_owner_read on owner_notifications;
create policy owner_notifications_owner_read on owner_notifications for select
  using (business_id in (select id from businesses where user_id = auth.uid()));
