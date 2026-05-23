# Aria OS — Prompt 05: SEO Sprint 2 — Crawler Cron + Audit Engine
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST (critical)
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean — if not, STOP and report
git pull origin main
git log --oneline -3
```
If the pull reports conflicts, STOP and report back.

## STEP 1 — READ BEFORE WRITING
Read the repo tree under src/app/api/cron/ — pick one existing cron route
and match its auth + structure exactly. Read src/lib/supabase-admin.ts and
vercel.json. Do NOT write code before reading.

## CONTEXT — DB ALREADY BUILT (SEO Sprint 1), do not create/alter tables
seo_audits: id, business_id, health_score int, pages_crawled int,
issues_found int, issues_fixed int, status text, error_detail text,
started_at, finished_at, created_at.

seo_pages: id, business_id, audit_id, url, http_status int, title,
title_length int, meta_description, meta_description_length int, h1_count
int, word_count int, images_total int, images_missing_alt int, has_schema
bool, load_ms int, crawled_at.

seo_issues: id, business_id, audit_id, page_url, issue_type, severity,
title, detail, suggested_fix, fix_format, state (default 'open'), applied_at,
verified_at, created_at, updated_at.

## STEP 2 — INSTALL DEPENDENCY
npm install cheerio
Commit the resulting package.json + package-lock.json changes as part of
this task's single commit.

## STEP 3 — CREATE src/lib/seo/crawler.ts
Export async function crawlSite(websiteUrl: string) returning parsed page
objects. Rules:
- Fetch the homepage then follow internal same-host links. HARD CAP: 15 pages total.
- Header: 'User-Agent': 'AriaSEO/1.0 (+https://ariaos.site)'
- 10s timeout per fetch (AbortController). Never POST, never send cookies.
- Fetch /robots.txt first; skip any Disallow'd paths for our user-agent or *.
- Per page, parse with cheerio: title + length, meta description + length,
  h1 count, body word count, img count + how many lack alt attribute,
  has_schema (any script[type="application/ld+json"]), load_ms (measured),
  and the list of internal links found.
- Lightweight HEAD/GET on internal links to detect 404s.
- Every fetch in try/catch — one failed page must not abort the whole crawl.

## STEP 4 — CREATE src/lib/seo/audit.ts
Export pure function auditPage(page) returning {issue_type, severity, title,
detail}[]. No I/O. Issue types:
- missing_meta_description (high) — no description or length 0
- missing_title (high) — no title or empty
- missing_alt_text (high) — images_missing_alt > 0
- missing_schema (medium) — has_schema is false (homepage only)
- broken_link (medium) — an internal link returned 404
- missing_h1 (medium) — h1_count === 0
- thin_content (low) — word_count < 150
- slow_page (low) — load_ms > 3000

Export computeHealthScore(issues): start 100, subtract high -12 / medium -6
/ low -3, floor at 0, return integer.

## STEP 5 — CREATE src/app/api/cron/seo-crawl/route.ts
Match the existing cron route pattern exactly.
- export const dynamic = 'force-dynamic'
- export const maxDuration = 300
- GET handler. Auth: header 'authorization' === `Bearer ${process.env.CRON_SECRET}` else 401.
- Use supabaseAdmin (service role, bypasses RLS — correct for a cron).
- Load businesses with a non-empty website, ordered by oldest-audited first
  (left join / subquery on seo_audits.created_at). Cap how many you process
  so total runtime stays under maxDuration.
- Per business:
  1. Insert a seo_audits row (status:'running', started_at:now()). Keep its id.
  2. Run crawlSite(business.website). For each page, insert a seo_pages row
     (with audit_id). Run auditPage on each page; collect all issues.
  3. VERIFY LOOP — before inserting new issues: load this business's existing
     seo_issues where state='applied'. For each, check if the same
     issue_type + page_url still appears in this crawl's results. If GONE:
     update that row to state='verified', verified_at=now(). If still present:
     leave it.
  4. Insert new seo_issues rows (state:'open', audit_id set). Skip inserting
     any issue that already exists as 'applied' or 'verified' for the same
     type + url (no duplicates).
  5. Update the seo_audits row: status:'complete', finished_at:now(),
     pages_crawled, issues_found, issues_fixed (count of verified this run),
     health_score from computeHealthScore.
  6. On any throw for that business: update its seo_audits row to
     status:'failed', error_detail=String(e).slice(0,300). Continue to next
     business — one failure must not stop the cron.
- console.log one summary line per business:
  [seo-crawl] <website>: N pages, M issues, score S
- Return NextResponse.json({ businesses_processed, ... })

## STEP 6 — UPDATE vercel.json
Add EXACTLY ONE new entry to the crons array, nothing else:
{ "path": "/api/cron/seo-crawl", "schedule": "0 7 * * *" }
Daily schedule only. Do not add/remove/modify any other cron or function.

## CONSTRAINTS
- No backtick template literals inside className={...} or style={{}}
- Do not touch any other files beyond the 3 new files, vercel.json, package files
- Do not alter DB tables

## STEP 7 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors — no feature changes. ONE commit (3 new files + vercel.json +
package files), ONE push.

Commit message:
feat(seo): crawler cron + audit engine — daily seo-crawl crawls each business website (cheerio, 15-page cap, robots-aware), audits 8 issue types, writes seo_pages + seo_issues, computes health score, verifies applied fixes
