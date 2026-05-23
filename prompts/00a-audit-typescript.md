# Aria OS — Audit Pass A: TypeScript + Build Integrity
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — GET THE ERROR LIST
Run: npx tsc --noEmit 2>&1
Capture the FULL output. Group errors by file. Report the grouped list.
Do NOT open any files yet.

## STEP 2 — FIX RULES
Fix ONLY tsc-reported errors. File by file. Read each file fully before touching it.
- Type mismatches: fix the type, never use `as unknown as X`
- `possibly undefined`: add null checks, not ! assertions  
- Unused vars: prefix with _ or remove if 100% dead code
- Missing return types: add the correct annotation
- Import errors: fix the path or add the missing export
- `any` warnings: add explicit types, not suppression

NEVER TOUCH: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
NEVER CHANGE: logic, UI, DB queries, API contracts, feature behaviour
NEVER FIX: ESLint warnings, code style, things tsc did not report

## STEP 3 — VERIFY + BUILD
npx tsc --noEmit → must be zero errors
npm run build → must pass
Fix any remaining errors. Repeat until clean.

## STEP 4 — COMMIT
ONE commit, ONE push.
Commit: fix(typescript): resolve all pre-existing tsc errors — zero errors after fix
