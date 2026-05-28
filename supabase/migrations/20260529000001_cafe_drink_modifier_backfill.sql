-- Task 12: Backfill standard café modifier groups for Sip (ff5055a0-...)
-- and link all Coffee/Tea products to those groups.
-- Idempotent: uses ON CONFLICT DO NOTHING throughout.

-- 1. Standard modifier groups
INSERT INTO pos_modifier_groups (id, business_id, name, selection_type, is_required, display_order, created_at)
VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Size',        'single', true,  1, now()),
  ('a1b2c3d4-0001-0001-0001-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Milk Type',   'single', false, 2, now()),
  ('a1b2c3d4-0001-0001-0001-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Temperature', 'single', true,  3, now()),
  ('a1b2c3d4-0001-0001-0001-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Extras',      'multi',  false, 4, now())
ON CONFLICT (id) DO NOTHING;

-- 2. Modifier options (Size, Milk Type, Temperature, Extras)
INSERT INTO pos_modifiers (id, business_id, group_id, name, price_adjustment, is_active, display_order, is_default)
VALUES
  -- Size
  ('b2c3d4e5-0001-0001-0001-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000001', 'Small',      0,    true, 1, true),
  ('b2c3d4e5-0001-0001-0001-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000001', 'Regular',    0.50, true, 2, false),
  ('b2c3d4e5-0001-0001-0001-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000001', 'Large',      1.00, true, 3, false),
  -- Milk Type
  ('b2c3d4e5-0001-0001-0001-000000000011', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000002', 'Whole Milk',  0,    true, 1, true),
  ('b2c3d4e5-0001-0001-0001-000000000012', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000002', 'Skim Milk',   0,    true, 2, false),
  ('b2c3d4e5-0001-0001-0001-000000000013', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000002', 'Oat Milk',    0.90, true, 3, false),
  ('b2c3d4e5-0001-0001-0001-000000000014', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000002', 'Almond Milk', 0.70, true, 4, false),
  ('b2c3d4e5-0001-0001-0001-000000000015', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000002', 'Soy Milk',    0.70, true, 5, false),
  -- Temperature
  ('b2c3d4e5-0001-0001-0001-000000000021', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000003', 'Hot',        0, true, 1, true),
  ('b2c3d4e5-0001-0001-0001-000000000022', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000003', 'Iced',       0, true, 2, false),
  ('b2c3d4e5-0001-0001-0001-000000000023', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000003', 'Extra Hot',  0, true, 3, false),
  -- Extras
  ('b2c3d4e5-0001-0001-0001-000000000031', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000004', 'Extra Shot',    0.60, true, 1, false),
  ('b2c3d4e5-0001-0001-0001-000000000032', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000004', 'Decaf',         0,    true, 2, false),
  ('b2c3d4e5-0001-0001-0001-000000000033', 'ff5055a0-c351-4ada-817a-1804961035f3', 'a1b2c3d4-0001-0001-0001-000000000004', 'Vanilla Syrup', 0.60, true, 3, false)
ON CONFLICT (id) DO NOTHING;

-- 3. Link all active Coffee/Tea products to the 4 modifier groups
INSERT INTO pos_product_modifier_groups (product_id, group_id, business_id, display_order)
SELECT
  p.id,
  mg.id,
  'ff5055a0-c351-4ada-817a-1804961035f3',
  mg.display_order
FROM pos_products p
CROSS JOIN pos_modifier_groups mg
LEFT JOIN pos_categories pc ON p.category_id = pc.id
WHERE p.business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND p.is_active = true
  AND mg.business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND (
    pc.name IN ('Coffee', 'Tea')
    OR (pc.name IS NULL AND p.name ILIKE ANY(ARRAY['%latte%','%espresso%','%cappuccino%','%mocha%','%chai%','%matcha%','%smoothie%','%chocolate%']))
  )
  AND NOT EXISTS (
    SELECT 1 FROM pos_product_modifier_groups pmg
    WHERE pmg.product_id = p.id AND pmg.group_id = mg.id
  )
ON CONFLICT DO NOTHING;