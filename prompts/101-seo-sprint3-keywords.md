# Prompt 101 — SEO Sprint 3: Keyword Tracking + Local SEO

Run AFTER Prompt 100 (SEO Sprint 2) is complete.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```

## TASK 1 — Keyword tracking API
### src/app/api/seo/keywords/route.ts
GET: list business keywords ordered by search_volume desc, include current_rank + rank_change
POST body { keyword: string }:
- Insert into seo_keywords
- Immediately attempt rank check: fetch https://www.google.com/search?q={keyword}+{business_city} with a realistic UA
- Parse result position (1-10 or "not in top 10")
- Insert seo_keyword_history row
- Return { keyword, current_rank, checked_at }

DELETE /{id}: remove keyword + history

### src/app/api/seo/keywords/[id]/route.ts
GET: keyword detail + full rank history for chart

## TASK 2 — Keyword rank cron
Create src/app/api/cron/seo-keyword-check/route.ts
Schedule: "0 3 * * *"
For each business with tracked keywords:
- Re-check rank for each keyword
- Insert seo_keyword_history
- Update seo_keywords.current_rank, rank_change (vs yesterday), last_checked_at
Add to vercel.json.
Commit: "feat(seo/cron): daily keyword rank check"

## TASK 3 — Local SEO scanner
Create src/app/api/seo/local/route.ts
POST: scan the business Google Business Profile health
- Check businesses.google_place_id exists
- Check businesses.google_rating, google_total_reviews populated
- Check businesses.website matches what's on GBP
- Score: 0-100 based on completeness
- Store result in seo_local table (create if not exists: id, business_id, score, issues jsonb, scanned_at)
Commit: "feat(seo): local SEO scanner"

## TASK 4 — Keywords + Local SEO dashboard UI
Add two new tabs to /dashboard/seo page:
1. "Keywords" tab:
   - Add keyword input + button
   - Table: keyword | current rank | rank change (▲▼) | search volume | last checked
   - Rank history line chart per keyword (recharts)
   - "Not tracked yet" empty state with suggested keywords based on business industry + name

2. "Local SEO" tab:
   - Local SEO score gauge (0-100)
   - Checklist: GBP claimed ✓/✗, website listed ✓/✗, reviews count, avg rating
   - "Scan now" button → POST /api/seo/local
Commit: "feat(seo/dashboard): keywords tab + local SEO tab"

## DB tables
seo_keywords: id, business_id, keyword, current_rank, rank_change, search_volume, last_checked_at, created_at
seo_keyword_history: id, keyword_id, business_id, rank, checked_at
seo_local: id, business_id, score, issues (jsonb), scanned_at
Create these via migration if they don't exist.

## Rules
- npx tsc --noEmit + npm run build before each commit
- Model: claude-haiku-4-5-20251001
- vercel.json: do not exceed 22 functions or daily cron max
