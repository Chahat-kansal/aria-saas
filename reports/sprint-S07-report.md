# Sprint S07 — Recipe Management (Gap Closure)
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS (EXIT:0)
**Commit:** `8529f15d` (4 files, 425 insertions, 1 deletion)

---

## Goal
Close two gaps identified in `prompts/S07-recipe-management.md`:
1. Waste-to-sales impact report card on `/dashboard/recipes` Insights tab
2. "Suggest cheaper alternatives" AI button on recipe detail modal

---

## Gap 1 — Waste-to-sales impact report card ✅

### New API: `GET /api/recipes/waste-impact`

**`src/app/api/recipes/waste-impact/route.ts`**

Three parallel queries (via `supabaseAdmin` to bypass RLS):
- `recipe_waste_log` — sum `waste_cost` per recipe for last 7 days (correct column: `waste_cost`, not `cost_dollars`)
- `recipes` — all active/undeleted recipes with `linked_product_id` and `total_cost`
- `pos_sales` — valid (non-voided) sale IDs for last 7 days

Then a fourth query:
- `pos_sale_items` — `line_total` for sale items matching valid sale IDs AND linked product IDs (correct column: `line_total`, not `total_price`)

Returns:
```json
{
  "period_days": 7,
  "waste_cost_total": 12.50,
  "revenue_total": 345.00,
  "top_waste": [{ "id": "...", "name": "Oat Flat White", "waste_cost": 8.20 }],
  "effective_margins": [{
    "id": "...",
    "name": "Oat Flat White",
    "revenue": 120.00,
    "ingredient_cost": 18.40,
    "waste_cost": 8.20,
    "eff_margin_pct": 78,
    "base_margin_pct": 85
  }]
}
```
Effective margin formula: `(revenue − ingredient_cost − waste_cost) / revenue × 100`

### UI: Waste impact card in `RecipeInsightsTab.tsx`

Added at the top of the Insights tab, above menu optimisation:
- **Two stat boxes**: "Recipe waste cost A$X" (red) vs "Revenue from recipes A$Y" (green)
- **Waste ratio indicator**: "Waste as % of recipe revenue: Z%" — green < 5%, amber 5–10%, red > 10%
- **Top 3 wasteful recipes**: ranked by weekly waste cost
- **Per-recipe effective margin table**: base margin vs waste-adjusted effective margin side by side
- Loads automatically on tab mount (no user action required)
- Graceful empty state: shows instruction to log waste via Waste button

---

## Gap 2 — "Suggest cheaper ingredients" AI button ✅

### New API: `POST /api/aria/recipe-cost-optimiser`

**`src/app/api/aria/recipe-cost-optimiser/route.ts`**

Flow:
1. Auth + ownership check (`businesses.user_id = auth.user.id`)
2. Fetch recipe + `recipe_ingredients` via `supabaseAdmin`
3. Build prompt with ingredient list (names, quantities, costs, wastage %)
4. Call `claude-haiku-4-5-20251001` — returns JSON with 2 substitution suggestions
5. Log to `aria_ai_calls` with `agent_key = 'recipe_cost_optimiser'`
6. If max `estimated_saving_per_unit > A$0.50`: calls `upsertAriaAction` with:
   - `category: 'inventory'`
   - `triggered_by: 'recipe_cost_optimiser:{recipe_id}'`
   - `payload: { recipe_id, suggestions }`
   - Dedup handled by `upsertAriaAction` (title prefix match on `pending` rows)

Returns:
```json
{
  "suggestions": [
    {
      "original_ingredient": "Full cream milk",
      "suggested_substitute": "House-brand UHT milk",
      "reason": "Equivalent in hot drinks, ~30% cheaper from wholesale",
      "estimated_saving_per_unit": 0.80
    }
  ]
}
```

### UI: "✦ Suggest cheaper ingredients" button in recipe detail modal

**`src/app/dashboard/recipes/page.tsx`**

Added two state values:
- `costOptimising: string | null` — recipe ID currently being optimised
- `costSuggestions: { recipeId: string; suggestions: [...] } | null` — last result

Added `suggestCheaperIngredients(recipeId)` handler (POST to new route).

In detail modal, above the Actions row:
- Sage green "✦ Suggest cheaper ingredients" button (spinner while loading)
- On result: each suggestion shown as a card with:
  - `Swap [original] → [substitute]`
  - `Save A$X.XX/unit` badge (green, shown when > 0)
  - Reason text in dim style

---

## Schema changes
None — `recipe_waste_log` with `waste_cost` + `wasted_quantity` already existed.

---

## Files changed

| File | Change |
|---|---|
| `src/app/api/recipes/waste-impact/route.ts` | New — GET waste-to-sales impact aggregation |
| `src/app/api/aria/recipe-cost-optimiser/route.ts` | New — POST AI ingredient substitution suggestions |
| `src/components/dashboard/RecipeInsightsTab.tsx` | Add waste impact card (auto-loads on mount) |
| `src/app/dashboard/recipes/page.tsx` | Add Suggest cheaper state + button + results panel to detail modal |

---

## Column correctness (per RULE 6)
- `recipe_waste_log.waste_cost` ✅ (not `cost_dollars`)
- `recipe_waste_log.wasted_quantity` ✅ (not `quantity`)
- `pos_sale_items.line_total` ✅ (not `total_price`)
- `pos_sales` filter: `status != 'voided'` ✅
- `supabaseAdmin` for all server-side reads ✅
- Ownership check on every route ✅

---

## Aria Intelligence integration
- `aria_ai_calls` logged for every `recipe-cost-optimiser` call with `agent_key='recipe_cost_optimiser'`
- `aria_action` upserted (via `upsertAriaAction`) when saving > A$0.50/unit → appears in `/dashboard/autopilot` pending queue
- Model: `claude-haiku-4-5-20251001` ✅

---

## Founder verify checklist (5 min max)

- [ ] Open `/dashboard/recipes` → Insights tab → waste impact card shows (even if zeroes)
- [ ] Log waste on a recipe, reload Insights tab → waste cost updates
- [ ] Open a recipe detail modal → "✦ Suggest cheaper ingredients" button visible
- [ ] Click it → spinner → 2 suggestion cards appear with ingredient names and saving estimates
- [ ] Check Supabase `aria_ai_calls` → new row with `agent_key='recipe_cost_optimiser'`
- [ ] If saving > A$0.50/unit → check `aria_actions` for new pending row with `category='inventory'`

---

## Push instruction
```
git push origin main
git log origin/main..HEAD   # must be empty
```
