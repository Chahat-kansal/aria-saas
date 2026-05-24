# Aria OS — Prompt 18: POS Layout Customisation — Level 3
Product grid reorder. ONE task, ONE commit, ONE push.
Run AFTER Prompt 17 is deployed green.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read FastGridLayout.tsx in full (the main product grid after the Prompt 09
performance fixes). Read how products are loaded and passed to the grid.
Read how categories filter the product list. Read how
pos_layout_preferences is already loaded (from Prompt 17) — reuse that
context, do not make a second fetch. Do NOT write code before reading.

## CONTEXT — DB ALREADY BUILT
pos_layout_preferences.product_grid_order is jsonb — stores a per-category
product order map: { "category-uuid": ["product-uuid-1","product-uuid-2"] }
NULL = use the default order (by name or display_order column). The GET and
PATCH routes already exist from Prompt 17 — just PATCH product_grid_order.

## STEP 2 — PRODUCT GRID REORDER
In the POS terminal, when the manager is in "Customise layout" mode
(the same toggle from Prompt 17 — read how it's implemented and reuse it):
- The product grid tiles show a drag handle or the whole tile becomes
  draggable (whichever is cleaner given FastGridLayout's structure).
- Use @dnd-kit/core + @dnd-kit/sortable (already installed in Prompt 17).
- Dragging reorders tiles within the active category.
- On drop, PATCH /api/pos/layout-preferences with the updated
  product_grid_order for that category:
  { product_grid_order: { ...existing, [activeCategoryId]: [newOrderedIds] } }
- The order persists: next time the POS loads, products in that category
  render in the saved order instead of the default.
- Reorder is per-category — reordering Beer doesn't affect Spirits.
- The "Reset to default" button from Prompt 17 also clears
  product_grid_order (the DELETE route already does this).

## STEP 3 — APPLY SAVED ORDER ON LOAD
In the terminal, after products load and before passing to FastGridLayout:
- Read product_grid_order from the already-loaded preferences context.
- If product_grid_order[activeCategoryId] exists, sort the products for
  that category to match the saved ID order. Products not in the saved
  list (e.g. newly added) append at the end.
- This sort must be a useMemo so it doesn't trigger a re-render on every
  state change (per the Prompt 09 performance rules).

## STEP 4 — VISUAL FEEDBACK
In customise mode on the product grid:
- A subtle "drag to reorder" label appears above the grid.
- Tiles show a drag cursor (cursor: grab / grabbing).
- While dragging: the dragged tile appears slightly scaled up (transform:
  scale(1.04)) and semi-transparent (opacity: 0.85) — standard dnd-kit
  overlay pattern. Other tiles shift to show the drop position.
- A brief "Layout saved" toast appears after a successful PATCH.

## CONSTRAINTS
- Do NOT re-render the product grid unnecessarily — the order sort must be
  inside useMemo (dep: [products, activeCategoryId, productGridOrder]).
- Do NOT touch the locked files: AnimatedBg, FlyToCart, CursorGlow,
  pos-sfx.ts, aria-voice-guide.ts.
- Do NOT change any POS feature or behaviour — additive only.
- No backtick template literals in className={...}/style={{}}.

## STEP 5 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(pos): POS layout customisation L3 — drag-to-reorder product grid tiles per category, order persisted to pos_layout_preferences.product_grid_order, applied on load via useMemo, visual drag feedback in customise mode
