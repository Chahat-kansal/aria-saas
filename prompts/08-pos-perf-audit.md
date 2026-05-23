# Aria OS — Prompt 08: POS Performance Audit
NO code changes. NO commit. NO push.
This prompt produces a written report only.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git pull origin main
```

## STEP 1 — PROFILE THE POS TERMINAL
The POS terminal feels slow regardless of data volume. Investigate the
/pos/terminal page and all its components thoroughly. Read and analyse:

A. DATA FETCHING — find every Supabase query the terminal runs on load.
   Count them. Are they sequential (awaited one after another) or parallel
   (Promise.all)? Could they be batched? List every query and how it is called.

B. LIST RENDERING — how many products/items render in the product grid?
   Is the list virtualized (react-window / virtual scrolling) or does it
   render every item as a DOM node? Same question for customer/category lists.

C. RE-RENDERS — when the cart changes (add/remove item), what re-renders?
   Does a cart update re-render the whole terminal including the product grid?
   Is component state scoped, or does one big state object at the top cause
   everything below to re-render on every change?

D. EXPENSIVE COMPUTE — are totals, tax, discounts, search filtering
   recomputed on every render/keystroke? Are useMemo/useCallback used where
   they should be?

E. BUNDLE / EAGER LOAD — does the terminal import heavy components (split
   modal, KDS, modifier builders, charts) eagerly at the top, or are they
   lazy-loaded via next/dynamic? Estimate what loads upfront vs on-demand.

F. IMAGES — how are product images loaded? All at once? Lazy? Sized correctly?

## STEP 2 — WRITE A FINDINGS REPORT
Output a clear written report. For each of A-F:
- What you found
- Whether it is a performance problem
- Severity: high / medium / low
- The exact file and the exact fix that would address it

Rank all problems from highest to lowest impact. For each high/medium problem,
name the exact file and line range where the problem lives.

Do NOT make any code changes in this prompt. Paste the report back only.
