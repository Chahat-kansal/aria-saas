# Prompt 23 — Shelf Price Ticket Generator + Timed Price Changes

## MANDATORY PRE-EDIT CHECKLIST — do every step before writing a single line of code

```
1. pwd → must print C:\Users\kansa\aria-saas-audit — STOP if wrong
2. git pull origin main
3. Read src/app/dashboard/pos/page.tsx — understand POS page structure
4. Read src/app/dashboard/page.tsx — understand how dashboard sidebar is built
5. Read supabase schema for these tables (exact columns verified — use these, do not guess):

   pos_shelf_ticket_templates columns:
   id (uuid, pk), business_id (uuid), name (text, NOT NULL),
   width_mm (numeric, default 50), height_mm (numeric, default 30),
   show_name (bool, default true), show_price (bool, default true),
   show_sku (bool, default false), show_barcode (bool, default true),
   show_description (bool, default false), show_logo (bool, default true),
   font_size_name (int, default 14), font_size_price (int, default 20),
   background_color (text, default '#ffffff'), text_color (text, default '#000000'),
   accent_color (text, default '#2563eb'), layout (text, default 'standard'),
   is_default (bool, default false), created_at (timestamptz)

   pos_scheduled_price_changes columns:
   id (uuid, pk), business_id (uuid), product_id (uuid),
   current_price (numeric, nullable), new_price (numeric, NOT NULL),
   effective_date (date, NOT NULL), applied (bool, default false),
   applied_at (timestamptz, nullable), created_at (timestamptz)
   NOTE: This table has NO ends_at, NO status, NO label, NO revert_price columns.
   We must ADD these via migration.

   pos_products columns (relevant subset):
   id (uuid), business_id (uuid), name (text), sku (text), barcode (text),
   description (text), price (numeric, stored as DOLLARS not cents),
   image_url (text), brand (text), size (text), volume (numeric), volume_unit (text),
   alcohol_percentage (numeric)

   businesses columns (relevant subset):
   id (uuid), user_id (uuid), trading_name (text), name (text), logo_url (text)

6. npx tsc --noEmit — must be ZERO errors before touching anything
7. npm run build — must succeed before touching anything
```

---

## STEP 1 — DB MIGRATION

### Migration A: Extend pos_scheduled_price_changes

The existing table is missing the columns we need for timed/auto-revert behaviour. Add them:

```sql
-- migration name: extend_pos_scheduled_price_changes_timed
alter table pos_scheduled_price_changes
  add column if not exists ends_at timestamptz,
  add column if not exists original_price numeric(10,2),
  add column if not exists label text,
  add column if not exists print_ticket boolean default false,
  add column if not exists status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled'));

-- Update existing rows so they have a status
update pos_scheduled_price_changes 
  set status = case when applied then 'completed' else 'scheduled' end
  where status = 'scheduled';

-- Index for the cron
create index if not exists idx_pos_spc_status_effective 
  on pos_scheduled_price_changes(status, effective_date);
create index if not exists idx_pos_spc_status_ends 
  on pos_scheduled_price_changes(status, ends_at);

-- RLS: check if already enabled, if not enable it
alter table pos_scheduled_price_changes enable row level security;

-- Policy: owner can do everything
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'pos_scheduled_price_changes' and policyname = 'owner_all'
  ) then
    execute 'create policy owner_all on pos_scheduled_price_changes for all using (
      business_id in (select id from businesses where user_id = auth.uid())
    )';
  end if;
end $$;
```

### Migration B: Extend pos_shelf_ticket_templates

The existing table needs extra columns for our advanced builder:

```sql
-- migration name: extend_pos_shelf_ticket_templates_advanced
alter table pos_shelf_ticket_templates
  add column if not exists band_color text default '#374151',
  add column if not exists band_text_color text default '#ffffff',
  add column if not exists band_label text default 'PRICE',
  add column if not exists price_color text default '#111827',
  add column if not exists show_was_price boolean default false,
  add column if not exists show_save_badge boolean default false,
  add column if not exists show_member_price boolean default false,
  add column if not exists show_per_unit boolean default false,
  add column if not exists show_multibuy boolean default false,
  add column if not exists show_valid_date boolean default false,
  add column if not exists show_promo_band boolean default true,
  add column if not exists ticket_type text default 'standard'
    check (ticket_type in ('standard','special','member','multibuy','clearance','premium')),
  add column if not exists paper_type text default 'label'
    check (paper_type in ('label','card','thermal','poster')),
  add column if not exists corner_radius int default 0,
  add column if not exists canvas_elements jsonb default '[]'::jsonb,
  add column if not exists updated_at timestamptz default now();

-- RLS: check if enabled
alter table pos_shelf_ticket_templates enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'pos_shelf_ticket_templates' and policyname = 'owner_all'
  ) then
    execute 'create policy owner_all on pos_shelf_ticket_templates for all using (
      business_id in (select id from businesses where user_id = auth.uid())
    )';
  end if;
end $$;
```

