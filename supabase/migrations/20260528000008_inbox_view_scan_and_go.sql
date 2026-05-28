-- Add Scan-and-Go carts as a stream in the unified Customer Inbox feed.
CREATE OR REPLACE VIEW customer_interactions_v AS
  SELECT 'kiosk_chat'::text AS source, id, business_id, customer_id::text AS customer_identifier,
    COALESCE(messages->-1->>'content', messages->-1->>'text', LEFT(messages::text, 90)) AS preview,
    COALESCE(ended_at, started_at) AS created_at, false AS has_unread
  FROM instore_conversations
  UNION ALL
  SELECT 'marketplace_chat'::text, id, business_id, member_id::text,
    COALESCE(messages->-1->>'content', messages->-1->>'text', messages->-1->>'body', LEFT(messages::text, 90)),
    COALESCE(last_message_at, created_at), COALESCE(unread_for_owner, false)
  FROM marketplace_chats
  UNION ALL
  SELECT 'demand_signal'::text, id, business_id, NULL::text,
    COALESCE(product_asked, query_text, 'Customer demand signal'), created_at, false
  FROM instore_demand_signals
  UNION ALL
  SELECT 'community_report'::text, id, business_id, reported_by_session_token,
    'Reported message — ' || COALESCE(reason, 'flagged'), created_at, (status = 'pending')
  FROM community_message_reports
  UNION ALL
  SELECT 'blocked_visitor'::text, id, business_id, session_token,
    'Visitor blocked' || CASE WHEN reason IS NOT NULL THEN ' — ' || reason ELSE '' END, blocked_at, false
  FROM community_blocked_visitors
  UNION ALL
  SELECT 'kiosk_help_request'::text, id, business_id, NULL::text,
    COALESCE(title, description, 'Talk-to-staff request'), created_at, (status = 'pending')
  FROM aria_autopilot_actions
  WHERE category = 'kiosk_help_request'
  UNION ALL
  SELECT 'scan_and_go'::text, id, business_id, NULL::text,
    'Scan & Go cart (' || status || ') — ' || COALESCE(jsonb_array_length(items), 0) || ' items, $' || to_char(subtotal_cents/100.0, 'FM999990.00'),
    COALESCE(finished_at, created_at), false
  FROM pos_self_checkout_carts
  WHERE status IN ('finished','redeemed','expired');