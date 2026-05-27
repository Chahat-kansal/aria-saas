# Prompt 62 — Multi-Outlet: Add/Manage Outlets + Switch in POS Terminal

## Why this matters
A business owner with 2 locations (Sip Bentleigh East + Sip Brighton) needs:
- Each outlet has its own stock levels
- Each outlet has its own cash sessions and sales history
- Staff at Brighton only see Brighton's terminal
- Dashboard shows per-outlet and combined reporting
- Currently Sip only has one "Global" outlet — no way to add a second

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/pos/(fullscreen)/terminal/page.tsx` — read lines 200-260 (outlet/business context)
2. `cat src/app/api/pos/outlets/route.ts` — full read
3. Check DB via Supabase MCP: `pos_outlets` table — ALL columns
4. Check DB: `pos_cash_sessions` — does it have outlet_id?
5. Check DB: `pos_products` — does it have outlet_id or is stock shared across outlets?
6. `cat src/app/dashboard/settings/page.tsx` — where to add outlet management

## What to build

### 1. Outlet management in dashboard settings
In `src/app/dashboard/settings/page.tsx`, add a new "Locations" tab or section:

**Locations section:**
- Lists all outlets for the business
- Shows: name, address, is_active status
- "Add location" button → inline form:
  - Location name (text): "Bentleigh East", "Brighton CBD"
  - Address (text)
  - Phone (text, optional)
  - Toggle: Active/Inactive
- Edit existing location (pencil icon)
- Cannot delete the last/only outlet

**API:** `GET/POST/PUT /api/pos/outlets`

### 2. Outlet switcher in POS terminal
Currently the terminal has a business switcher (⇄ button).
Add an outlet switcher WITHIN the same business.

In the terminal header area, add:
- Current outlet name display: "📍 Bentleigh East ▼"
- Click → dropdown showing all active outlets for this business
- Select outlet → terminal reloads product catalogue for that outlet
- Current outlet stored in localStorage: `aria_pos_outlet_{businessId}`

Implementation:
```ts
// On terminal load, get outlet
const savedOutletId = localStorage.getItem(`aria_pos_outlet_${businessId}`)
const outletId = savedOutletId ?? outlets[0]?.id

// When outlet switched:
localStorage.setItem(`aria_pos_outlet_${businessId}`, newOutletId)
// Reload products, clear cart, start new session for the outlet
```

Fetch outlets: `GET /api/pos/outlets?business_id={id}`

### 3. Stock per outlet
Check if `pos_products` has outlet-level stock.
If stock is shared (no outlet_id on stock): add `pos_outlet_stock` table:
```sql
CREATE TABLE IF NOT EXISTS pos_outlet_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE,
  stock_quantity numeric DEFAULT 0,
  reorder_point numeric DEFAULT 5,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(outlet_id, product_id)
);
```
When terminal loads products for an outlet, join with outlet_stock to show correct stock levels.
When a sale is made, deduct from the correct outlet's stock.

If this is too complex for one prompt, implement shared stock first (all outlets share same stock) and note it as a follow-up improvement.

### 4. Cash sessions per outlet
`pos_cash_sessions` must have `outlet_id`.
Check if column exists — add if missing:
```sql
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES pos_outlets(id);
```
When opening a session in terminal, pass the current outlet_id.

### 5. Outlet selector on POS login screen
The POSShell staff login screen should show:
- After entering PIN: "Which location are you working at today?"
- Shows outlet buttons if >1 outlet exists
- Stores selection, passes to terminal

### 6. Outlet API — build if incomplete
`src/app/api/pos/outlets/route.ts` needs GET/POST/PUT:

GET: list all outlets for business
POST: create new outlet
PUT: update outlet (name, address, is_active)

Check current implementation and fill any gaps.

## DB migrations (run via Supabase MCP first)
```sql
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES pos_outlets(id);
CREATE TABLE IF NOT EXISTS pos_outlet_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE,
  stock_quantity numeric DEFAULT 0,
  reorder_point numeric DEFAULT 5,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(outlet_id, product_id)
);
```

## Design
- Outlet switcher in terminal: small pill in header, matches existing header style
- Settings locations section: same card style as other settings sections
- Outlet picker on login: clean buttons, outlet name + address

## Important constraints
- Single outlet businesses (most customers at launch): zero UI change — switcher only shows if >1 outlet exists
- Never break existing single-outlet flow
- The "Global" outlet that already exists must remain the default

## Execution order
1. Run DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build/fix outlets API (GET/POST/PUT)
4. Add locations section to settings page
5. Add outlet switcher to terminal header
6. Wire outlet_id into cash sessions
7. `npx tsc --noEmit` — zero errors
8. `npm run build` — must pass
9. `git add -A && git commit -m "feat: multi-outlet — add/manage locations in settings, outlet switcher in POS terminal, outlet stock + sessions" && git push`
