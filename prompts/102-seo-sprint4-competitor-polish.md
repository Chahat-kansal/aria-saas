# Prompt 102 — SEO Sprint 4: Competitor SEO Analysis + Dashboard Polish

Run AFTER Prompt 101 (SEO Sprint 3) is complete.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```

## TASK 1 — Competitor SEO analysis
Create src/app/api/seo/competitors/route.ts
POST: given a competitor URL, crawl their homepage + up to 5 pages:
- Extract their title tags, meta descriptions, H1s, keyword density
- Compare to this business's own pages
- Generate AI comparison: "They rank for X, you don't. Here's how to compete."
- Store in seo_competitor_analysis table (id, business_id, competitor_url, analysis jsonb, created_at)
GET: list past competitor analyses

Commit: "feat(seo): competitor SEO analysis — crawl + AI comparison"

## TASK 2 — Recommendations engine
Create src/app/api/seo/recommendations/route.ts
GET: AI-generated prioritised action list based on:
- Current seo_issues (unresolved criticals first)
- Keyword gaps vs competitors
- Local SEO score
- Industry benchmarks (hardcode reasonable benchmarks per industry)
Returns: [ { priority: 1-5, action: string, impact: 'high'|'medium'|'low', effort: 'low'|'medium'|'high' } ]
Commit: "feat(seo): AI recommendations engine with priority + effort scoring"

## TASK 3 — Dashboard polish
Full polish pass on /dashboard/seo:
- Overview tab: health score gauge (SVG arc, colour-coded red/amber/green), issue count by severity, last crawl timestamp, "Run new audit" button
- Issues tab: filterable by severity + state (open/applied/verified), sortable by page
- Fix tab: bulk fix button, progress bar during bulk fix, "All fixed!" confetti state
- Keywords tab: from Sprint 3
- Local SEO tab: from Sprint 3
- Competitors tab: add competitor URL input, show past analyses, AI comparison cards
- Recommendations tab: prioritised action cards with effort/impact badges
Commit: "feat(seo/dashboard): full polish — 6 tabs, gauges, bulk fix progress, recommendations"

## TASK 4 — SEO score in business brain
After each completed audit, write a summary to the business brain:
- Top 3 unresolved critical issues
- Current health score
- Top keyword rank
This means Aria's daily briefing can reference SEO health.
Commit: "feat(seo): write audit summary to business brain for Aria briefings"

## Rules
- npx tsc --noEmit + npm run build before each commit
- Model: claude-haiku-4-5-20251001 for analysis, sonnet for recommendations
- vercel.json: 22 function max, daily cron max
