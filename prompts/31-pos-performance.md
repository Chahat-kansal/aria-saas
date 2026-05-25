# Aria OS — Prompt 31: POS Performance — Sub-500ms Terminal
Post-launch. Run AFTER reviewing Prompt 08/09 audit findings. ONE task, ONE commit, ONE push.

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
- `src/app/pos/terminal/page.tsx`
- `src/app/api/pos/products/route.ts`
- `src/app/api/pos/sales/route.ts`
- `src/components/pos/POSShell.tsx`

---

## STEP 2 — PRODUCT LOADING

Target: products visible in < 500ms.

1. Fetch only needed columns: `id, name, price, image_url, barcode, sku, category_id, is_active, alcohol_percentage`
2. Add `export const revalidate = 60` to products route
3. Move product fetch to BusinessProvider so it survives page navigations (no re-fetch on POS page change)
4. Build a barcode Map on load: `new Map(products.map(p => [p.barcode, p]))` for O(1) lookup

---

## STEP 3 — SALE CREATION

Target: sale completes in < 1500ms.

1. Optimistic UI — update local state immediately, show "Complete" screen, sync in background
2. Batch insert all sale_items in one query using `.insert([...items])` not a loop
3. Move non-critical post-sale work (Aria briefing update, loyalty points) to background with `void asyncFn()`

---

## STEP 4 — MEASURE

Add timing logs around critical paths:
```typescript
const t0 = performance.now()
// ... operation
console.log('[POS perf] products load:', performance.now() - t0, 'ms')
```

Report in commit message: "products: Xms, sale: Yms, barcode: Zms"

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