---

## STEP 2 — Vercel cron for auto-revert

Add ONE cron to vercel.json for the timed price revert. The vercel.json already uses wildcard function patterns so NO function entry is needed — only add to the crons array:

```json
{ "path": "/api/cron/price-schedules", "schedule": "0 * * * *" }
```

**How to add it:** Read vercel.json, parse JSON, push to the crons array, write back. Do not change any existing entries.

### Create src/app/api/cron/price-schedules/route.ts

```typescript
import { createClient } from '@/lib/supabase-admin' // use admin client, NOT user client
import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const now = new Date().toISOString()
  let activated = 0
  let reverted = 0

  // 1. ACTIVATE: scheduled → active when effective_date <= today AND status=scheduled
  const { data: toActivate } = await supabase
    .from('pos_scheduled_price_changes')
    .select('id, product_id, new_price, original_price, business_id')
    .eq('status', 'scheduled')
    .lte('effective_date', new Date().toISOString().split('T')[0])

  for (const row of (toActivate ?? [])) {
    // Store original price before overwriting
    if (!row.original_price) {
      const { data: prod } = await supabase
        .from('pos_products')
        .select('price')
        .eq('id', row.product_id)
        .single()
      if (prod) {
        await supabase
          .from('pos_scheduled_price_changes')
          .update({ original_price: prod.price })
          .eq('id', row.id)
      }
    }
    // Update product price (stored as dollars, numeric)
    await supabase
      .from('pos_products')
      .update({ price: row.new_price, updated_at: now })
      .eq('id', row.product_id)
    // Mark active
    await supabase
      .from('pos_scheduled_price_changes')
      .update({ status: 'active', applied: true, applied_at: now })
      .eq('id', row.id)
    activated++
  }

  // 2. REVERT: active → completed when ends_at <= now
  const { data: toRevert } = await supabase
    .from('pos_scheduled_price_changes')
    .select('id, product_id, original_price')
    .eq('status', 'active')
    .not('ends_at', 'is', null)
    .lte('ends_at', now)

  for (const row of (toRevert ?? [])) {
    if (row.original_price != null) {
      // Revert to original price
      await supabase
        .from('pos_products')
        .update({ price: row.original_price, updated_at: now })
        .eq('id', row.product_id)
    }
    await supabase
      .from('pos_scheduled_price_changes')
      .update({ status: 'completed' })
      .eq('id', row.id)
    reverted++
  }

  console.log(`[price-schedules] activated=${activated} reverted=${reverted}`)
  return NextResponse.json({ activated, reverted, timestamp: now })
}
```

---

## STEP 3 — API routes

### src/app/api/tickets/templates/route.ts

```typescript
// GET: list all templates for authenticated user's business
// POST: create new template
// Both: use createClient() (user client), auth check, business ownership check
// Columns to insert/select: use EXACTLY the columns that exist in pos_shelf_ticket_templates
// Do NOT insert columns that don't exist — refer to column list in Step 1
// Return: { templates: [...] } or { template: {...} }
export const maxDuration = 30
```

### src/app/api/tickets/templates/[id]/route.ts

```typescript
// PUT: update template — only update columns that exist
// DELETE: delete template — verify business ownership first
export const maxDuration = 30
```

### src/app/api/tickets/price-schedules/route.ts

```typescript
// GET: return all schedules for business where status in ('scheduled','active')
// POST: create a new price schedule
//   Validation:
//   - promoPrice > 0
//   - endsAt > startsAt (if endsAt provided)
//   - product belongs to this business
//   - Before inserting: fetch current product price, store as original_price
//   - If effective_date <= today: immediately set product price = promoPrice, status='active'
//   - Otherwise: status='scheduled'
//   Columns to insert (all exist after migration):
//     business_id, product_id, new_price, effective_date (from startsAt date part),
//     ends_at, original_price, label, print_ticket, status
export const maxDuration = 30
```

### src/app/api/tickets/price-schedules/[id]/route.ts

```typescript
// DELETE: cancel a schedule
//   - If status='active' AND original_price is set: revert product price immediately
//   - Set status='cancelled'
//   - Verify business ownership before any action
export const maxDuration = 30
```

### src/app/api/tickets/generate/route.ts

