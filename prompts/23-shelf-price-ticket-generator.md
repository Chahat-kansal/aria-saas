# Prompt 23 — Shelf Price Ticket Generator

## Pre-edit checklist
- [ ] pwd confirm: C:\Users\kansa\aria-saas-audit
- [ ] Read full repo tree
- [ ] Read src/app/dashboard/pos/page.tsx (reference for POS UI patterns)
- [ ] Read supabase schema: pos_products, businesses tables
- [ ] Read vercel.json (confirm function count stays at 22 — new routes must fit)
- [ ] npx tsc --noEmit clean before starting

## What to build

A full price ticket generator: template builder, product selector, print output, promo tickets, and timed price changes that auto-revert.

---

## DB Migration — run first

```sql
-- Ticket templates
create table if not exists pos_ticket_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  style jsonb not null default '{}'::jsonb,
  -- style: { bg_color, text_color, accent_color, show_barcode, show_sku, show_logo, show_gst, ticket_type }
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table pos_ticket_templates enable row level security;
create policy "owner" on pos_ticket_templates for all using (
  business_id in (select id from businesses where owner_id = auth.uid())
);

-- Timed price changes (auto-revert)
create table if not exists pos_price_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references pos_products(id) on delete cascade,
  original_price numeric(10,2) not null,
  promo_price numeric(10,2) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','active','completed','cancelled')),
  label text, -- e.g. "Weekend sale", "Happy hour"
  print_ticket boolean default true,
  created_at timestamptz default now()
);
alter table pos_price_schedules enable row level security;
create policy "owner" on pos_price_schedules for all using (
  business_id in (select id from businesses where owner_id = auth.uid())
);
create index on pos_price_schedules(status, starts_at);
create index on pos_price_schedules(status, ends_at);
```

---

## Vercel cron — price schedule activator

Add to vercel.json crons array (daily check is sufficient — use `0 * * * *` for hourly):
```json
{ "path": "/api/cron/price-schedules", "schedule": "0 * * * *" }
```

IMPORTANT: vercel.json currently has exactly 22 functions. Add this cron path to the functions object too with maxDuration: 30.

### src/app/api/cron/price-schedules/route.ts

```typescript
// Activates scheduled price changes and reverts expired ones
// Runs hourly via Vercel cron
export const maxDuration = 30

GET handler:
1. Verify cron secret header
2. Find all pos_price_schedules where status='scheduled' AND starts_at <= now() 
   → update pos_products.price = promo_price, set status='active'
3. Find all pos_price_schedules where status='active' AND ends_at <= now()
   → update pos_products.price = original_price, set status='completed'
4. Log count of activations + completions
5. Return { activated: N, completed: N }
```

---

## Pages and components

### src/app/dashboard/price-tickets/page.tsx
Server component. Fetches:
- businesses record (for branding — name, logo_url)
- pos_products where business_id = X (for product selector)
- pos_ticket_templates where business_id = X
- pos_price_schedules where business_id = X and status in ('scheduled','active')

Renders `<PriceTicketApp>` client component with all data as props.

### src/components/tickets/PriceTicketApp.tsx
Three-tab client component:

**Tab 1 — Design**
- Left panel: template grid (5 presets + "Build yours"), ticket size selector, paper type selector, ticket type tags, toggle options
- Right panel: live preview of selected template applied to first 3 products, ticket type badge selector

Template presets:
```typescript
const PRESETS = [
  { id: 'clean-white', name: 'Clean white', bg: '#ffffff', textColor: '#111827', accent: '#111827', labelColor: '#6b7280' },
  { id: 'dark-premium', name: 'Dark premium', bg: '#1a1a2e', textColor: '#ffffff', accent: '#7FB897', labelColor: '#7FB897' },
  { id: 'promo-warm', name: 'Promo warm', bg: '#fff8f0', textColor: '#1a0a00', accent: '#e88a20', labelColor: '#e88a20' },
  { id: 'midnight-blue', name: 'Midnight blue', bg: '#0f172a', textColor: '#ffffff', accent: '#818cf8', labelColor: '#818cf8' },
  { id: 'fresh-green', name: 'Fresh green', bg: '#f0fdf4', textColor: '#14532d', accent: '#16a34a', labelColor: '#16a34a' },
]
```

