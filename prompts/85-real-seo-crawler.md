# Prompt 85 — Real SEO crawler (replace the 1-page stub with actual analysis)

## What's broken
The current /api/seo/crawl route fetches the home page, finds 0 issues, hardcodes
health_score=80, and stops in 0.5 seconds. The seo_pages, seo_issues,
seo_keywords, seo_keyword_history, seo_local tables are ALL EMPTY because the
crawler never populates them. The dashboard tabs (Keywords, Local SEO, AI
Optimizer) look broken because there is no data behind them.

## What to build — a real crawler

### Page traversal
- Start at businesses.website
- Follow internal links (same hostname only, no external)
- Crawl up to 50 pages per audit (configurable, hard cap)
- Respect robots.txt (parse it, honour Disallow rules for our user-agent)
- 1.5s polite delay between requests to the same host
- 10s timeout per page
- User-Agent: `Mozilla/5.0 (compatible; AriaSEOBot/1.0; +https://ariaos.site/seo-bot)`
- Skip URLs with query strings that look like infinite parameter loops (?page=, ?sort=, ?filter= — only keep one variant)
- Skip non-HTML resources (PDF, images, etc.) — check Content-Type
- Log every fetched URL to seo_pages with status_code, response_time_ms, page_size_kb, depth, parent_url

### On-page analysis (run per crawled page, store findings in seo_issues)
For each page, check and write a seo_issues row for each problem found:

**Title tag:**
- Missing → severity: critical
- Empty → severity: critical
- Length < 30 chars → severity: warning ("title too short")
- Length > 60 chars → severity: warning ("title may be truncated in SERPs")
- Duplicate across multiple pages → severity: warning

**Meta description:**
- Missing → severity: warning
- Length < 120 chars or > 160 chars → severity: info
- Duplicate across pages → severity: warning

**Headings:**
- Missing H1 → severity: critical
- Multiple H1s on one page → severity: warning
- H1 identical to title tag word-for-word → severity: info (lazy)
- Skipped heading levels (H1 → H3, no H2) → severity: info

**Images:**
- `<img>` without `alt` attribute → severity: warning (one issue per image, count them, summarise)
- `alt=""` (empty alt is OK for decorative — info severity, not warning)
- Images over 500KB → severity: info ("optimise image")

**Links:**
- Broken internal links (4xx, 5xx on internal URLs) → severity: critical
- External links missing rel="noopener" with target="_blank" → severity: info
- Links with no anchor text or just "click here" / "read more" → severity: info

**Performance signals (basic, no Lighthouse):**
- Page size > 2MB total HTML → severity: warning
- Response time > 3s → severity: warning ("slow first-byte")
- More than 100 inline scripts → severity: info

**SEO essentials:**
- Missing canonical tag → severity: info
- No robots.txt → severity: warning
- No sitemap.xml → severity: warning
- HTTP (not HTTPS) → severity: critical
- Missing viewport meta tag → severity: critical (mobile-unfriendly)
- Missing structured data (JSON-LD) → severity: info ("consider adding LocalBusiness schema")

**Local SEO (if business address present in businesses table):**
- Business address NOT mentioned anywhere on home page → severity: warning
- No `<address>` tag → severity: info
- No `tel:` link → severity: info
- No Google Maps embed or link → severity: info
Store local checks in seo_local.

### Keywords
Extract real keywords from crawled content:
- Take all crawled page bodies, strip HTML, remove stopwords
- TF (term frequency) across all pages — top 30 terms (1-3 word phrases)
- For each, store: keyword, freq, found_on_pages[], status='extracted'
- Don't try to fake "ranking position" — we don't have a ranking-data source.
  Store keywords with `current_rank = NULL` and `tracked = false`.
- Owner can toggle `tracked` per keyword in the UI later; if they enable rank
  tracking we'd need an external API (e.g. SerpAPI), do not pretend.

### Health score (real, not hardcoded)
```
const weights = {
  critical: -10,
  warning: -3,
  info: -1,
}
let score = 100
for (issue of issues) score += weights[issue.severity] ?? 0
score = Math.max(0, Math.min(100, score))
```
Round to integer. Store in seo_audits.health_score.

