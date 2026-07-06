-- ORD-FOOD-BUILDS: Seed Sip food-build products and starter modifier groups
-- Business: Sip (ff5055a0-c351-4ada-817a-1804961035f3)
-- Idempotent: fixed UUIDs + ON CONFLICT (id) DO NOTHING throughout.
--
-- Sets 10 products to ordering_mode='build' + correct archetype,
-- creates one "Build Your X" modifier group per archetype with ingredient-
-- matched option names (nameToFoodKey compatible), and links groups to products.
--
-- Archetype → FOOD_LIBRARIES key mapping (ingredients.ts):
--   salad     → bowl layout   (lettuce base)
--   toastie   → stack layout  (toast base)
--   wrap      → stack layout  (wrap/tortilla base)
--   bowl      → bowl layout   (yoghurt base)  [brekky bowl]
--   breakfast → scatter layout (toast base)   [cooked breakfast]

-- ── Group UUIDs (fixed, idempotent) ───────────────────────────────────────
-- salad group:    c0fb0001-f00d-4001-a001-000000000001
-- toastie group:  c0fb0002-f00d-4002-a002-000000000002
-- wrap group:     c0fb0003-f00d-4003-a003-000000000003
-- bowl group:     c0fb0004-f00d-4004-a004-000000000004
-- breakfast group:c0fb0005-f00d-4005-a005-000000000005

