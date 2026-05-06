-- Receipt builder v2 — canvas-based absolute positioning
ALTER TABLE pos_receipt_templates ADD COLUMN IF NOT EXISTS canvas_width   integer DEFAULT 302;
ALTER TABLE pos_receipt_templates ADD COLUMN IF NOT EXISTS canvas_height  integer DEFAULT 800;
ALTER TABLE pos_receipt_templates ADD COLUMN IF NOT EXISTS background_color text DEFAULT '#ffffff';
ALTER TABLE pos_receipt_templates ADD COLUMN IF NOT EXISTS elements        jsonb DEFAULT '[]';
