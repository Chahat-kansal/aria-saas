# Aria OS — Prompt 28: Recipe Import — Paste Link, AI Extracts Recipe
Cafe-only feature. ONE task, ONE commit, ONE push.

## MANDATORY PRE-EDIT CHECKLIST

```
1. pwd → must print C:\Users\kansa\aria-saas-audit — STOP if wrong
2. git pull origin main
3. Read every file listed in STEP 1 IN FULL before writing anything
4. npx tsc --noEmit — ZERO errors before touching anything
5. npm run build — must succeed before touching anything
```

---

## STEP 1 — READ BEFORE WRITING

Read in full:
- `src/components/dashboard/RecipeImportTab.tsx` (if exists)
- `src/app/dashboard/recipes/page.tsx` (if exists)
- Supabase: recipe_imports table — exact columns
- How `business.industry === 'cafe'` gating works in sidebar/pages

recipe_imports table (DO NOT ALTER):
id, business_id, source_url, source_type, title, ingredients (jsonb array),
steps (jsonb array), servings, prep_time_mins, cook_time_mins, notes, ai_extracted (bool), created_at

---

## STEP 2 — CREATE src/app/api/recipes/import/route.ts

POST body `{ url: string }`:
1. Auth + business ownership check
2. Fetch URL content (10s timeout)
3. For Instagram URLs: extract caption from meta og:description or page text
4. For web URLs: extract page body text
5. Call claude-haiku-4-5-20251001:

System: "You are a recipe extraction AI. Extract the recipe from the content provided."
User: "[page content]"
Response format (return ONLY valid JSON):
```json
{
  "title": "Recipe name",
  "ingredients": [{"amount": "2", "unit": "cups", "item": "flour"}],
  "steps": ["Step 1", "Step 2"],
  "servings": 4,
  "prep_time_mins": 15,
  "cook_time_mins": 30,
  "notes": "Any tips"
}
```

6. Insert into recipe_imports with ai_extracted=true
7. Return the extracted recipe

---

## STEP 3 — CREATE src/app/api/recipes/add-to-products/route.ts

POST body `{ recipe_import_id: string }`:
- Load recipe_import, create pos_products row:
  - name = recipe title
  - description = ingredients list + steps joined
  - category = 'Recipe'
- Return new product

---

## STEP 4 — CREATE src/app/api/recipes/compare/route.ts

POST body `{ recipe_import_id: string, product_id: string }`:
- Load both recipe and product
- Call claude-sonnet-4-5-20250929 to compare and suggest improvements
- Return AI comparison text

---

## STEP 5 — RECIPES PAGE

Gate all recipe import UI with `business.industry !== 'cafe'` check.

Add "Import" tab to recipes page (or create /dashboard/recipes if missing):
- URL input + "Import" button
- Shows extracted recipe: title, ingredients, steps
- Two action buttons: "Add as product" + "Compare to existing"
- Import history list from recipe_imports

## CRITICAL RULES

- DB amounts stored as DOLLARS (numeric), never cents
- Model IDs: claude-haiku-4-5-20251001 / claude-sonnet-4-5-20250929 / gemini-2.5-flash-preview-05-20
- Build gate: npx tsc --noEmit + npm run build must pass before commit
- Single commit for the entire task
- vercel.json: never add sub-daily crons
- Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- (Number(x)||0).toFixed(2) for all numeric display

## COMMIT

```
git add -A
git commit -m "feat(...): description"
git push origin main
```

npx tsc --noEmit and npm run build must pass. Then push.
