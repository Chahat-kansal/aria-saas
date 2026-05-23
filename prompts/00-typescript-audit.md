# Aria OS — Prompt 00: Full TypeScript Audit + Fix
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean — if not, STOP and report
git pull origin main
```

## STEP 1 — RUN THE AUDIT FIRST, TOUCH NOTHING YET
Run this exact command and capture the FULL output:
```
npx tsc --noEmit 2>&1
```
Count the errors. Group them by file. Do NOT open any files yet.
Report back the grouped error list before doing anything else.

## STEP 2 — FIX STRATEGY (read carefully before acting)
Fix errors FILE BY FILE, in this priority order:
1. Files with the most errors first (highest impact per file read)
2. Shared lib files before pages (fixing a lib often clears multiple page errors)
3. Leave any .d.ts or node_modules errors alone — never touch those

For EACH file you fix:
- Read the FULL file first
- Fix ONLY the TypeScript errors tsc reported for that file
- Do NOT refactor, rename, restructure, or improve anything else
- Do NOT change any logic, UI, or behaviour
- Do NOT add new features or clean up code style
- After fixing each file, move to the next

SPECIFIC RULES for common error types:
- `any` type warnings: add explicit types, do NOT use `as any` to suppress
- Missing return types: add the correct return type annotation
- Unused variables: prefix with _ (e.g. `_unused`) or remove if truly dead code — but only if removing it is 100% safe (not exported, not referenced elsewhere)
- Type mismatches: fix the type, never cast with `as unknown as X`
- Missing properties on types: add the property to the type definition if it genuinely exists at runtime
- `possibly undefined`: add proper null checks, not non-null assertions (!)
- Import errors: fix the import path or add the missing export

THINGS YOU MUST NOT DO:
- Do not touch AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts (locked files)
- Do not add backtick template literals inside className={...} or style={{}}
- Do not change any database queries or API contracts
- Do not rewrite files that have zero errors
- Do not fix ESLint warnings — only tsc errors

## STEP 3 — VERIFY
After fixing all files, run:
```
npx tsc --noEmit 2>&1
```
Must return zero errors. If errors remain, fix them. Repeat until clean.

Then run:
```
npm run build
```
Must pass. Fix only build errors that are NOT already fixed by tsc.

## STEP 4 — SINGLE COMMIT
Stage ALL changed files. ONE commit, ONE push.

Commit message:
fix(typescript): full TypeScript audit — resolve all pre-existing tsc errors across the repo; zero errors after fix; build confirmed passing
