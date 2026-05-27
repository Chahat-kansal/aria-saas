# Regression Audit — Did Pro-Upgrade Prompts Remove Features?

## Why this exists
Prompts 32-56 rebuilt dashboard pages to "category-leader level".
Rebuilding risks DROPPING features that existed before the rewrite.
Confirmed example: prompt 43 rebuilt the staff page and removed auto-roster generation.
This audit finds every such regression across all upgraded pages.

## Method — use git, not guesswork
For each upgraded page, compare the CURRENT version against the version
BEFORE the pro-upgrade commit. List any feature, function, button, tab,
or API call that existed before but is GONE now.

## Pages to audit (each was rebuilt by a prompt 32-56)
- src/app/dashboard/daily-briefing/page.tsx (prompt 32)
- src/app/dashboard/page.tsx (prompt 33, 44)
- src/app/dashboard/customers/page.tsx (prompt 34)
- src/app/dashboard/invoices/page.tsx (prompt 35)
- src/app/dashboard/compliance/page.tsx (prompt 38)
- src/app/dashboard/profit-leaks/page.tsx (prompt 39)
- src/app/dashboard/churn/page.tsx (prompt 40)
- src/app/dashboard/winback/page.tsx (prompt 41)
- src/app/dashboard/reviews/page.tsx (prompt 42)
- src/app/dashboard/staff/page.tsx (prompt 43)
- src/app/dashboard/bookings/page.tsx (prompt 45)
- src/app/dashboard/quotes/page.tsx (prompt 46)
- src/app/dashboard/recipes/page.tsx (prompt 47)
- src/app/dashboard/competitors/page.tsx (prompt 48)
- src/app/dashboard/social/page.tsx (prompt 49)
- src/app/dashboard/loyalty/page.tsx (prompt 50)
- src/app/dashboard/parcel-tracking/page.tsx (prompt 51)
- src/app/dashboard/shift-reports/page.tsx (prompt 52)
- src/app/dashboard/weekly-reports/page.tsx (prompt 53)
- src/app/dashboard/intelligence/page.tsx (prompt 54)

## For each page — do this
1. `git log --oneline --all -- <page path>` — find the pro-upgrade commit (message mentions "pro", "level", or the feature name)
2. `git show <commit-before-upgrade>:<page path>` — get the OLD version
3. Compare OLD vs CURRENT:
   - Extract every function name (grep `function `, `const ... = (`, `async `)
   - Extract every fetch/API call (grep `fetch(`)
   - Extract every button/tab label (grep `<button`, tab arrays)
4. List anything in OLD that is NOT in CURRENT — that is a regression.

## Report — write to REGRESSION_AUDIT.md

```markdown
# Aria OS — Feature Regression Audit

## Pages with regressions (features removed)
### [page name]
- REMOVED: [feature/function/button] — existed in commit [sha], gone in current
- REMOVED: [...]

## Pages clean (no features lost)
- [list]

## Summary
- Total pages audited: N
- Pages with regressions: N
- Total features removed across all pages: N

## Priority restore list
[ordered — most important removed features to restore first]
```

## Rules
- READ ONLY — change NOTHING except creating REGRESSION_AUDIT.md
- Use git commands and grep — be token-efficient, do not read full files repeatedly
- Be thorough — this is the whole point. Do not skip pages.
- A removed feature = anything callable/clickable/visible that the old version had and the new one does not
- Do NOT count intentional replacements (e.g. old chart swapped for better chart) as regressions — only count genuinely LOST capability

## Deliverable
One file: REGRESSION_AUDIT.md, committed.
