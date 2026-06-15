-- STAFF-MSG-FIX — staff REPLY + MARK-READ RLS policies (applied live 2026-06-15).
-- Prior policies were owner-only (staff_messages_owner ALL) + recipient SELECT, so a staff
-- member could not insert a reply or update read_at under RLS. These are additive — the
-- existing read policies are untouched. (The portal routes also write via the service role
-- with server-side scoping, so they work regardless; these policies make user-client writes
-- correct too.)

create policy staff_messages_staff_send on public.staff_messages
  for insert to authenticated
  with check (
    sender_id in (select id from public.staff_members where user_id = auth.uid())
    and business_id in (select business_id from public.staff_members where user_id = auth.uid())
  );

create policy staff_messages_recipient_update on public.staff_messages
  for update to authenticated
  using (recipient_id in (select id from public.staff_members where user_id = auth.uid()))
  with check (recipient_id in (select id from public.staff_members where user_id = auth.uid()));
