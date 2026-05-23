# Aria OS — Prompt 06: SEO Sprint 3 — AI Fix Generation Route
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm Sprint 2's seo-crawl cron is present before proceeding.

## STEP 1 — READ BEFORE WRITING
Read an existing route that calls Claude/Anthropic in this repo — match its
client setup + error wrapper. Read how aria_ai_calls rows are written. Read
the seo_issues / seo_pages / businesses usage. Do NOT write code first.

## STEP 2 — CREATE src/app/api/seo/generate-fix/route.ts
- export const runtime = 'nodejs'
- export const dynamic = 'force-dynamic'
- export const maxDuration = 60
- Wrap handlers with withErrorCapture to match other routes.

POST handler:
- Supabase auth (401 if no user). Body { issue_id }.
- Load the seo_issues row; confirm via RLS-safe query it belongs to the
  user's business. Load the seo_pages row for that page_url and the
  businesses row for context (name, city, industry, abn, gst_registered).
- Call Claude (claude-sonnet-4-5-20250929) with an issue-type-specific prompt:
  - missing_meta_description → 150-160 char description using the page's
    title + word_count + business name + city. Plain text.
  - missing_alt_text → alt-text guidance: a short rule + 2 examples for the
    business type. fix_format='guidance'.
  - missing_schema → a LocalBusiness JSON-LD block from the businesses row
    (name, address, city, phone, hours, geo). fix_format='jsonld'.
  - missing_title → a 50-60 char title tag. fix_format='meta_tag'.
  - slow_page / broken_link / thin_content → advice only.
    fix_format='guidance'.
- System-prompt rules: never invent facts not in the business row; obey
  char limits; output only the fix, no preamble; for JSON-LD output valid
  JSON only; include one good-vs-bad example in the prompt.
- Store result in seo_issues.suggested_fix + fix_format; set state='suggested'.
- LOG the AI call to aria_ai_calls: feature='seo_fix', model, token counts,
  issue_type. (Aria Intelligence rule — every AI call must be logged.)
- Return { suggested_fix, fix_format }.

PATCH handler:
- Body { issue_id, action:'mark_applied' }
- RLS-safe check the issue belongs to the user's business.
- Set seo_issues.state='applied', applied_at=now().
- Verification happens on the next crawl (Sprint 2's verify loop).

## STEP 3 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.

Commit message:
feat(seo): AI fix generation route — generates meta descriptions, alt-text guidance, LocalBusiness JSON-LD and title tags per issue with Claude, logs to aria_ai_calls, PATCH marks issues applied
