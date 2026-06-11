# S07 — Recipe Management
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/12, 28, 47
Missing: waste-to-sales revenue impact reporting, AI cost optimiser (suggests cheaper substitutes)

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Sibling-check: `%recipe%`, `%ingredient%`, `%waste%`

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL.
Tables: recipes, recipe_ingredients, pos_products, recipe_waste_log (if exists), business_expenses

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('recipes','recipe_ingredients')
ORDER BY table_name, ordinal_position;
```

Fill in results here.

## Gap closure scope

### Gap 1 — Waste-to-sales impact report
- Query `recipe_waste_log` (confirm table exists) + `pos_sales` for recipe-linked products
- Dashboard card in /dashboard/recipes: "This week's recipe waste cost: $X" vs "Revenue from recipe products: $Y"
- Margin per recipe = (revenue - ingredient cost - waste cost) / revenue
- If recipe_waste_log doesn't exist: create it via migration:
  ```sql
  CREATE TABLE recipe_waste_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid REFERENCES businesses NOT NULL,
    recipe_id uuid REFERENCES recipes NOT NULL,
    quantity numeric NOT NULL,
    cost_dollars numeric NOT NULL,
    reason text,
    logged_at timestamptz DEFAULT now(),
    logged_by text
  );
  ```

### Gap 2 — AI cost optimiser
- Button: "Suggest cheaper alternatives" on recipe detail page
- Calls claude-haiku with: recipe name, current ingredients + costs, business industry
- Returns: top 2 substitution suggestions with estimated cost saving
- Log to aria_ai_calls (agent_key='recipe_cost_optimiser')
- upsertAriaAction if saving > $0.50/unit: category='inventory', title='Recipe cost opportunity'

## Aria Intelligence Rule
- Waste log → feed into aria_daily_briefings next day (top recipe waste item)
- AI suggestions → aria_ai_calls + upsertAriaAction
- Recipe margin data → business-brain context for pricing agent

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] /dashboard/recipes → waste cost card shows (or $0.00 if no waste logged)
- [ ] Log waste manually → waste_log row created, cost updates in card
- [ ] "Suggest cheaper alternatives" button → 2 suggestions returned; no raw JSON visible
- [ ] aria_ai_calls entry created for recipe optimiser call
- [ ] Recipe with logged waste → aria_action created if saving > $0.50

## Push
SOLO mode — stop before push. Write reports/sprint-S07-report.md.