### AI fix suggestions (Claude Haiku — already wired)
For every CRITICAL or WARNING issue, generate a fix suggestion via Haiku:
- Prompt: "You are an SEO expert advising an Australian small business. Issue:
  {issue_type} on {url}. Context: {issue_context}. Write a 2-3 sentence fix
  the owner can apply in their CMS or developer's hands. Be concrete: give
  the exact text/code to paste where possible."
- Store the response in seo_issues.ai_fix_text
- Do NOT call Haiku for INFO-severity issues — too expensive at scale, low value

### Wire-up: replace src/app/api/seo/crawl/route.ts
- Migrate the existing 1-page stub into the proper multi-page crawler
- After completion, write the audit row with REAL pages_crawled, issues_found, health_score
- finished_at must reflect real crawl time (not 0.5s)
- error_detail populated if crawl partially failed (e.g. robots.txt blocked everything)

### Dashboard tabs — make them work

- **Site health tab** (the one that currently shows 80): show real critical/warning/info counts, top 10 issues by severity, per-issue affected_pages count
- **Keywords tab**: list extracted keywords from seo_keywords. Show freq, pages_mentioned, and an "Enable rank tracking" toggle per keyword (sets `tracked` boolean — UI works, actual rank-fetch is post-launch)
- **Local SEO tab**: render seo_local checks — address consistency, NAP (name/address/phone), Google Maps link, schema markup
- **AI optimiser tab**: list every issue with its `ai_fix_text`, "Copy fix" button per issue, "Mark as fixed" button (increments seo_audits.issues_fixed)

### Performance & cost
- Crawl runs in the background — return audit_id immediately, status='crawling',
  then update incrementally. Frontend polls /api/seo/audit/[id]/status.
- Limit crawls to ONE per business per 24h (DB constraint or app check) —
  prevents accidental DoS on the customer's own site
- The whole crawl + AI fix generation for 50 pages = ~$0.20-0.50 in Haiku per audit. Acceptable.

## DB additions
Most tables exist. Verify and add what's missing:

```sql
-- Add columns if not exist on seo_audits
ALTER TABLE seo_audits 
  ADD COLUMN IF NOT EXISTS critical_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warning_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS info_count int DEFAULT 0;

-- seo_issues should have ai_fix_text and severity
ALTER TABLE seo_issues
  ADD COLUMN IF NOT EXISTS ai_fix_text text,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS affected_url text,
  ADD COLUMN IF NOT EXISTS issue_type text,
  ADD COLUMN IF NOT EXISTS fixed boolean DEFAULT false;

-- seo_keywords
ALTER TABLE seo_keywords
  ADD COLUMN IF NOT EXISTS frequency int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS found_on_pages jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tracked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_rank int;
```

## Pre-edit checklist
1. Read existing src/app/api/seo/crawl/route.ts
2. Read existing dashboard tabs at src/app/dashboard/seo/page.tsx
3. Check what's already in seo_audits, seo_pages, seo_issues schema
4. Search for any existing crawler library in the repo (cheerio? node-html-parser?) — reuse if so

## Rules
- npm i if cheerio or node-html-parser not installed (cheerio is fine)
- Respect robots.txt — non-negotiable, this is etiquette and law
- Polite delays — 1.5s between requests
- Hard 50-page cap per audit
- One crawl per business per 24h
- All new fetches use the AriaSEOBot UA
- Health score is computed from real issues, never hardcoded
- AI fix text only for critical + warning, never info
- Background crawl with status polling (don't keep the HTTP request open for 30s)

## Commits
- "feat: real SEO crawler with page traversal and on-page analysis"
- "feat: SEO issue detection — titles, headings, images, links, meta, performance, local"
- "feat: SEO keyword extraction from crawled content"
- "feat: AI fix suggestions for SEO issues via Haiku"
- "feat: SEO dashboard tabs — site health, keywords, local SEO, AI optimiser"
- Then: git push origin main

## If limit runs low
Finish current commit, push, STOP, tell me where you stopped. The crawler is
the hardest single piece — if you only get the page-traversal + on-page
analysis done and the keyword extraction is partial, that's still hugely
better than the current state.
