# Aria OS — Prompt 27: SEO Sprint 4 — Keyword Tracking + Dashboard Polish
Run AFTER Prompts 26 (crawler) and 06 (AI fix route) are green. ONE task, ONE commit, ONE push.

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
- All files under `src/app/api/seo/`
- Supabase: seo_keywords, seo_keyword_history, seo_local tables

---

## STEP 2 — KEYWORD TRACKING API

### src/app/api/seo/keywords/route.ts
- GET: list business keywords ordered by volume desc
- POST body `{ keyword: string }`: insert into seo_keywords, immediately fetch google.com/search?q=... to find current rank, insert seo_keyword_history

### src/app/api/cron/seo-keyword-check/route.ts
Daily cron `0 3 * * *`: for each tracked keyword, check rank, update seo_keywords.current_rank and insert history.
Add to vercel.json crons.

---

## STEP 3 — LOCAL SEO SECTION

Add to SEO dashboard:
- "Local SEO" card showing: Google Business listed (Y/N), review count/avg from seo_local table
- POST /api/seo/local/scan — updates seo_local for the business

---

## STEP 4 — AI INSIGHTS PANEL

Add "Aria's SEO read" panel:
- Calls /api/seo/generate-fix for top 3 critical issues
- Shows AI recommendations with "Copy fix" button (clipboard copy)

---

## STEP 5 — SCORE HISTORY CHART

Line chart of score over time (one point per completed audit) using recharts or inline SVG bars.

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
