-- Allow anon (unauthenticated) clients to SELECT from pos_online_orders.
-- Required so Supabase Realtime postgres_changes delivers UPDATE events to the
-- public order-tracker page, which subscribes with the browser anon client.
-- Supabase Realtime evaluates RLS before delivering events — without this policy
-- the anon subscriber is SUBSCRIBED but receives no payloads.
CREATE POLICY "tracker_public_read" ON pos_online_orders
  FOR SELECT
  TO anon
  USING (true);