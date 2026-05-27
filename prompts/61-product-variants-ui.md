# Prompt 61 — Product Variants UI: Single → 6-Pack → Carton pricing

## Why this matters
A liquor store owner needs to sell:
- Coopers Pale Ale — Single: $4.50 | 6-pack: $20.00 | Carton (24): $65.00
Each variant has its own price, barcode, and stock level.
A café owner needs:
- Latte — Small: $4.50 | Medium: $5.50 | Large: $6.50
Currently the product add/edit UI only supports one price. This is a critical gap.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/pos/products/page.tsx` — full read (36KB)
2. `cat src/app/api/pos/variants/route.ts` — full read (4KB — API already built)
3. Check DB via Supabase MCP: `pos_product_variants` table — ALL columns
4. `cat src/app/api/pos/products/route.ts` — understand product creation flow
5. Check DB: does `pos_product_variants` have: id, product_id, name, price, barcode, sku, stock_quantity, is_active?

## What to build — additive only, no rewrites

### 1. Variants section in product add/edit modal/form
In the product add or edit UI (wherever products are created/edited in products page):
Add a "Variants & Sizes" section below the main price field.

Show:
- Toggle: "This product has multiple sizes/prices" (default OFF)
- When toggled ON: main price field becomes the default/single price, variants table appears

Variants table:
```
| Size/Name      | Price  | Barcode        | Stock | Actions |
|---------------|--------|----------------|-------|---------|
| Single        | $4.50  | 9300650001234  | 48    | ✏️ 🗑️  |
| 6-Pack        | $20.00 | 9300650001235  | 12    | ✏️ 🗑️  |
| Carton (24)   | $65.00 | 9300650001236  | 3     | ✏️ 🗑️  |
| + Add variant |        |                |       |         |
```

Add variant form (inline, appears when clicking "+ Add variant"):
- Name/size label (text input): "Single", "6-Pack", "Carton", "Small", "Medium", "Large"
- Price (number input)
- Barcode (text input, optional)
- Stock quantity (number input)
- Save / Cancel buttons

### 2. Variant display on product list
In the product list, products with variants show:
- A "V" badge or "3 sizes" indicator
- Click to expand inline showing all variants with prices
- Or show the price range: "$4.50–$65.00"

### 3. Variant selection in POS terminal
When a product with variants is added to cart in the terminal:
- Instead of immediately adding to cart, show a variant picker modal
- Modal shows: product name + all variants as selectable cards
- Each card: size name + price
- Click variant → adds that variant to cart with correct price
- "Quick add" — if barcode scanned matches a variant barcode, skip the picker and add directly

**Where to add in terminal (src/app/pos/(fullscreen)/terminal/page.tsx):**
Find the `addToCart` function and the product click handler.
When product is clicked/scanned:
1. Check if product has variants: `GET /api/pos/variants?product_id={id}`
2. If variants exist and count > 0: show variant picker modal
3. If no variants: add to cart normally (existing behaviour)

Variant picker modal UI:
```tsx
// Show as a bottom sheet or center modal
<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100 }}>
  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#1a1a2e', borderRadius: '20px 20px 0 0', padding: 24 }}>
    <h3>{product.name} — Select size</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
      {variants.map(v => (
        <button key={v.id} onClick={() => addVariantToCart(product, v)}
          style={{ padding: 16, borderRadius: 12, background: '#2a2a4a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>
          <div style={{ fontWeight: 700 }}>{v.name}</div>
          <div style={{ color: '#7FB897', fontSize: 20, fontWeight: 900 }}>${v.price.toFixed(2)}</div>
        </button>
      ))}
    </div>
    <button onClick={() => setVariantModal(null)} style={{ marginTop: 16, width: '100%', padding: 12, borderRadius: 10, background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Cancel</button>
  </div>
</div>
```

### 4. API routes needed
`GET /api/pos/variants?product_id={id}` — already exists in variants route
`POST /api/pos/variants` — create variant
`PUT /api/pos/variants?id={id}` — update variant
`DELETE /api/pos/variants?id={id}` — delete variant
Verify all 4 work correctly in variants route. If any are missing, add them.

### 5. Cart item structure for variants
When a variant is added to cart, the cart item must store:
- `product_id` — the parent product ID
- `variant_id` — the specific variant ID
- `name` — "{product.name} — {variant.name}" e.g. "Coopers Pale Ale — 6-Pack"
- `price` — the variant price, not the parent product price
- `sku`/`barcode` — the variant's own barcode

When sale is saved to `pos_sales` and `pos_sale_items`:
- `pos_sale_items.product_id` = parent product ID
- `pos_sale_items.variant_id` = variant ID (add this column if missing)
- `pos_sale_items.product_name` = full name with variant
- `pos_sale_items.unit_price` = variant price

## DB migrations (run via Supabase MCP first)
```sql
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES pos_product_variants(id);
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS variant_name text;
```

## Design
- Variant picker modal: dark glass, Financial Trust green for prices
- Product list: "3 sizes" badge in sage green
- Add variant form: inline, clean inputs matching existing product form style
- Mobile responsive — works on tablet POS

## Execution order
1. Run DB migrations via Supabase MCP
2. Read ALL pre-edit files fully
3. Verify variants API has all 4 methods (GET/POST/PUT/DELETE)
4. Add variants section to products page — additive only
5. Add variant picker modal to terminal — additive only, do NOT modify existing addToCart logic for products without variants
6. `npx tsc --noEmit` — zero errors
7. `npm run build` — must pass
8. `git add -A && git commit -m "feat: product variants — multi-price UI, variant picker in POS terminal, 6-pack/carton/size support" && git push`
