# Aria OS — Prompt 17: POS Layout Customisation — Level 1 + 2
Nav reorder + custom groups. ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read the POS sidebar/nav component in full — find where the nav items are
defined and rendered. Read how BusinessProvider provides context. Read an
existing API route that PATCHes a businesses-adjacent table for the save
pattern. Do NOT write code before reading.

## CONTEXT — DB ALREADY BUILT, do not create/alter tables
Table pos_layout_preferences: business_id (PK FK), nav_order (jsonb,
nullable — ordered array of nav item keys), nav_groups (jsonb, nullable —
array of {label, keys[]} objects), product_grid_order (jsonb, nullable),
updated_at. NULL = use hardcoded default. Do not alter this table.

## STEP 2 — API ROUTE
Create src/app/api/pos/layout-preferences/route.ts.
- GET: load pos_layout_preferences for the user's business. Return
  { nav_order, nav_groups, product_grid_order } (nulls if no row yet).
- PATCH: body { nav_order?, nav_groups?, product_grid_order? }. Upsert
  the pos_layout_preferences row (only update the fields sent). Auth +
  business ownership check. Return the updated row.
- DELETE: sets all three columns to null (revert to defaults). Auth +
  ownership check.

## STEP 3 — LOAD PREFERENCES INTO POSSHELL / NAV
In the POS layout shell (wherever the nav items array is defined):
- On mount, fetch GET /api/pos/layout-preferences.
- If nav_order is non-null, reorder the nav items array to match it.
- If nav_groups is non-null, replace the flat nav with the grouped
  structure — each group renders as a collapsible section/dropdown with
  a label and its member items.
- If null on either, use the existing hardcoded default (no change).
- Cache the preferences in a React context or state so the nav doesn't
  flicker on every POS page change.

## STEP 4 — LEVEL 1: NAV REORDER (drag to reorder flat nav)
Add a "Customise layout" mode toggle in POS Settings (a button:
"Customise POS layout"). When active:
- The POS nav items show drag handles (⠿ icon on the left).
- Use @dnd-kit/core + @dnd-kit/sortable (npm install both, commit
  lockfile). Wrap the nav list in <DndContext> + <SortableContext>.
- Dragging reorders the items. On drop, PATCH /api/pos/layout-preferences
  with the new nav_order array (array of item key strings).
- A "Done" button exits customise mode. A "Reset to default" button calls
  DELETE /api/pos/layout-preferences and restores the default nav order.
- The drag handles only appear in customise mode — not in normal operation.

## STEP 5 — LEVEL 2: CUSTOM GROUPS (drag into folders/dropdowns)
In the same "Customise layout" mode, below the sortable nav list:
- A "Create group" button opens a small inline form: enter a group name
  (e.g. "Close of Day"), then drag existing nav items into it.
- Groups render in the nav as a dropdown/collapsible row with the group
  label and a ▶ chevron. Click to expand and see the grouped items.
- Items inside a group can be dragged out of the group back to the flat
  list, or between groups.
- Groups are stored in nav_groups jsonb as:
  [{ "label": "Close of Day", "keys": ["close-register","eod","reports"] }]
- Items in a group are removed from nav_order (they live in nav_groups
  instead). The nav renders: ungrouped items from nav_order first (in
  order), then group dropdowns at the bottom (or wherever dragged).
- A group can be deleted (its items return to the flat nav_order list).

## UI RULES (locked)
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Financial Trust palette (#2D5240 forest, #7FB897 sage)
- Drag handles: subtle grey (rgba(0,0,0,0.3)), only visible in customise mode
- Group dropdowns: match the existing nav style — same font, same sizing
- Customise mode: a clear visual indicator (e.g. amber border on the nav,
  "Editing layout" label) so the manager knows they're in edit mode
- Additive only — do not break normal POS nav operation or any existing route

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. npm install
@dnd-kit/core @dnd-kit/sortable — commit the lockfile with the feature.
ONE commit, ONE push.
Commit: feat(pos): POS layout customisation L1+L2 — drag-to-reorder nav items and drag-into-groups with named dropdowns; preferences saved to pos_layout_preferences, revert-to-default button, customise mode toggle in POS settings