```typescript
// POST: generate PDF of tickets for selected products + template
// Body: { productIds: string[], templateId: string, copies: number, priceOverrides?: Record<string,number> }
// 
// IMPORTANT: Do NOT use puppeteer/chromium — Vercel serverless doesn't support it reliably
// Instead: generate an HTML string and return it with Content-Type: text/html
// The client will open this in a new tab — the browser's Ctrl+P will print it
// 
// HTML must:
//   1. Load the template settings from pos_shelf_ticket_templates
//   2. Load product data from pos_products for each productId
//   3. Render tickets as HTML divs with print CSS (@media print { ... })
//   4. Include: @page { size: {width_mm}mm {height_mm}mm; margin: 0 }
//   5. Each ticket rendered as a div with exact mm dimensions
//   6. Price shown as (Number(price) || 0).toFixed(2) — ALWAYS dollars, never cents
//   7. If priceOverrides[productId] exists, use that price on the ticket (NOT in DB)
//   8. Repeat each ticket `copies` times
// Return: Response with Content-Type: text/html
export const maxDuration = 30
```

---

## STEP 4 — Page and components

### src/app/dashboard/price-tickets/page.tsx

Server component. Fetch:
```typescript
// Get authenticated user
// Get business (select: id, trading_name, name, logo_url, user_id)
// Verify business.user_id === user.id
// Get products: from('pos_products').select('id,name,sku,barcode,price,description,brand,volume,volume_unit,alcohol_percentage,image_url').eq('business_id',business.id).eq('is_active',true).order('name')
// Get templates: from('pos_shelf_ticket_templates').select('*').eq('business_id',business.id).order('created_at')
// Get active schedules: from('pos_scheduled_price_changes').select('*').eq('business_id',business.id).in('status',['scheduled','active']).order('created_at',{ascending:false})

// Render: <PriceTicketApp business={business} products={products} templates={templates} activeSchedules={activeSchedules} />
```

### src/components/tickets/PriceTicketApp.tsx

Client component — the advanced ticket builder exactly as shown in the mockup.

**Three tabs:** Design canvas | Timed prices | Print

**Design canvas tab:**

Left panel:
- 6 preset thumbnails (Standard, Supermarket Special, Member Price, Multi-buy, Clearance, Dark Premium)
  - Clicking a preset rebuilds the canvas with those colours
  - Preset colour schemes:
    - standard: bg=#ffffff, band=#374151, bandText=#ffffff, price=#111827
    - woolies (supermarket special): bg=#ffffff, band=#00853F, bandText=#FFD700, price=#111827
    - coles (member price): bg=#ffffff, band=#D41227, bandText=#ffffff, price=#111827
    - multibuy: bg=#1a4a7a, band=#FFD700, bandText=#111827, price=#FFD700
    - clearance: bg=#D41227, band=#111827, bandText=#ffffff, price=#ffffff
    - premium: bg=#111827, band=#374151, bandText=#9ca3af, price=#ffffff
- Ticket size selector — 6 sizes. Selecting a size RESIZES the canvas AND rescales all elements proportionally:
  - Shelf edge: canvas 580×90px in UI (proportional to 580×90mm)
  - Standard (default): 283×198px
  - Small label: 200×141px
  - A6 promo: 397×283px
  - A4 poster: 566×800px
  - A0 poster: shows at 400×566px with zoom set to 47%
- Add element list: 9 elements (Promo band, Product name, Price block, Barcode+SKU, Member price, Per-unit price, Multi-buy deal, Valid until, Free text)
- AI design layer box: input + "Go" button → sends to Anthropic API with business context → returns design suggestion → Apply/Dismiss

**Canvas (middle):**
- White/coloured sheet at selected size, with a zoom transform applied
- Elements are positioned absolutely, draggable (mousedown+mousemove+mouseup)
- Elements are resizable (bottom-right corner handle)
- Click to select (dashed border appears)
- Click background to deselect
- Toolbar: Add, Delete, Forward, Back, Zoom-/Val/Zoom+, Fit, Ask Aria button

**Right panel:**
- "Select an element to edit" when nothing selected
- When element selected: position/size inputs + element-specific controls (colour pickers, text inputs)
- Canvas background colour swatches + custom colour input
- Layers list (all elements, click to select)

**Canvas rescaling when size changes:**
```typescript
function setSize(sizeKey: string) {
  const newW = SIZE_CONFIGS[sizeKey].w
  const newH = SIZE_CONFIGS[sizeKey].h
  const scaleX = newW / canvasW
  const scaleY = newH / canvasH
  // Rescale all existing elements
  setElements(prev => prev.map(el => ({
    ...el,
    x: Math.round(el.x * scaleX),
    y: Math.round(el.y * scaleY),
    w: Math.round(el.w * scaleX),
    h: Math.round(el.h * scaleY),
  })))
  setCanvasW(newW)
  setCanvasH(newH)
  setZoom(fitZoom(newW, newH))
}
```

**Timed prices tab:**

Left panel:
- AI suggestions box (3 suggestions based on business data)
  - Each suggestion: product name, promo price, period, rationale
  - Tap to prefill the scheduler form
