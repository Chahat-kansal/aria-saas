# S28 — Recipes Recime-level
STATUS: ABSENT | MODE: SOLO
Covers: prompts/47

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Sibling-check: `%recipe%`, `%ingredient%`, `%costing%`

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL.
Tables: recipes, recipe_ingredients, pos_products

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('recipes','recipe_ingredients')
ORDER BY table_name, ordinal_position;
```

Fill in results here.

## Full implementation scope

### Core: Recipe Costing Engine
- Ingredient cost pull from pos_products.cost_price (dollars, per unit)
- Recipe card shows: total ingredient cost, portions, cost_per_portion, margin_pct
- Selling price from pos_products.price → margin = (price - cost_per_portion) / price

### Menu Engineering Matrix (Recime feature)
- Classify each recipe: Star / Plowhouse / Puzzle / Dog
  - Star: high margin + high popularity (sales volume)
  - Plowhouse: low margin + high popularity → needs price review
  - Puzzle: high margin + low popularity → needs promotion
  - Dog: low margin + low popularity → consider removing
- Popularity from pos_sale_items (quantity sold per recipe product, last 30d)
- Show 2×2 matrix in /dashboard/recipes

### Recipe Import from Supplier PDF
- POST /api/pos/recipes/import-from-pdf (multipart/form-data)
- Uses vision model (claude-sonnet) to extract: ingredients, quantities, units from PDF
- Creates recipe_ingredients rows
- Log to aria_ai_calls (agent_key='recipe_import_vision', model_id='claude-sonnet-4-5-20250929')

### Scaling Calculator
- "Scale this recipe to N portions" → recalculates all ingredient quantities
- Shows new total cost

### Nutritional Information (optional, beta)
- If ingredients have known nutritional data, compute macros per portion
- Display in recipe card as a collapsible section

## Aria Intelligence Rule
- Dog recipes (low margin + low sales) → upsertAriaAction 'Consider removing [recipe] from menu'
- Puzzle recipes (high margin + low sales) → upsertAriaAction 'Promote [recipe] — high margin, underperforming'
- Recipe import AI → aria_ai_calls log
- Recipe data → business-brain context for Aria's menu optimisation advice

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (15 min max)
- [ ] /dashboard/recipes → cost per portion calculates correctly from pos_products.cost_price
- [ ] Menu engineering matrix shows with correct quadrant assignment
- [ ] Upload a recipe PDF → ingredients extracted; confirm recipe_ingredients rows created
- [ ] Scale recipe to 10 portions → costs update proportionally
- [ ] aria_ai_calls row created for PDF import
- [ ] Dog recipe (low margin + low sales) → aria_action created

## Push
SOLO mode — stop before push. Write reports/sprint-S28-report.md.
