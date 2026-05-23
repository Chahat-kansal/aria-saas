# Aria OS — Prompt 12: Recipe Import (Cafes)
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read the existing cafe products table usage (recipes, recipe_ingredients,
pos_products — whichever the cafe menu uses). Read an existing route that
calls Claude. Read how aria_ai_calls is written. Read a /dashboard sub-page
for the UI pattern. Do NOT write code first.

## CONTEXT — DB ALREADY BUILT, do not create/alter tables
recipe_imports: id, business_id, user_id, source_url, source_type
('instagram'|'web'|'other'), extracted_title, extracted_ingredients (jsonb),
extracted_steps (jsonb), extraction_notes, status
('pending'|'extracted'|'added_as_product'|'failed'), linked_product_id,
created_at, updated_at.

## STEP 2 — IMPORT ROUTE
Create src/app/api/recipes/import/route.ts.
- export const runtime = 'nodejs'
- export const dynamic = 'force-dynamic'
- export const maxDuration = 60
- withErrorCapture wrapper to match other routes.

POST handler:
- Supabase auth (401 if no user). Body { source_url }.
- Fetch the URL server-side. Extract usable text: try Open Graph description,
  meta description, page body text, caption. This is CAPTION-BASED — it
  reads the post's text, not video frames. If no usable text found, return
  HTTP 200 with { error: 'no_recipe_found', message: "Couldn't read a recipe
  from this link — try a post that has written ingredients and steps." }
- Send the extracted text to Claude (claude-sonnet-4-5-20250929) with a
  prompt that returns STRICT JSON only (no preamble, no code fences):
  { title: string, ingredients: [{item, quantity, unit}], steps: [string] }
  Parse safely. If Claude can't extract a recipe, return the no_recipe_found
  response above.
- Insert a recipe_imports row. Log the AI call to aria_ai_calls
  (feature='recipe_import'). Return the structured recipe.

## STEP 3 — RECIPES PAGE
Build /dashboard/recipes (cafe only — gate on business.industry === 'cafe'.
For non-cafe businesses, show a clean "this feature is for cafes" notice,
not an error or empty page).

Features:
- A URL input + "Import" button. Show an honest note:
  "Aria reads the post's caption and written description. Videos without
  a written recipe may not import."
- On import, show the extracted recipe card: title, ingredients list,
  numbered steps.
- Two action buttons:
  1. "Add as product" — writes a new product into the cafe products table
     from the extracted recipe. Set recipe_imports.status='added_as_product'
     and linked_product_id.
  2. "Compare to existing recipe" — the owner picks an existing product from
     a dropdown; call Claude to diff the imported recipe vs the current
     product's recipe and return specific improvement suggestions (different
     ingredients, missing steps, better ratios). Show the diff. Log this
     second AI call to aria_ai_calls (feature='recipe_compare').
- A history list of past imports (from recipe_imports) below the import form.

## AI RULES
- Every AI call logs to aria_ai_calls with model + token counts
- AI extracts and compares — it never auto-adds products, the owner clicks

## UI RULES (locked)
- Financial Trust palette: #2D5240 forest, #7FB897 sage
- Fraunces italic headings, Inter body
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed

## STEP 4 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.

Commit message:
feat(recipes): Recipe Import for cafes — paste a link, AI extracts the recipe, add as a product or compare/improve an existing one
