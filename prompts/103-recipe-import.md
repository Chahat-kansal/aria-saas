# Prompt 103 — Recipe Import (Full Feature)

Tables already exist: recipes, recipe_ingredients, recipe_imports. Build the full feature.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```

## TASK 1 — Import API
Create src/app/api/pos/recipes/import/route.ts
POST multipart form: { file: CSV|PDF|image, business_id }
Supports:
- CSV: columns = name, ingredients (comma-separated), quantities, units, yield, cost
- PDF: extract text with pdf-parse, parse recipe blocks with AI
- Image: base64 → claude-haiku vision → extract recipe fields

For each recipe row/block:
1. Insert into recipes: { business_id, name, yield_qty, yield_unit, notes, source: 'import' }
2. For each ingredient: match to pos_products by name similarity (use pg_trgm or simple ilike)
3. Insert recipe_ingredients: { recipe_id, product_id, product_name, quantity, unit, cost_per_unit }
4. Calculate recipe.total_cost = sum of ingredient costs
5. Insert recipe_imports: { business_id, file_name, rows_imported, rows_failed, imported_at }

Return { imported: N, failed: N, recipes: [...] }
Commit: "feat(recipes): import from CSV/PDF/image with AI parsing"

## TASK 2 — Recipe management API
### src/app/api/pos/recipes/route.ts
GET: list recipes with total_cost, margin (if linked to a product price), ingredient count
POST: create recipe manually

### src/app/api/pos/recipes/[id]/route.ts
GET: recipe detail with full ingredient list + matched products
PATCH: update name, yield, notes
DELETE: soft delete

### src/app/api/pos/recipes/[id]/cost/route.ts
GET: recalculate cost from current product prices (prices change — recipe costs need refresh)
Commit: "feat(recipes): full CRUD API + live cost recalculation"

## TASK 3 — Recipe → product link
PATCH /api/pos/recipes/[id]: accept { linked_product_id }
When linked:
- recipe.margin = (product.price - recipe.total_cost) / product.price * 100
- Show margin on recipe card
- Alert if margin < 30% (low margin warning)
Commit: "feat(recipes): link recipe to product for margin calculation"

## TASK 4 — Dashboard UI
Create src/app/dashboard/recipes/page.tsx (or add to existing if it exists)
- Import button: drag-drop CSV/PDF/image upload
- Recipe cards: name | cost | yield | margin | ingredient count
- Recipe detail modal: ingredient table with matched product + unit cost
- "Recalculate costs" button (calls /cost endpoint)
- Low margin alert banner if any recipe < 30%
- Empty state: "Import your first recipe — CSV, PDF, or photo"
Commit: "feat(recipes/dashboard): full recipe management UI"

## DB columns
recipes: id, business_id, name, yield_qty, yield_unit, notes, total_cost, linked_product_id, source, created_at
recipe_ingredients: id, recipe_id, product_id (nullable), product_name, quantity, unit, cost_per_unit
recipe_imports: id, business_id, file_name, rows_imported, rows_failed, imported_at

## Rules
- Vision calls: claude-haiku-4-5-20251001 (cheapest with vision)
- All costs stored as dollars (numeric)
- npx tsc --noEmit + npm run build before each commit
