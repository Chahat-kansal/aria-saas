-- Default (disabled) loyalty config for every business, so /loyalty/{slug} renders
-- a "coming soon" state instead of 404ing. public_enrol_enabled stays false until
-- the owner explicitly switches the program on.
INSERT INTO pos_loyalty_config (business_id, program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, public_enrol_enabled)
SELECT id, 'points', 1, 10, 'Free item', false
FROM businesses
WHERE id NOT IN (SELECT business_id FROM pos_loyalty_config WHERE business_id IS NOT NULL);

-- Auto-seed a default config for future businesses.
CREATE OR REPLACE FUNCTION create_default_loyalty_config()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pos_loyalty_config (business_id, program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, public_enrol_enabled)
  VALUES (NEW.id, 'points', 1, 10, 'Free item', false)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_default_loyalty_config ON businesses;
CREATE TRIGGER trg_default_loyalty_config
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION create_default_loyalty_config();

-- Sip: set booking slug to match its hub slug so the booking card appears.
UPDATE businesses SET booking_link_slug = slug
WHERE id = 'ff5055a0-c351-4ada-817a-1804961035f3' AND booking_link_slug IS NULL;