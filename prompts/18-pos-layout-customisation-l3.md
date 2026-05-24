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
Read FastGridLayout.tsx in full. Read how products are loaded and passed
to the grid. Read how pos_layout_preferences is already fetched and stored
from Prompt 17 — reuse that exact context/hook, do not make a second
fetch for the same data. Read the /api/pos/layout-preferences route from
Prompt 17 (GET/PATCH/DELETE). Do NOT write code before reading.

## CRITICAL PERSISTENCE RULES (same as Prompt 17 — re-read carefully)

1. PERMANENT STORAGE — product_grid_order lives in pos_layout_preferences
   in the DB. It persists forever until explicitly reset. localStorage
   is a read-cache at most. DB is always source of truth.

2. NEVER CLEAR ON ACCIDENTAL ACTION — closing the browser, refreshing,
   logging out and back in, switching categories — none of these clear
   the saved product order. Only the explicit reset button does.

3. RESET BUTTON SCOPE — the reset button in the product grid customise
   mode only clears product_grid_order. It does NOT touch nav_order,
   nav_groups, or any other column. It does NOT touch pos_products,
   businesses, or any other table.
   Implementation: PATCH /api/pos/layout-preferences with
   { product_grid_order: null } — this nulls only that column.
   Do NOT use the DELETE route here (DELETE clears nav columns, not
   product_grid_order — they are separate reset actions).

4. SAVE ON EVERY CHANGE — every drag-drop in the product grid immediately
   PATCHes /api/pos/layout-preferences with the new product_grid_order
   for the changed category. Optimistic update + revert on failure.

5. CATEGORY ISOLATION — reordering products in category A must not affect
   any other category. product_grid_order is a map:
   { "cat-uuid-A": ["prod-1","prod-2"], "cat-uuid-B": ["prod-3","prod-4"] }
   Only the changed category's array is sent in the PATCH body:
   PATCH { product_grid_order: { ...existing, [changedCatId]: newOrder } }
   The server merges this into the existing jsonb (jsonb || jsonb in SQL
   or a read-modify-write in the route handler).

## STEP 2 — APPLY SAVED ORDER ON LOAD
In the terminal, after products load and before passing to FastGridLayout:
- Read product_grid_order from the already-loaded preferences context
  (from Prompt 17 — do not fetch again).
- For the active category, if product_grid_order[activeCategoryId] exists,
  sort the products to match the saved ID order.
- Products NOT in the saved array (newly added after the order was saved)
  append at the end of the sorted list — they do not get lost.
- Deleted products that are still in the saved array are simply skipped
  (they won't be in the products list, so filtering them out is safe).
- This sort MUST be inside useMemo:
    const orderedProducts = useMemo(() => {
      const savedOrder = productGridOrder?.[activeCategoryId]
      if (!savedOrder) return displayedProducts
      const map = new Map(displayedProducts.map(p => [p.id, p]))
      const sorted = savedOrder.map(id => map.get(id)).filter(Boolean)
      const unsaved = displayedProducts.filter(p => !savedOrder.includes(p.id))
      return [...sorted, ...unsaved]
    }, [displayedProducts, activeCategoryId, productGridOrder])
  deps: [displayedProducts, activeCategoryId, productGridOrder].
  This ensures no extra re-renders per the Prompt 09 performance rules.

## STEP 3 — PRODUCT GRID REORDER UI
In customise mode (the same toggle from Prompt 17 — read its implementation
and use the same state/context to activate customise mode on the terminal):

- The product grid tiles become draggable via @dnd-kit (already installed
  in Prompt 17).
- A "drag to reorder products" label appears above the grid in customise
  mode only.
- Tiles show cursor: grab. While dragging: the active tile scales to 1.05
  and dims to opacity 0.8. Other tiles shift to show the drop slot.
- On drag end: update local orderedProducts state optimistically, then
  PATCH /api/pos/layout-preferences with the new category order.
  On PATCH failure: revert + "Couldn't save layout" toast.
- A "Reset product order" button (visible in customise mode) PATCHes
  { product_grid_order: { ...existing, [activeCategoryId]: null } } to
  clear just this category's saved order. The server should treat a null
  value for a category key as "remove this key from the jsonb map."
  After reset, the category reverts to the default sort order.
- A "Reset ALL product orders" button PATCHes { product_grid_order: null }
  to clear every category's saved order at once.
  This must NOT touch nav_order or nav_groups.

## STEP 4 — SERVER-SIDE MERGE FOR product_grid_order
In the PATCH handler in /api/pos/layout-preferences/route.ts (from
Prompt 17), when product_grid_order is included in the body:
- Do NOT overwrite the entire column with the incoming value.
- Instead: load the existing product_grid_order, deep-merge the incoming
  category keys over it, then save the merged result.
  Example: existing = { catA: [1,2,3], catB: [4,5] }
  incoming = { catA: [2,1,3] }
  result = { catA: [2,1,3], catB: [4,5] }  ← catB preserved
- If a category key's value is null in the incoming body, remove that key
  from the map (the reset-single-category action).
This merge logic must be in the route — not in the client.

## CONSTRAINTS
- Do NOT re-render the product grid unnecessarily — the useMemo in STEP 2
  is the only place the order is applied.
- Do NOT touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts,
  aria-voice-guide.ts.
- No backtick template literals in className={...}/style={{}}.
- 'use client' line 1 where needed.
- Additive only — existing grid features (search, category filter,
  add-to-cart, modifiers) must all work identically.

## STEP 5 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(pos): POS layout customisation L3 — permanent DB-persisted product grid reorder per category; server-side jsonb merge preserves other categories; applied via useMemo; reset clears product_grid_order only (not nav columns, not any other table)
