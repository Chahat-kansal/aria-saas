# Aria OS — Prompt 09: POS Performance Fixes
ONE task, ONE commit, ONE push.

## IMPORTANT — FILL IN BEFORE RUNNING
This prompt has a required section below marked with >>><<<.
Paste Prompt 08's ranked findings there before giving this to Claude Code.
Running without the findings means fixing nothing specific.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## THE FINDINGS FROM PROMPT 08
Paste Prompt 08's ranked findings here before running:

>>>
PASTE PROMPT 08's RANKED FINDINGS HERE
(e.g. "1. Terminal runs 7 sequential queries on load — batch into
Promise.all. 2. Product grid renders 800 DOM nodes — add react-window
virtualization. 3. ...")
<<<

## STEP 1 — FIX ONLY THE LISTED FINDINGS
Address each problem from the findings above with the standard remedy:

- Sequential queries → Promise.all, or a single batched query/RPC.
- Non-virtualized long list → add windowing (react-window or equivalent).
  npm install if needed, commit the lockfile.
- Over-broad re-renders → scope state, split components, React.memo the
  product grid and cart rows so a cart change does not re-render the grid.
- Unmemoized compute → useMemo for totals/tax/filtering, useCallback for
  handlers passed to memoized children.
- Eager heavy imports → next/dynamic lazy-load the split modal, KDS,
  modifier builders, charts.
- Images → lazy-load, correct sizing, the existing SVG fallback.

## CONSTRAINTS (strict)
- Do NOT change any POS feature or behaviour — performance only
- Every existing feature must still work identically
- Additive / refactor only, no feature removal
- Do NOT touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed

## STEP 2 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors. ONE commit, ONE push.

Commit message:
perf(pos): targeted POS terminal performance fixes — [replace this with a summary of what was actually fixed based on the findings]