Sizes: Small (2×1"), Standard (3×2"), Shelf edge (6×1.5"), A6 promo, Custom
Paper: Standard label (self-adhesive), Card stock (free-standing), Promo poster (A6/A5)
Ticket types: Standard price, Promo/sale, New arrival, Best seller, Clearance, Multipack deal

**Tab 2 — Print**
- Left: product checklist (all pos_products, checkbox each, show current price)
- Right: print settings summary, copies-per-ticket selector, optional price override per product (ticket-only, does NOT change POS price — note this clearly), Print button, Export as PDF button

Print button → calls `/api/tickets/generate` → returns PDF blob → browser download
PDF layout: tickets arranged in a grid matching the selected size/paper

**Tab 3 — Timed prices**
- Left: single-select product list
- Right: timed price change form
  - Current price (read-only)
  - Promo price (input, dollars)
  - Starts at (datetime-local)
  - Ends at (datetime-local)
  - Label (optional text, e.g. "Weekend sale")
  - Visual timeline: current price → promo price → auto-reverts to original
  - "Also print a promo ticket for this product" toggle
  - "Schedule this price change" button → POST /api/tickets/price-schedules
  - Active schedules list below (product, promo price, countdown to revert)

---

## API routes

### src/app/api/tickets/generate/route.ts (POST)
Takes: { productIds, templateId, size, paperType, ticketType, priceOverrides, copies }
Returns: PDF blob

Implementation:
- Use puppeteer (already in project if not: install @sparticuz/chromium + puppeteer-core)
- Build HTML for each ticket using the template style
- Print to PDF with correct page size matching ticket dimensions
- Arrange multiple tickets per page where size allows
- Stream PDF as response with Content-Type: application/pdf

### src/app/api/tickets/templates/route.ts (GET, POST)
GET: return all templates for business
POST: create new template

### src/app/api/tickets/templates/[id]/route.ts (PUT, DELETE)
Update or delete a template

### src/app/api/tickets/price-schedules/route.ts (GET, POST)
GET: active + scheduled price schedules for business
POST: create a new price schedule
- Validate: ends_at > starts_at, promo_price > 0, product belongs to business
- If starts_at <= now(): immediately update product price, set status='active'
- Otherwise: set status='scheduled', cron handles it

### src/app/api/tickets/price-schedules/[id]/route.ts (DELETE)
Cancel a schedule — if active, revert product price immediately

---

## Sidebar nav
Add "Price Tickets" to the dashboard sidebar with a ti-tag icon, between POS and Reports

---

## TicketPreview component — src/components/tickets/TicketPreview.tsx
Pure CSS ticket renderer. Takes template style + product + options.
Must render identically in browser preview AND the puppeteer PDF generation.
Use inline styles only (puppeteer doesn't process CSS files).

Ticket anatomy:
- Top section: store name (from business.trading_name), product name, description (pos_products.description)
- Ticket type badge (promo/sale/new arrival etc.) — only if not Standard
- Price: large, accent colour
- If promo: crossed-out original price above the promo price
- Bottom section (separated by dashed line): barcode placeholder, SKU/product code
- Conditionally: GST note, logo

---

## Quality bar — must match or beat Shopify's label printing + add AI
- Shopify: template picker, size picker, bulk print. We match this.
- Aria's edge: timed price changes with auto-revert (Shopify has no equivalent), council can suggest what to put on promo tickets
- Full-SaaS-depth: no placeholder print buttons — actual PDF generation working

## Aria Intelligence rule
- Log ticket generation events to aria_ai_calls with agent_key='ticket_generator'
- Weekly briefing should mention active price schedules ("Shiraz goes on sale Friday at $14.99 — auto-reverts Sunday")

## Amounts
All prices stored as dollars (numeric), NOT cents. (Number(x)||0).toFixed(2) everywhere.

## Build gate
npx tsc --noEmit + npm run build must pass. Single commit for all ticket files.
