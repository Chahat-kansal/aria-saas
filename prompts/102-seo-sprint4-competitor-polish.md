# Prompt 102 — SEO Sprint 4: Competitor SEO Analysis + Full Dashboard Polish

Run AFTER Prompt 101 (SEO Sprint 3) is complete. Read CLAUDE.md first.

## Pre-flight (MANDATORY — read CLAUDE.md first)
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
Read CLAUDE.md. Read every file you will edit before touching it.
One commit per task. After every commit: git push origin main, then confirm git log origin/main..HEAD is empty.
State "Build verified green, all commits pushed." before finishing.

## UPGRADE-ONLY RULE
Never remove, stub, or downgrade any existing feature. Fix forward only.

## ARIA INTELLIGENCE RULE (applies to every task)
Every new feature must:
1. Write relevant data to aria_ai_calls (log AI usage)
2. Feed insights back into the daily briefing context (update buildAskAriaContext or daily-briefing route to include new data)
3. Log significant actions to aria_autopilot_actions
4. Use claude-haiku-4-5-20251001 unless the task requires complex reasoning (then claude-sonnet-4-5-20250929)


## TASK 1 — Competitor SEO comparison
Create src/app/api/seo/competitor-analysis/route.ts

POST { business_id, competitor_url }: analyse competitor SEO
- Fetch competitor website (web_fetch)
- Extract: title tags, meta descriptions, H1s, page count estimate, schema markup present
- Web search: what keywords does this competitor rank for in top 10?
- Compare to our business: where are we stronger? where are they ahead?
- Return structured comparison: { competitor_url, their_strengths[], our_opportunities[], keyword_gaps[] }

Model: claude-sonnet-4-5-20250929 for analysis quality
Commit: "feat(seo/competitor): competitor SEO gap analysis"

## TASK 2 — Technical SEO audit
Create src/app/api/seo/technical-audit/route.ts

POST { business_id, website_url }: run technical SEO audit on the business's own website
Checks:
- Page speed signals (check if Lighthouse data available via web search)
- Mobile-friendly check (fetch URL, check viewport meta tag)
- HTTPS (does URL redirect to https?)
- Sitemap exists (check /sitemap.xml)
- robots.txt exists and allows indexing
- Broken internal links (fetch homepage, check all href links, HEAD each one)
- Duplicate title tags (fetch 3-5 key pages, compare titles)

Return: { score, passed[], failed[], warnings[] }
Commit: "feat(seo/technical): technical SEO audit — speed, mobile, schema, links"

## TASK 3 — Fix application engine (Sprint 2 completion)
Verify src/app/api/seo/apply-fix/route.ts is complete and working:
- Reads the specific SEO issue (missing meta description, missing H1, etc.)
- Generates the fix using AI (proper meta description, H1 text, schema JSON)
- Returns fix as copyable text/code the owner can apply to their website
- Logs the fix to seo_fixes table (id, business_id, issue_type, fix_applied, applied_at)

If the route is incomplete, finish it. If the table doesn't exist, create it.
Commit: "feat(seo/fixes): fix application engine complete with logging"

## TASK 4 — Full SEO dashboard polish
Audit and complete src/app/dashboard/seo/page.tsx:
Tabs: Overview | Crawl Results | Keywords | Competitors | Technical | Fix History

Overview tab: SEO score card, top 3 issues, quick wins, last crawl date
Crawl Results tab: page-by-page issues (existing Sprint 1 output)
Keywords tab: (Sprint 3 work)
Competitors tab: competitor comparison cards, add competitor input
Technical tab: technical audit score + checklist
Fix History tab: applied fixes with before/after

All tabs must be functional — no empty states that say "coming soon".
Commit: "feat(seo/dashboard): full 6-tab SEO dashboard — all tabs functional"

## TASK 5 — SEO score in morning briefing
In daily briefing: if SEO score dropped >5 points since last week, add a briefing alert.
If a keyword dropped out of top 10, mention it.
Commit: "feat(seo/briefing): SEO score changes + keyword drops in daily briefing"

## Rules
- vercel.json: 22 function max, daily cron max
- haiku for data processing, sonnet for competitor analysis only
- All migrations via Supabase MCP
