# Prompt 103 — Recipe Import: Full Feature to Category-Leading Standard


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

Tables exist: recipes, recipe_ingredients, recipe_imports. Build the complete feature.
Competitor benchmark: RecipeCosting.com, Apicbase, Meez — Aria must match 80%+ of their core features.
Read CLAUDE.md first.

## Pre-flight (MANDATORY — read CLAUDE.md first)
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
Read CLAUDE.md. Read every file you will edit before touching it.
One commit per task. After every commit: git push origin main, then confirm git log origin/main..HEAD is empty.
State "Build verified green, all commits pushed." before finishing.

## UPGRADE-ONLY RULE
Never remove, stub, or downgrade any existing feature. Fix forward only.

## ARIA INTELLIGENCE RULE (applies to every task)
Every new feature must:
1. Write relevant data to aria_ai_calls (log AI usage)
2. Feed insights back into the daily briefing context (update buildAskAriaContext or daily-briefing route to include new data)
3. Log significant actions to aria_autopilot_actions
4. Use claude-haiku-4-5-20251001 unless the task requires complex reasoning (then claude-sonnet-4-5-20250929)


## TASK 1 — Import API (CSV, PDF, image)
File: src/app/api/pos/recipes/import/route.ts
POST multipart: { file: CSV|PDF|image, business_id }

CSV format: name, ingredients (semicolon-separated), quantities, units, yield, cost_per_serving, category
PDF: use pdf-parse to extract text. AI parses recipe blocks (name, ingredients, method). Model: haiku vision.
Image: base64 → haiku vision → extract structured recipe data.

For each parsed recipe:
1. Insert into recipes: { business_id, name, yield_qty, yield_unit, notes, source: 'import', category }
2. For each ingredient: fuzzy match to pos_products by name (use ilike '%name%')
3. Insert recipe_ingredients: { recipe_id, product_id, product_name, quantity, unit, cost_per_unit }
4. Calculate recipe.total_cost = SUM(quantity * cost_per_unit)
5. Calculate recipe.cost_per_serving = total_cost / yield_qty
6. Insert recipe_imports: { business_id, file_name, rows_imported, rows_failed, imported_at }

Return { imported, failed, recipes: [{ name, total_cost, cost_per_serving, ingredient_count }] }
Log import to aria_ai_calls.
Commit: "feat(recipes): import CSV/PDF/image with AI parsing + cost calculation"

## TASK 2 — Recipe CRUD API
src/app/api/pos/recipes/route.ts — GET (list with cost/margin) + POST (create manual)
src/app/api/pos/recipes/[id]/route.ts — GET (full detail) + PATCH (update) + DELETE (soft delete)
src/app/api/pos/recipes/[id]/cost/route.ts — GET: recalculate cost from CURRENT product prices
src/app/api/pos/recipes/[id]/scale/route.ts — POST { servings }: scale all ingredient quantities proportionally

GET list includes: total_cost, cost_per_serving, margin (if linked_product_id set), ingredient_count, last_costed_at
Commit: "feat(recipes): CRUD API + cost recalc + portion scaling"

## TASK 3 — Recipe → product link + margin tracking
PATCH /api/pos/recipes/[id]: accept { linked_product_id }
When linked:
- recipe.margin = (product.price - recipe.total_cost) / product.price * 100
- recipe.suggested_price = total_cost / (1 - 0.65) — price for 65% gross margin
- Alert if margin < 30% — low margin warning in briefing
- Alert if product price hasn't been updated since recipe costs changed > 10%

Add recipe.last_cost_updated_at column. When ingredient product prices change (pos/products PATCH), recalculate linked recipe costs.
Commit: "feat(recipes): product link, margin calc, suggested pricing, auto-recost on price change"

## TASK 4 — Wastage + allergen tracking
Add to recipe_ingredients: wastage_pct (default 0) — accounts for trimming, cooking loss.
effective_cost_per_unit = cost_per_unit * (1 + wastage_pct / 100)

Add to recipes: allergens (text array) — auto-detected from ingredient names (contains: gluten, dairy, nuts, eggs, shellfish, soy).
When recipe is saved, AI scans ingredient names → sets allergens array.
Model: haiku.
Commit: "feat(recipes): wastage percentage + allergen auto-detection"

## TASK 5 — Dashboard UI (full Apicbase-level)
src/app/dashboard/recipes/page.tsx — full UI:

Header bar: total recipes | avg margin | recipes below 30% margin | last import date
Import area: drag-drop with CSV/PDF/image icons, progress bar, import summary
Recipe grid cards: name | cost per serving | margin % badge (green/amber/red) | yield | category | last costed
Recipe detail drawer (slide-over):
  - Ingredient table: name | qty | unit | unit cost | wastage | effective cost | matched product
  - Cost breakdown: ingredient cost | wastage | total | suggested sell price | current price | margin
  - Allergen badges
  - "Scale to X servings" input
  - "Recalculate costs" button
  - "Link to product" selector
  - "Export as PDF" button
Filter bar: by category, by margin tier (healthy >50% / warning 30-50% / critical <30%), by allergen
Low margin alert banner: "3 recipes have margin below 30% — prices may need updating"

Feed into Aria: add recipe cost summary to daily briefing (recipes with margin < 30%, recently imported).
Commit: "feat(recipes/dashboard): full recipe management UI — import, margins, allergens, scaling"

## DB columns
recipes: id, business_id, name, yield_qty, yield_unit, notes, total_cost, cost_per_serving, margin, suggested_price, linked_product_id, source, category, allergens, last_cost_updated_at, created_at, deleted_at
recipe_ingredients: id, recipe_id, product_id, product_name, quantity, unit, cost_per_unit, wastage_pct
recipe_imports: id, business_id, file_name, rows_imported, rows_failed, imported_at

## Rules
- Vision/AI: claude-haiku-4-5-20251001
- All costs in dollars (numeric, not cents)
- All migrations via Supabase MCP (apply_migration tool)
- npx tsc --noEmit + npm run build before each commit