- Schedule form:
  - Product selector (from props.products)
  - Current price (read-only, populated from selected product.price)
  - Promo price input
  - Label input (e.g. "Weekend sale")
  - Starts datetime-local input
  - Ends datetime-local input
  - AI rationale display (appears when suggestion tapped)
  - "Schedule · auto-reverts" button → POST /api/tickets/price-schedules
  - "Print ticket too" button (checkbox-style toggle, saves print_ticket=true)
- Active schedules list (from props.activeSchedules)

AI suggestions: call Anthropic API with the business product list and sales context. Prompt:
```
You are Aria, an AI business advisor for Australian small businesses.
Business: {business.trading_name}
Products and prices: {products.map(p => `${p.name}: $${p.price}`).join(', ')}
Active schedules: {activeSchedules.length} already scheduled

Suggest 3 specific timed price promotions for this week. For each, return JSON:
{ product_name, promo_price, starts, ends, label, rationale }
Focus on: products that sell well, weekend timing, clearing slow stock.
Return ONLY a JSON array of 3 objects, no other text.
```
Use model: claude-haiku-4-5-20251001. Wrap in try/catch. Show fallback suggestions if API fails.

**Print tab:**

Left panel:
- Product checklist (all products, checkbox each)
- Copies selector
- Paper type selector
- Template selector (from props.templates)

Right panel (canvas area shows print preview):
- Settings summary
- "Print N tickets" button → POST /api/tickets/generate → opens returned HTML in new tab
- "Save template first" reminder if no templates exist

**Save template:** "Save template" button in topbar → POST /api/tickets/templates with current canvas state mapped to pos_shelf_ticket_templates columns

---

## STEP 5 — Add sidebar nav item

Find where the dashboard sidebar links are defined. Add "Price Tickets" with icon `ti-tag` linking to `/dashboard/price-tickets`. Position it between POS and Reports (or after Customers). Do not remove or reorder any existing items.

---

## STEP 6 — Aria Intelligence hook

In the ticket generate flow, log to aria_ai_calls:
```typescript
await supabase.from('aria_ai_calls').insert({
  business_id: businessId,
  agent_key: 'ticket_generator',
  provider: 'internal',
  model_id: 'none',
  role: 'generate',
  success: true,
  request_summary: `Generated ${productIds.length} tickets using template ${templateId}`,
}).catch(() => {}) // non-fatal
```

---

## CRITICAL RULES

### TypeScript
- `npx tsc --noEmit` must be ZERO errors
- No `any` types in new files
- All Supabase queries typed via the existing Database type if available

### DB amounts — NEVER BREAK THIS
- `pos_products.price` is stored as DOLLARS (numeric), NOT cents
- ALWAYS render prices as: `(Number(price) || 0).toFixed(2)`
- NEVER multiply or divide by 100
- `pos_scheduled_price_changes.new_price` and `original_price` are also DOLLARS

### vercel.json
- Only ADD the single cron entry `{ "path": "/api/cron/price-schedules", "schedule": "0 * * * *" }`
- Do NOT change any existing cron entries
- Do NOT add function entries (wildcards already cover new routes)

### Do NOT touch
- AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- Any existing POS routes or pages
- The council.ts file (Prompt 22 handles that)

### Existing tables — do NOT recreate
- `pos_shelf_ticket_templates` already exists — only ADD columns via migration, never DROP or recreate
- `pos_scheduled_price_changes` already exists — only ADD columns via migration, never DROP or recreate
- Run migrations with `if not exists` guards so they're idempotent

### Model IDs (never change)
- claude-haiku-4-5-20251001
- claude-sonnet-4-5-20250929

### Build gate — MANDATORY
```
npx tsc --noEmit   ← must be zero errors
npm run build      ← must succeed
```

Single commit. All files in one push.
Commit message: "feat(tickets): shelf ticket builder — drag-drop canvas, 6 presets, 6 sizes with rescaling, 9 element types, AI design layer, timed price changes with auto-revert cron, print-to-HTML output"

---

## COMPLETE FILE LIST

Created:
- src/app/dashboard/price-tickets/page.tsx
- src/components/tickets/PriceTicketApp.tsx
- src/app/api/tickets/templates/route.ts
- src/app/api/tickets/templates/[id]/route.ts
- src/app/api/tickets/price-schedules/route.ts
- src/app/api/tickets/price-schedules/[id]/route.ts
- src/app/api/tickets/generate/route.ts
- src/app/api/cron/price-schedules/route.ts

Modified:
- vercel.json (add 1 cron entry only)
- Sidebar nav component (add 1 nav item)

DB migrations run (in this order):
1. extend_pos_scheduled_price_changes_timed
2. extend_pos_shelf_ticket_templates_advanced
