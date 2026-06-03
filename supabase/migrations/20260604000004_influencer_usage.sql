-- Usage increment function for influencer library
CREATE OR REPLACE FUNCTION increment_influencer_usage(p_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE aria_influencer_library SET usage_count = usage_count + 1 WHERE id = p_id;
END;
$$;