-- ── 1. SALAD modifier group ───────────────────────────────────────────────
INSERT INTO pos_modifier_groups (id, business_id, name, selection_type, is_required, allow_quantity, min_selections, max_selections, display_order, created_at)
VALUES ('c0fb0001-f00d-4001-a001-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Build Your Salad', 'multi', false, true, 0, 9, 1, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO pos_modifiers (id, business_id, group_id, name, price_adjustment, is_active, is_default, allow_quantity, max_quantity, display_order)
VALUES
  ('c0fd0101-f00d-4001-a001-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Chicken',         2.00, true, true,  false, 1, 1),
  ('c0fd0102-f00d-4001-a001-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Cherry Tomatoes',  0.00, true, true,  false, 1, 2),
  ('c0fd0103-f00d-4001-a001-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Croutons',         0.00, true, true,  false, 1, 3),
  ('c0fd0104-f00d-4001-a001-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Cucumber',         0.00, true, false, false, 1, 4),
  ('c0fd0105-f00d-4001-a001-000000000005', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Feta',             1.00, true, false, false, 1, 5),
  ('c0fd0106-f00d-4001-a001-000000000006', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Caesar Dressing',  0.00, true, false, false, 1, 6),
  ('c0fd0107-f00d-4001-a001-000000000007', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Olives',           0.50, true, false, false, 1, 7),
  ('c0fd0108-f00d-4001-a001-000000000008', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0001-f00d-4001-a001-000000000001', 'Parmesan',         0.50, true, false, false, 1, 8)
ON CONFLICT (id) DO NOTHING;

-- Set salad products to build mode
UPDATE pos_products
SET ordering_mode = 'build', ordering_archetype = 'salad', updated_at = now()
WHERE business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND lower(name) = ANY(ARRAY['greek salad', 'caesar salad'])
  AND deleted_at IS NULL;

-- Link salad group to salad products
INSERT INTO pos_product_modifier_groups (product_id, group_id, business_id, display_order)
SELECT p.id, 'c0fb0001-f00d-4001-a001-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 1
FROM pos_products p
WHERE p.business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND lower(p.name) = ANY(ARRAY['greek salad', 'caesar salad'])
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pos_product_modifier_groups pmg
    WHERE pmg.product_id = p.id AND pmg.group_id = 'c0fb0001-f00d-4001-a001-000000000001'
  )
ON CONFLICT DO NOTHING;

-- ── 2. TOASTIE modifier group ─────────────────────────────────────────────
INSERT INTO pos_modifier_groups (id, business_id, name, selection_type, is_required, allow_quantity, min_selections, max_selections, display_order, created_at)
VALUES ('c0fb0002-f00d-4002-a002-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Build Your Toastie', 'multi', false, true, 0, 8, 1, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO pos_modifiers (id, business_id, group_id, name, price_adjustment, is_active, is_default, allow_quantity, max_quantity, display_order)
VALUES
  ('c0fd0201-f00d-4002-a002-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0002-f00d-4002-a002-000000000002', 'Ham',          0.00, true, true,  false, 1, 1),
  ('c0fd0202-f00d-4002-a002-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0002-f00d-4002-a002-000000000002', 'Cheese',       0.00, true, true,  false, 1, 2),
  ('c0fd0203-f00d-4002-a002-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0002-f00d-4002-a002-000000000002', 'Tomato',       0.00, true, false, false, 1, 3),
  ('c0fd0204-f00d-4002-a002-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0002-f00d-4002-a002-000000000002', 'Egg',          1.50, true, false, false, 1, 4),
  ('c0fd0205-f00d-4002-a002-000000000005', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0002-f00d-4002-a002-000000000002', 'Avocado',      2.00, true, false, false, 1, 5),
  ('c0fd0206-f00d-4002-a002-000000000006', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0002-f00d-4002-a002-000000000002', 'Baby Spinach', 0.00, true, false, false, 1, 6),
  ('c0fd0207-f00d-4002-a002-000000000007', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0002-f00d-4002-a002-000000000002', 'Mushrooms',    1.00, true, false, false, 1, 7)
ON CONFLICT (id) DO NOTHING;

-- Set toastie products to build mode
UPDATE pos_products
SET ordering_mode = 'build', ordering_archetype = 'toastie', updated_at = now()
WHERE business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND lower(name) = ANY(ARRAY['toasted sandwich', 'avocado toast'])
  AND deleted_at IS NULL;

-- Link toastie group to toastie products
INSERT INTO pos_product_modifier_groups (product_id, group_id, business_id, display_order)
SELECT p.id, 'c0fb0002-f00d-4002-a002-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 1
FROM pos_products p
WHERE p.business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND lower(p.name) = ANY(ARRAY['toasted sandwich', 'avocado toast'])
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pos_product_modifier_groups pmg
    WHERE pmg.product_id = p.id AND pmg.group_id = 'c0fb0002-f00d-4002-a002-000000000002'
  )
ON CONFLICT DO NOTHING;

-- ── 3. WRAP modifier group ────────────────────────────────────────────────
INSERT INTO pos_modifier_groups (id, business_id, name, selection_type, is_required, allow_quantity, min_selections, max_selections, display_order, created_at)
VALUES ('c0fb0003-f00d-4003-a003-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Build Your Wrap', 'multi', false, true, 0, 7, 1, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO pos_modifiers (id, business_id, group_id, name, price_adjustment, is_active, is_default, allow_quantity, max_quantity, display_order)
VALUES
  ('c0fd0301-f00d-4003-a003-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0003-f00d-4003-a003-000000000003', 'Chicken',          2.00, true, true,  false, 1, 1),
  ('c0fd0302-f00d-4003-a003-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0003-f00d-4003-a003-000000000003', 'Falafel',          0.00, true, false, false, 1, 2),
  ('c0fd0303-f00d-4003-a003-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0003-f00d-4003-a003-000000000003', 'Tomato',           0.00, true, true,  false, 1, 3),
  ('c0fd0304-f00d-4003-a003-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0003-f00d-4003-a003-000000000003', 'Shredded Lettuce', 0.00, true, true,  false, 1, 4),
  ('c0fd0305-f00d-4003-a003-000000000005', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0003-f00d-4003-a003-000000000003', 'Red Onion',        0.00, true, false, false, 1, 5),
  ('c0fd0306-f00d-4003-a003-000000000006', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0003-f00d-4003-a003-000000000003', 'Hummus',           0.50, true, false, false, 1, 6),
  ('c0fd0307-f00d-4003-a003-000000000007', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0003-f00d-4003-a003-000000000003', 'Tzatziki',         0.50, true, false, false, 1, 7)
ON CONFLICT (id) DO NOTHING;

-- Set wrap products to build mode
UPDATE pos_products
SET ordering_mode = 'build', ordering_archetype = 'wrap', updated_at = now()
WHERE business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND lower(name) = ANY(ARRAY['falafel wrap', 'chicken wrap'])
  AND deleted_at IS NULL;

-- Link wrap group to wrap products
INSERT INTO pos_product_modifier_groups (product_id, group_id, business_id, display_order)
SELECT p.id, 'c0fb0003-f00d-4003-a003-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 1
FROM pos_products p
WHERE p.business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND lower(p.name) = ANY(ARRAY['falafel wrap', 'chicken wrap'])
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pos_product_modifier_groups pmg
    WHERE pmg.product_id = p.id AND pmg.group_id = 'c0fb0003-f00d-4003-a003-000000000003'
  )
ON CONFLICT DO NOTHING;

-- ── 4. BREKKY BOWL modifier group (archetype = 'bowl') ───────────────────
INSERT INTO pos_modifier_groups (id, business_id, name, selection_type, is_required, allow_quantity, min_selections, max_selections, display_order, created_at)
VALUES ('c0fb0004-f00d-4004-a004-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Build Your Bowl', 'multi', false, true, 0, 8, 1, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO pos_modifiers (id, business_id, group_id, name, price_adjustment, is_active, is_default, allow_quantity, max_quantity, display_order)
VALUES
  ('c0fd0401-f00d-4004-a004-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Granola',       0.00, true, true,  false, 1, 1),
  ('c0fd0402-f00d-4004-a004-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Mixed Berries', 0.00, true, true,  false, 1, 2),
  ('c0fd0403-f00d-4004-a004-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Strawberries',  0.50, true, false, false, 1, 3),
  ('c0fd0404-f00d-4004-a004-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Banana',        0.50, true, false, false, 1, 4),
  ('c0fd0405-f00d-4004-a004-000000000005', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Acai',          2.00, true, false, false, 1, 5),
  ('c0fd0406-f00d-4004-a004-000000000006', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Bircher',       1.00, true, false, false, 1, 6),
  ('c0fd0407-f00d-4004-a004-000000000007', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Chia Seeds',    0.50, true, false, false, 1, 7),
  ('c0fd0408-f00d-4004-a004-000000000008', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0004-f00d-4004-a004-000000000004', 'Honey',         0.50, true, false, false, 1, 8)
ON CONFLICT (id) DO NOTHING;

-- Set brekky bowl products to build mode (archetype='bowl' matches FOOD_LIBRARIES key)
UPDATE pos_products
SET ordering_mode = 'build', ordering_archetype = 'bowl', updated_at = now()
WHERE business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND (lower(name) LIKE '%granola%' OR lower(name) LIKE '%acai%' OR lower(name) LIKE '%bircher%')
  AND deleted_at IS NULL;

-- Link bowl group to brekky bowl products
INSERT INTO pos_product_modifier_groups (product_id, group_id, business_id, display_order)
SELECT p.id, 'c0fb0004-f00d-4004-a004-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 1
FROM pos_products p
WHERE p.business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND (lower(p.name) LIKE '%granola%' OR lower(p.name) LIKE '%acai%' OR lower(p.name) LIKE '%bircher%')
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pos_product_modifier_groups pmg
    WHERE pmg.product_id = p.id AND pmg.group_id = 'c0fb0004-f00d-4004-a004-000000000004'
  )
ON CONFLICT DO NOTHING;

-- ── 5. COOKED BREAKFAST modifier group (archetype = 'breakfast') ──────────
INSERT INTO pos_modifier_groups (id, business_id, name, selection_type, is_required, allow_quantity, min_selections, max_selections, display_order, created_at)
VALUES ('c0fb0005-f00d-4005-a005-000000000005', 'ff5055a0-c351-4ada-817a-1804961035f3', 'Build Your Breakfast', 'multi', false, true, 0, 8, 1, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO pos_modifiers (id, business_id, group_id, name, price_adjustment, is_active, is_default, allow_quantity, max_quantity, display_order)
VALUES
  ('c0fd0501-f00d-4005-a005-000000000001', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Bacon',          0.00, true, true,  false, 1, 1),
  ('c0fd0502-f00d-4005-a005-000000000002', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Poached Egg',    0.00, true, true,  false, 1, 2),
  ('c0fd0503-f00d-4005-a005-000000000003', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Fried Eggs',     0.00, true, false, false, 1, 3),
  ('c0fd0504-f00d-4005-a005-000000000004', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Sausage',        2.00, true, false, false, 1, 4),
  ('c0fd0505-f00d-4005-a005-000000000005', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Baked Beans',    0.00, true, false, false, 1, 5),
  ('c0fd0506-f00d-4005-a005-000000000006', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Grilled Tomato', 0.00, true, false, false, 1, 6),
  ('c0fd0507-f00d-4005-a005-000000000007', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Hash Brown',     1.50, true, false, false, 1, 7),
  ('c0fd0508-f00d-4005-a005-000000000008', 'ff5055a0-c351-4ada-817a-1804961035f3', 'c0fb0005-f00d-4005-a005-000000000005', 'Mushrooms',      1.00, true, false, false, 1, 8)
ON CONFLICT (id) DO NOTHING;

-- Set cooked breakfast products to build mode (archetype='breakfast' matches FOOD_LIBRARIES key)
UPDATE pos_products
SET ordering_mode = 'build', ordering_archetype = 'breakfast', updated_at = now()
WHERE business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND (lower(name) LIKE '%big breakfast%' OR lower(name) LIKE '%eggs benedict%')
  AND deleted_at IS NULL;

-- Link breakfast group to cooked breakfast products
INSERT INTO pos_product_modifier_groups (product_id, group_id, business_id, display_order)
SELECT p.id, 'c0fb0005-f00d-4005-a005-000000000005', 'ff5055a0-c351-4ada-817a-1804961035f3', 1
FROM pos_products p
WHERE p.business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  AND (lower(p.name) LIKE '%big breakfast%' OR lower(p.name) LIKE '%eggs benedict%')
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pos_product_modifier_groups pmg
    WHERE pmg.product_id = p.id AND pmg.group_id = 'c0fb0005-f00d-4005-a005-000000000005'
  )
ON CONFLICT DO NOTHING;