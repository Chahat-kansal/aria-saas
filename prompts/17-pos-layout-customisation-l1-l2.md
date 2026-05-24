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
nullable), nav_groups (jsonb, nullable), product_grid_order (jsonb,
nullable), updated_at. NULL = use hardcoded default. Do not alter.

## CRITICAL PERSISTENCE RULES (read these before writing a single line)

1. PERMANENT STORAGE — preferences MUST persist across sessions, browser
   closes, device switches, and app updates. They are stored in the DB
   (pos_layout_preferences) and loaded fresh on every POS mount. They do
   NOT live in localStorage, sessionStorage, or any in-memory state that
   clears on window close. localStorage may be used as a read cache only —
   but the DB is always the source of truth. If localStorage and DB
   disagree, DB wins.

2. NEVER CLEAR ON ACCIDENTAL ACTION — the only way preferences clear is
   the explicit "Reset to default layout" button. No other action (page
   refresh, closing the browser, navigating away, logging out and back in,
   switching businesses and returning) should affect the saved layout.

3. RESET BUTTON SCOPE — "Reset to default layout" ONLY nulls the three
   POS layout columns (nav_order, nav_groups, product_grid_order) on the
   pos_layout_preferences row. It must NOT touch: the businesses table,
   business_hours, pos_products, staff_members, any settings, any other
   table, or any other data whatsoever. It is a surgical DELETE/UPDATE of
   the pos_layout_preferences row only.
   The API route for reset: DELETE /api/pos/layout-preferences
   Implementation: either DELETE the row entirely (preferred — NULL is
   the default) OR UPDATE SET nav_order=null, nav_groups=null,
   product_grid_order=null. Either is correct. Nothing else is touched.

4. PARTIAL RESET SAFETY — if only nav_order and nav_groups are null (from
   a reset), but product_grid_order has a value (saved from Prompt 18),
   the reset must preserve product_grid_order unless the user explicitly
   resets from the product grid too. In Prompt 17, the reset only clears
   nav_order and nav_groups. product_grid_order is untouched.
   Implementation: UPDATE SET nav_order=null, nav_groups=null WHERE
   business_id=X — do NOT clear product_grid_order in this prompt.

5. SAVE ON EVERY CHANGE — every drag-drop reorder and every group change
   immediately PATCHes /api/pos/layout-preferences. Do not wait for a
   "Save" button (except for the group name input which needs a confirm).
   The user should never lose a layout change because they forgot to save.

## STEP 2 — API ROUTE
Create src/app/api/pos/layout-preferences/route.ts.

GET: load pos_layout_preferences for the user's active business.
  Return { nav_order, nav_groups, product_grid_order } (nulls if no row).
  Auth + business ownership check. Use supabaseAdmin is fine here.

PATCH: body { nav_order?, nav_groups?, product_grid_order? }.
  Upsert the pos_layout_preferences row merging only the fields sent.
  Example: if body only has { nav_order }, only nav_order is updated —
  nav_groups and product_grid_order are NOT touched.
  Auth + ownership check. Return the updated row.

DELETE: sets nav_order=null AND nav_groups=null only.
  Does NOT touch product_grid_order. Does NOT touch any other table.
  Auth + ownership check. Return { ok: true }.

## STEP 3 — LOAD PREFERENCES ON MOUNT
In the POS layout shell (POSShell or wherever the nav is rendered):
- On mount, fetch GET /api/pos/layout-preferences.
- Store result in React state (e.g. useLayoutPreferences hook or context).
- If nav_order is non-null, reorder the nav items to match it.
- If nav_groups is non-null, render those groups as collapsible sections.
- If null on either, use the hardcoded default — no visible change.
- This fetch runs on every POS mount (page load / navigation to /pos).
  This ensures the layout is always current from the DB regardless of
  what happened in the previous session.
- Show a loading skeleton for the nav (< 200ms) while the fetch resolves
  rather than flashing the default and then reordering.

## STEP 4 — LEVEL 1: NAV REORDER
Add a "Customise layout" toggle button in POS Settings (existing settings
page — additive, do not replace anything).

When customise mode is ON:
- The POS nav shows drag handles (⠿ icon) on each item.
- npm install @dnd-kit/core @dnd-kit/sortable (commit lockfile).
  Wrap nav list in <DndContext onDragEnd={handleDragEnd}> +
  <SortableContext items={orderedKeys}>.
- On drag end: update local state immediately (optimistic), then PATCH
  /api/pos/layout-preferences with { nav_order: newOrderedKeys }.
  If the PATCH fails: revert local state + show a toast "Couldn't save
  layout — try again."
- A "Done" button exits customise mode (nav returns to normal appearance).
- A "Reset nav to default" button calls DELETE (clears nav_order +
  nav_groups only) then reloads preferences from the GET response.

## STEP 5 — LEVEL 2: CUSTOM GROUPS
In the same customise mode, below the sortable nav list:
- A "+ Create group" button shows an inline input for the group name.
  On confirm (Enter or a tick button), create the group in local state.
- The manager drags existing nav items INTO a group (or creates items
  already in the group). Items in a group are removed from the flat list.
- Groups render in the nav as collapsible rows with a ▶ chevron + label.
  Clicking expands to show the grouped items (which are also navigable).
- Items inside a group can be dragged back to the flat list or between
  groups. This must feel fluid — use @dnd-kit's drag overlay.
- A group with zero items is automatically removed.
- On any group change: PATCH /api/pos/layout-preferences with
  { nav_groups: updatedGroups, nav_order: updatedFlatOrder }.
- A group "Delete" (✕) button on the group label: returns all items to
  the flat nav_order list and removes the group from nav_groups.
- nav_groups jsonb shape:
  [{ "label": "Close of Day", "keys": ["close-register","eod","reports"] }]
- Items in a group are NOT in nav_order — nav_order contains only
  ungrouped items. The nav renders: ungrouped items first (in nav_order),
  then group rows at the bottom.

## UI RULES (locked)
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Financial Trust palette (#2D5240 forest, #7FB897 sage)
- Customise mode: amber border on the nav panel + "Editing layout" badge
- Drag handles: rgba(0,0,0,0.25) only visible in customise mode
- Group rows: same height and font as regular nav items
- Loading skeleton: a grey shimmer matching the nav item height
- Additive only — do not remove or break any existing POS nav or route

## STEP 6 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors. ONE commit, ONE push.
Commit: feat(pos): POS layout customisation L1+L2 — permanent DB-persisted nav reorder and custom group dropdowns; loads on every mount from DB; reset clears nav columns only (not product grid, not any other table)
