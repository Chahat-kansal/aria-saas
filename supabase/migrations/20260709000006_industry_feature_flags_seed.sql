-- ONBOARD-FIX-1 (feature-set confirmation) — seed feature_flags rows for the
-- NEW industry-relevance nav toggles (reviews/compliance/reorder/ordering/
-- bookings/wholesale). is_globally_enabled=true so every EXISTING business
-- keeps seeing these nav items exactly as today (RULE0 — no downgrade);
-- only businesses that go through the new onboarding feature-confirmation
-- step and explicitly turn one off get added to disabled_for_business_ids,
-- which the existing hasFeature() resolution already treats as
-- "always wins, even over global enable".
INSERT INTO feature_flags (flag_key, label, description, enabled_for_plans, is_globally_enabled)
VALUES
  ('nav_reviews',    'Reviews',           'Review request nav item',        ARRAY['starter','growth','pro','enterprise'], true),
  ('nav_compliance', 'Compliance',        'Compliance & age-check nav item', ARRAY['starter','growth','pro','enterprise'], true),
  ('nav_reorder',    'Smart reorder',     'Reorder/low-stock nav item',      ARRAY['starter','growth','pro','enterprise'], true),
  ('nav_ordering',   'Online ordering',   'Online ordering nav item',        ARRAY['starter','growth','pro','enterprise'], true),
  ('nav_bookings',   'Bookings',          'Bookings nav item',               ARRAY['starter','growth','pro','enterprise'], true),
  ('nav_wholesale',  'Wholesale orders',  'Wholesale orders nav item',       ARRAY['starter','growth','pro','enterprise'], true)
ON CONFLICT (flag_key) DO NOTHING;
