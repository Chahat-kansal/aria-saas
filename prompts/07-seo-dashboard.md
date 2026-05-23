# Aria OS — Prompt 07: SEO Sprint 4 — SEO Dashboard
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm Sprints 2 and 3 (Prompts 05, 06) are deployed and green.

## STEP 1 — READ BEFORE WRITING
Read 2-3 existing /dashboard sub-pages (the 9 existing ones are the pattern)
and the sidebar component. Read BusinessProvider. Read the SEO API routes
from Prompts 05-06. Do NOT write code first.

## STEP 2 — BUILD /dashboard/seo
Add a new sidebar entry "SEO". Four client-side tabs (no separate routes):

TAB 1 — Site health:
- Latest seo_audits score in a ring chart (0-100)
- Stat cards: pages crawled, issues found, issues fixed, last crawl time
- seo_issues list ordered by severity (high first)
- Each issue row: a "Generate fix" button → POST /api/seo/generate-fix →
  show the returned suggested_fix in an expandable panel with a COPY button
  and paste instructions ("paste this into your site's SEO settings")
- A "Mark as applied" button → PATCH /api/seo/generate-fix

TAB 2 — Local SEO:
- Reads seo_local: gbp_completeness (progress bar 0-100), map_pack_rank,
  citations_total / citations_consistent, review_velocity_30d, the
  checklist jsonb array (render each {item, ok} as a checklist row)
- Read-only display

TAB 3 — Keywords:
- seo_keywords list with keyword, current_rank, delta arrow vs previous_rank,
  search_volume
- A small trend line per keyword from seo_keyword_history
- An "add keyword" input (inserts a seo_keywords row)
- Ranks may be null until the paid rank API (Sprint 5) is wired — render
  the table gracefully with "not tracked yet" when null. Never error.

TAB 4 — AI optimizer:
- Pick a page from seo_pages (dropdown)
- "Generate with Aria" button calls /api/seo/generate-fix for each of:
  missing_title, missing_meta_description, missing_schema
- Show each result (title tag, meta description, JSON-LD) with a COPY button
- Plain paste instructions under each

CRITICAL: this feature is READ-ONLY re: the customer's website. Every fix
is shown with a copy button and "paste this into your site" instructions.
There is NO "apply to live site" button, no OAuth, no snippet injection.

## UI RULES (locked)
- Financial Trust palette: #2D5240 forest, #7FB897 sage
- Fraunces italic headings, Inter body
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1
- Match the existing dashboard sub-page structure and sidebar pattern

## STEP 3 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.

Commit message:
feat(seo): SEO dashboard at /dashboard/seo — site health, local SEO, keyword tracking and AI optimizer tabs; read-only advisor with copy-to-clipboard fixes
