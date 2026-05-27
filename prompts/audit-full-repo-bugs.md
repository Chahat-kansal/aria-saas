# Full Repo Bug Audit — Read Every File, Find Every Real Bug

## Goal
Read EVERY page and API route in the repo. Find real LOGIC bugs — not file sizes,
not "looks thin". The kind of bug that breaks with real data.
Output ONE report: FULL_BUG_REPORT.md. Fix NOTHING in this pass — audit only.

## Why this exists
Previous audits checked file sizes and connectivity, not behaviour.
Real bugs found by manual review that those audits MISSED:
- invoices: 'overdue' status filter exists but no code ever sets status to overdue → tab always empty
- cash-flow: manual expense panel saves only to React state, no API call → all entries lost on refresh
- cash-flow: view type includes 'expenses' but no button renders it → dead unreachable code
- reorder/weekly-order: `calcQty || defaultReorderQty` → suggested flat 12 even for well-stocked items
- ask/business-context: Promise.all array order didn't match destructuring → wrong data → crash
This audit must find bugs at THAT depth.

## Scope — audit ALL of these
1. Every file in src/app/dashboard/**/page.tsx (~100 files)
2. Every file in src/app/pos/**/page.tsx (~130 files)
3. Every file in src/app/api/**/route.ts (~700 files)
4. Key libs: src/lib/aria/**, src/lib/agents/**, src/lib/pos/**

## Method — work in batches to manage context
Do NOT try to hold all files in context at once. Work folder by folder:
1. Audit src/app/dashboard pages → append findings to FULL_BUG_REPORT.md
2. Audit src/app/pos pages → append
3. Audit src/app/api routes (do in sub-batches by folder) → append
4. Audit key libs → append
After each batch, WRITE findings to the report file immediately. Then clear and continue.
The report is built incrementally so nothing is lost if context runs out.

## What counts as a bug — look for ALL of these
- **Dead state**: data saved only to React useState with no API persistence → lost on refresh
- **Unreachable code**: a view/tab/status value in a type union that no UI ever triggers
- **Broken status flow**: a status filter/tab that no code path ever sets
- **Falsy fallback bugs**: `x || default` where x can be a legitimate 0, causing wrong defaults
- **Wrong array/object handling**: `.reduce`/`.map`/`.filter` on something that can be null or non-array
- **Promise.all order mismatch**: destructured order ≠ array order
- **Missing business_id filter**: a query that should scope by business_id but doesn't (data leak)
- **Missing await**: async call not awaited
- **Hardcoded values**: ratios, IDs, magic numbers that should be configurable or per-business
- **GST/tax errors**: tax math that is wrong or missing the 10% AU GST
- **Missing error handling**: fetch with no .catch, JSON.parse with no try/catch
- **Stale closure**: useEffect/useCallback missing a dependency
- **Wrong palette**: not using Financial Trust palette (#7FB897 sage, #2D5240 forest) — note but low priority
- **API route bugs**: route returns wrong shape, missing auth check, no RLS-equivalent business scoping
- **Cron bugs**: sub-daily schedule (violates Vercel Pro rule), no error capture

## Report format — FULL_BUG_REPORT.md

```markdown
# Aria OS — Full Repo Bug Audit
Generated: [date]
Files audited: N pages, N API routes, N libs

## CRITICAL bugs (data loss, money errors, crashes, data leaks)
### [file path]
- BUG: [precise description — what's wrong, what line, what breaks]
- IMPACT: [what the user experiences]
- FIX: [one line — how to fix]

## HIGH bugs (broken features, wrong output)
[same format]

## MEDIUM bugs (dead code, minor logic errors)
[same format]

## LOW (palette inconsistency, cosmetic)
[same format]

## Summary
- Critical: N
- High: N
- Medium: N
- Low: N
- Files audited: N / N total
- Files NOT audited (if ran out): [list]
```

## Rules
- READ EVERY FILE FULLY — open it, read the logic, trace the data flow
- This is about CORRECTNESS, not file size. A 40KB file can be buggy, a 2KB file can be perfect.
- Do NOT fix anything — audit only. The fix is a separate prompt.
- Write to FULL_BUG_REPORT.md incrementally — after every folder batch
- Be specific: file path + line + exact bug. "Looks thin" is NOT a bug. "calcQty falsy fallback on line 94 suggests 12 units when stock is sufficient" IS a bug.
- If context runs low: ensure the report has everything found so far + lists which folders were not reached. Commit it.
- Commit at the end: "audit: full repo bug report — every page, route, lib reviewed"

## Deliverable
FULL_BUG_REPORT.md — committed. Nothing else changed.
