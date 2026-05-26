# Prompt 47 — Recipes: ReciMe + Deputy Recipes-Level Pro Upgrade

## Category leader bar
ReciMe: recipe import, cost calculation per recipe, ingredient-to-supplier mapping, scaling, allergen tagging, nutritional info.
Deputy Recipes: production planning, yield tracking, waste logging.
Aria must match 80% AND add AI differentiation. Cafe businesses only.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/recipes/page.tsx` — full read (23KB)
2. `cat src/app/api/recipes/route.ts` — full read
3. `cat src/components/dashboard/RecipeImportTab.tsx` — full read
4. `cat src/app/api/recipes/import/route.ts` — full read
5. Check DB via Supabase MCP: `recipes`, `recipe_ingredients`, `recipe_imports` — ALL columns
6. `cat src/app/api/pos/products/route.ts` — product catalogue pattern
7. `cat src/app/api/pos/suppliers/route.ts` — supplier data pattern
8. Check if `pos_suppliers` table exists and has product pricing data

## AI differentiation (what beats ReciMe)
- **AI recipe analysis**: paste any recipe → Aria extracts ingredients, suggests supplier for each, estimates total cost, warns about allergens
- **Profit margin calculator**: given recipe cost + your menu price → Aria shows margin and benchmarks vs industry
- **AI scaling intelligence**: scale recipe from 4 to 40 → Aria flags which ingredients don't scale linearly (spices, salt, baking powder) and adjusts
- **Menu optimisation**: Aria analyses all recipes vs their sales velocity → "Your croissant has 68% margin but only 12 sales/week — promote it more"

## Features to build — no stubs, no TODOs

### 1. Recipe cost calculation
Each recipe has a "Cost calculator" section.
For each ingredient: name + quantity + unit + cost per unit = line total.
Total recipe cost = sum of ingredient costs.
Cost per serve = total cost / servings.
Profit margin = (menu price - cost per serve) / menu price × 100%
Show: traffic light margin indicator — green >70%, amber 40-70%, red <40%
Store: `cost_per_serve numeric`, `menu_price numeric`, `margin_percent numeric` on recipes table.

### 2. Ingredient-to-supplier mapping
Each ingredient has a "supplier" dropdown.
Options: pull from `pos_suppliers` table + manual entry.
Store `supplier_id` on recipe ingredients.
If supplier has pricing in system → auto-fill cost per unit.
Shows: "Last price from ALM: $2.40/kg — updated 3 days ago"
Aggregate: "Total weekly ingredient cost for this recipe based on sales volume: $340"

### 3. Allergen tagging
Each recipe: multi-select allergen tags.
Australian standard allergens: Gluten, Dairy, Eggs, Nuts, Peanuts, Sesame, Soy, Fish, Shellfish, Lupin, Sulphites.
Show allergen pills on recipe card: 🌾 Gluten | 🥛 Dairy etc.
Filter recipes by allergen: "Show me gluten-free recipes"
On public menu (future): auto-shows allergens per item.
Store as array: `allergens text[]` on recipes.

### 4. Recipe scaling with AI intelligence
"Scale recipe" button on each recipe.
Input: target servings (current is X, scale to Y).
Basic scaling: multiply all ingredients by Y/X.
AI intelligence layer: call Claude Haiku with ingredient list + scale factor.
AI flags: "Baking powder doesn't scale linearly — recommend X tsp for Y servings instead of calculated Z tsp"
"Salt is to taste — suggest starting with X and adjusting"
Log to `aria_ai_calls`.
Show scaled recipe in preview before saving.

### 5. Production planning
New "Production" tab.
Weekly production schedule: for each recipe, how many to make each day.
Based on: average daily sales of the linked product from `pos_sales`.
Shows: "Based on last 4 weeks, you sell ~23 croissants on Saturdays. Produce 25 to allow for variance."
Input override: manager can adjust quantity.
Print production sheet: clean printable view of what to make and how much.

### 6. Waste logging
On each recipe: "Log waste" button.
Enter: date + quantity wasted + reason (overproduction, quality fail, expired).
Store in `recipe_waste_log` table:
```sql
CREATE TABLE IF NOT EXISTS recipe_waste_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  recipe_id uuid REFERENCES recipes(id),
  wasted_quantity numeric,
  unit text,
  reason text,
  waste_cost numeric,
  logged_at timestamptz DEFAULT now()
);
```
Show waste summary: "This week you wasted $120 of croissants — 18% of production"
Aria AI suggestion: "Consider reducing Saturday production by 3 units to cut waste"

### 7. Menu optimisation AI
New "Insights" tab.
Aria analyses all recipes vs their linked product sales:
- High margin + high sales = Stars ⭐ (keep, promote)
- High margin + low sales = Hidden gems 💎 (promote more)
- Low margin + high sales = Workhorses 🐴 (review pricing or ingredients)
- Low margin + low sales = Review 🔴 (consider removing)
2x2 matrix visualisation (scatter plot).
AI recommendation per recipe: "Raise the price of your muffin by $0.50 — still competitive but adds $180/month revenue"
Log to `aria_ai_calls`.

## DB migrations (run via Supabase MCP FIRST)
```sql
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cost_per_serve numeric;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS menu_price numeric;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS margin_percent numeric;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS allergens text[] DEFAULT '{}';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS linked_product_id uuid;
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  unit text,
  cost_per_unit numeric,
  supplier_id uuid,
  allergens text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recipe_waste_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  recipe_id uuid REFERENCES recipes(id),
  wasted_quantity numeric,
  unit text,
  reason text,
  waste_cost numeric,
  logged_at timestamptz DEFAULT now()
);
```

## Routes to build
- `src/app/api/recipes/ingredients/route.ts` — CRUD for recipe ingredients
- `src/app/api/aria/recipe-scale/route.ts` — AI scaling intelligence
- `src/app/api/aria/menu-optimisation/route.ts` — AI menu insights
- `src/app/api/recipes/waste/route.ts` — waste log CRUD

## Page structure (tabs)
**Recipes** | **Production** | **Insights** | **Import** (existing)
Keep existing import tab exactly as is.

## Design
- Recipe cards: dark glass surface, allergen pills in coloured chips
- Cost section: clean table layout with margin traffic light
- Scatter plot: recharts ScatterChart, x=margin, y=sales velocity
- Waste log: timeline view, red highlights for high-waste days

## Quality bar
Cost calculator must match ReciMe. AI scaling must be smarter than anything ReciMe offers.

## Execution order
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build recipe ingredients CRUD route
4. Build AI scaling route (log to aria_ai_calls)
5. Build menu optimisation route (log to aria_ai_calls)
6. Build waste log route
7. Upgrade `src/app/dashboard/recipes/page.tsx` — additive, keep existing import tab
8. `npx tsc --noEmit` — zero TS errors
9. `npm run build` — must pass
10. `git add -A && git commit -m "feat: recipes — cost calculation, supplier mapping, allergen tagging, AI scaling, production planning, waste log, menu optimisation AI" && git push`
