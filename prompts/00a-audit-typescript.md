# Aria OS — Audit Pass A: TypeScript + Build Integrity
ONE task, ONE commit, ONE push.

## CORE RULE — UPGRADE ONLY
Every change in this pass must make the codebase strictly better.
- NEVER remove a working feature, route, component, or AI capability
- NEVER simplify logic that is intentionally complex
- NEVER replace a real implementation with a stub or placeholder
- NEVER downgrade a model, remove context, or reduce AI capability
- If fixing a type error requires understanding what a function does — understand it first, then fix the type correctly
- When in doubt: add types, never remove code

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — GET THE FULL ERROR LIST
Run: npx tsc --noEmit 2>&1
Capture the FULL output. Group errors by file. Report the grouped list.
Do NOT open any files yet. Do NOT start fixing yet.

## STEP 2 — FIX FILE BY FILE
Read each erroring file in full before touching it. Fix only tsc-reported errors.
Priority: shared lib files before pages (fixing a lib clears many page errors).

Fix rules:
- Type mismatches → fix the type correctly, never `as unknown as X`
- `possibly undefined` → add null checks, never use ! assertion
- Unused vars → prefix with _ or remove only if 100% dead (not exported, not referenced)
- Missing return types → add the correct annotation based on what the function actually returns
- Import errors → fix the path or add the missing export
- `any` types → add explicit correct types, never suppress with `// @ts-ignore`

NEVER TOUCH: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
NEVER: change logic, UI, DB queries, API contracts, feature behaviour, ESLint warnings

## STEP 3 — VERIFY + BUILD
npx tsc --noEmit → must be zero errors
npm run build → must pass
Fix any remaining. Repeat until clean.

## STEP 4 — COMMIT
ONE commit, ONE push.
Commit: fix(typescript): full tsc audit — resolve all pre-existing TypeScript errors, zero errors after fix, build confirmed passing, no features removed or downgraded
