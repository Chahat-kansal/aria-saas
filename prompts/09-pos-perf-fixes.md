# Aria OS — Prompt 09: POS Terminal Performance Fixes
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read these files IN FULL before touching anything:
- src/app/pos/(fullscreen)/terminal/page.tsx (3,974 lines — read all of it)
- src/components/terminal/layouts/FastGridLayout.tsx
- src/components/terminal/ProductImage.tsx
Do NOT write code before reading all three.

## FINDINGS FROM PROMPT 08 — fix all of these, in order

### FIX 1 — HIGH: layoutProducts useMemo (terminal/page.tsx lines 2477–2492)
layoutProducts is computed inline in the render body with a .map() over
displayedProducts, creating 200+ new object references on EVERY render.
This means every cart tap (setCart) re-renders all 200 product cards.

Fix: wrap layoutProducts in useMemo with dep [displayedProducts]:
  const layoutProducts = useMemo(
    () => displayedProducts.map(p => ({ id: p.id, name: p.name, ...allOtherFields })),
    [displayedProducts]
  )
Read the exact fields used in the map before writing the memoized version —
do not drop any field. The fix is additive: same output, memoized.

### FIX 2 — HIGH: lazy-load cafe-only and infrequent components (terminal/page.tsx lines 4–50)
These components are eagerly imported for ALL business types. A liquor store
parses and executes all cafe UI on every POS open:
  SandwichBuilder, FloorPlan, DiscountBar, ModifierModal, OrderTypeSelector,
  CustomerCaptureModal, CafeSetupModal, KdsTracker, Receipt, SplitModal,
  ModifierPickerModal, PriceOverrideModal

Convert ALL of them to next/dynamic with ssr: false:
  const SandwichBuilder = dynamic(() => import('@/components/pos/SandwichBuilder'), { ssr: false })
  const FloorPlan       = dynamic(() => import('@/components/pos/FloorPlan'),       { ssr: false })
  const DiscountBar     = dynamic(() => import('@/components/pos/DiscountBar'),     { ssr: false })
  const Receipt         = dynamic(() => import('@/components/pos/Receipt'),         { ssr: false })
  const SplitModal      = dynamic(() => import('@/components/pos/SplitModal'),      { ssr: false })
  const ModifierModal   = dynamic(() => import('@/components/pos/ModifierModal'),   { ssr: false })
  const ModifierPickerModal   = dynamic(() => import('@/components/pos/ModifierPickerModal'),   { ssr: false })
  const PriceOverrideModal    = dynamic(() => import('@/components/pos/PriceOverrideModal'),    { ssr: false })
  const OrderTypeSelector     = dynamic(() => import('@/components/pos/OrderTypeSelector'),     { ssr: false })
  const CustomerCaptureModal  = dynamic(() => import('@/components/pos/CustomerCaptureModal'),  { ssr: false })
  const CafeSetupModal        = dynamic(() => import('@/components/pos/CafeSetupModal'),        { ssr: false })
  const KdsTracker            = dynamic(() => import('@/components/pos/KdsTracker'),            { ssr: false })

Add `import dynamic from 'next/dynamic'` if not already imported.
Do NOT lazy-load: AnimatedBg, FlyToCart, CursorGlow (locked files — already
handled). Do NOT lazy-load components needed immediately on first paint.

### FIX 3 — MEDIUM: merge businessId-gated useEffects (terminal/page.tsx lines 626–694)
Three separate useEffect hooks all gate on businessId:
  - eod-markdown fetch
  - surcharge-rules fetch
  - pos_outlets Supabase query
These fire in sequence as separate React effects after businessId resolves,
adding waterfall latency.

Fix: merge all three into a single useEffect:
  useEffect(() => {
    if (!businessId) return
    Promise.all([eodFetch, surchargeFetch, outletsFetch])
  }, [businessId])

Read the existing three effects carefully — preserve all their existing
state setters and error handling. This is a structural merge, not a rewrite.

### FIX 4 — MEDIUM: memoize cart.map() props (terminal/page.tsx lines 2692, 2705)
cart.map(...) is called inline when passing props to AriaInlineCard and
DiscountBar, creating a new array reference on every render even when the
cart hasn't changed.

Fix: memoize both before the return statement:
  const cartForAria = useMemo(
    () => cart.map(c => ({ name: c.label ?? c.product.name, category: c.product.pos_categories?.name ?? null })),
    [cart]
  )
  const cartForDiscount = useMemo(
    () => cart.map(c => ({ ...whateverFieldsDiscountBarNeeds })),
    [cart]
  )
Read lines 2692 and 2705 to get the exact field shapes before writing the
memoized versions. Pass cartForAria and cartForDiscount as props.

### FIX 5 — MEDIUM: React.memo on layout components (FastGridLayout.tsx + others)
FastGridLayout and other layout components are not wrapped in React.memo,
so they re-render even when their props haven't changed.

Fix in FastGridLayout.tsx: change the export to:
  export default React.memo(FastGridLayout)
Do the same for ShelfLayout, MasonryLayout, CarouselLayout,
SearchFirstLayout if they follow the same pattern. Read each file first —
only wrap if they don't already use React.memo.

### FIX 6 — LOW: debounce customer display localStorage writes (terminal/page.tsx lines 710–740)
The customer display useEffect writes to localStorage twice synchronously
on every cart change, including every keystroke in a qty field.

Fix: wrap the localStorage writes in a 50ms debounce using setTimeout:
  useEffect(() => {
    const timer = setTimeout(() => {
      // existing localStorage write code here
    }, 50)
    return () => clearTimeout(timer)
  }, [cart, ...otherDeps])
Read the existing effect to get the exact deps array and preserve them.

### FIX 7 — LOW: product image dimensions (ProductImage.tsx line 235)
Product images have no width or height attributes, so the browser loads
them at source resolution regardless of the 88px display size.

Fix: add width={size} height={size} to the <img> tag at line 235.
Read the file to confirm the exact prop name for size (it may be called
`size`, `imgSize`, or similar). Only change the img tag — do not touch
the SVG rendering path.

## CONSTRAINTS (non-negotiable)
- Performance changes ONLY — zero feature or behaviour changes
- Every existing feature must work identically after the fixes
- Do NOT touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- No backtick template literals inside className={...} or style={{}}
- All amounts still (Number(x)||0).toFixed(2)
- If any fix would require changing a feature to implement — skip that fix
  and note it. Never sacrifice correctness for performance.

## STEP 2 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix ONLY TypeScript
or build errors — no scope changes. If a dynamic() import causes a type
error, add the correct LoaderComponent type annotation.

## STEP 3 — ONE COMMIT, ONE PUSH
Stage all changed files. ONE commit, ONE push.
Commit: perf(pos): POS terminal performance fixes — useMemo layoutProducts (eliminates 200-card re-render on cart tap), lazy-load 12 cafe-only components (fix TTI for all non-cafe businesses), merge businessId useEffects, memoize cart props, React.memo layout components, debounce localStorage writes, product image dimensions
