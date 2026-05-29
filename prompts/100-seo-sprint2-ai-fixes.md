# Prompt 100 — SEO Sprint 2: AI Fix Engine + Fix Application

Run AFTER pos/ audit (Session 2) is complete.
Sprint 1 built the crawler and read-only advisor. This sprint makes fixes actionable.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```

## What Sprint 1 built
- Crawler: crawls up to 20 pages, detects issues, inserts seo_pages + seo_issues
- Dashboard: read-only view of issues by severity
- AI advisor: generates fix text per issue

## What this sprint adds

### TASK 1 — Fix application engine
Create src/app/api/seo/apply-fix/route.ts
POST body: { issue_id: string, fix_type: string, fix_value: string }
- Auth + ownership check
- Read seo_issues row — get issue_type, affected_url, page_id
- Apply fix based on issue_type:
  - missing_title / title_too_long → generate new <title> tag text (AI if needed), store in seo_issues.ai_fix_text, set state='applied'
  - missing_meta / meta_too_long → same for meta description
  - missing_h1 → suggest H1 text, mark applied
  - thin_content → suggest content additions, mark applied
  - slow_page / broken_link → flag as "manual fix required", mark state='flagged'
- Update seo_issues: state='applied', applied_at=now(), ai_fix_text=fix_value
- Return { success: true, next_steps: string }
Commit: "feat(seo): fix application engine — AI generates and applies SEO fixes"

### TASK 2 — Fix verification cron
Create src/app/api/cron/seo-verify-fixes/route.ts
Schedule: "0 2 * * *" (2am daily)
- Find all seo_issues where state='applied' and applied_at < 24h ago
- Re-crawl the affected page URL
- Re-check if the issue still exists
- If resolved: set state='verified', verified_at=now()
- If still present: set state='unverified', add note to detail field
Add to vercel.json crons (keep total cron count ≤ daily max).
Commit: "feat(seo/cron): nightly fix verification re-crawl"

### TASK 3 — Dashboard: fix application UI
Update src/app/dashboard/seo/page.tsx:
- Each issue row gets "Apply Fix" button (only for AI-fixable types)
- Clicking opens a modal showing: AI-generated fix text + editable textarea
- "Apply" button calls POST /api/seo/apply-fix
- After apply: issue row shows green "Applied" badge + applied_at timestamp
- "Manual fix required" issues show orange badge + link to docs
- Score history: line chart (recharts) showing audit score over time
Commit: "feat(seo/dashboard): fix application UI + score history chart"

### TASK 4 — Bulk fix
Add "Fix all critical issues" button on dashboard.
Calls apply-fix sequentially for all critical issues with AI-generated fixes.
Shows progress indicator. On complete: triggers new audit crawl.
Commit: "feat(seo): bulk fix all critical issues"

## DB columns used (already exist — do not alter)
seo_issues: state, applied_at, verified_at, ai_fix_text, fixed (boolean)

## Rules
- Model: claude-haiku-4-5-20251001 for fix generation (cheap, fast)
- All DB amounts dollars not cents
- npx tsc --noEmit + npm run build before each commit
- vercel.json: do not exceed 22 functions or add sub-daily crons
