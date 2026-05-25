# Aria OS — Prompt 26: SEO Sprint 2 — Crawler + Audit Engine
Run AFTER Prompt 25 (security) is green. ONE task, ONE commit, ONE push.

## MANDATORY PRE-EDIT CHECKLIST

```
1. pwd → must print C:\Users\kansa\aria-saas-audit — STOP if wrong
2. git pull origin main
3. Read every file listed in STEP 1 IN FULL before writing anything
4. npx tsc --noEmit — ZERO errors before touching anything
5. npm run build — must succeed before touching anything
```

---

## STEP 1 — READ BEFORE WRITING

Read in full:
- `src/app/dashboard/seo/page.tsx`
- `src/app/api/seo/connect/route.ts`
- Supabase tables: seo_audits, seo_pages, seo_issues (read exact columns via schema)

Existing tables (DO NOT CREATE OR ALTER):
- seo_audits: id, business_id, website_url, status, started_at, completed_at, score, pages_crawled, issues_found
- seo_pages: id, audit_id, business_id, url, title, meta_description, h1, status_code, load_time_ms, word_count, issues (jsonb)
- seo_issues: id, audit_id, business_id, page_id, type, severity, title, description, recommendation, fixed

---

## STEP 2 — CREATE src/app/api/seo/crawl/route.ts

```typescript
export const runtime = 'nodejs'
export const maxDuration = 60
```

POST handler:
1. Auth + business ownership check
2. Find seo_audits row, set status='crawling', started_at=now()
3. Crawl up to 20 pages from website_url (BFS, same domain only)
4. For each page: fetch with 10s timeout, extract title/meta/h1/word_count/load_time
5. Detect issues per page:
   - missing_title (critical): no <title>
   - missing_meta (warning): no <meta name="description">
   - missing_h1 (warning): no <h1>
   - title_too_long (warning): title > 60 chars
   - meta_too_long (warning): meta > 160 chars
   - thin_content (info): word_count < 300
   - slow_page (warning): load_time_ms > 3000
   - broken_link (critical): status code 4xx/5xx
6. Insert rows into seo_pages and seo_issues
7. Calculate score: start 100, deduct 10 per critical, 5 per warning, 2 per info
8. Update seo_audits: status='completed', score, pages_crawled, issues_found, completed_at

---

## STEP 3 — CREATE src/app/api/seo/issues/[id]/route.ts

PATCH: auth + ownership check, set seo_issues.fixed=true

---

## STEP 4 — UPDATE src/app/dashboard/seo/page.tsx

Add "Run Audit" button:
- Calls POST /api/seo/crawl
- Shows spinner: "Crawling your website..."
- On complete: refresh to show results

Show results:
- Score as large number (green >=80, amber 50-79, red <50)
- Issues grouped by severity, each with recommendation + "Mark fixed" button
- Pages list with per-page scores

## CRITICAL RULES

- DB amounts stored as DOLLARS (numeric), never cents
- Model IDs: claude-haiku-4-5-20251001 / claude-sonnet-4-5-20250929 / gemini-2.5-flash-preview-05-20
- Build gate: npx tsc --noEmit + npm run build must pass before commit
- Single commit for the entire task
- vercel.json: never add sub-daily crons
- Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- (Number(x)||0).toFixed(2) for all numeric display

## COMMIT

```
git add -A
git commit -m "feat(...): description"
git push origin main
```

npx tsc --noEmit and npm run build must pass. Then push.
