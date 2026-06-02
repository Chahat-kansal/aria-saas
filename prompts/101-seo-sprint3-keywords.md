# Prompt 101 — SEO Sprint 3: Keyword Tracking + Local SEO Scanner


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

Run AFTER Prompt 100 (SEO Sprint 2) is complete. Read CLAUDE.md first.

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


## TASK 1 — Keyword tracking API
Create src/app/api/seo/keyword-tracking/route.ts

GET: returns tracked keywords for business — { keyword, position, volume, difficulty, url, last_checked_at, position_history[] }
POST { keyword, target_url }: add a keyword to track

Create table if not exists:
```sql
CREATE TABLE IF NOT EXISTS seo_keyword_rankings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  keyword text not null,
  target_url text,
  current_position integer,
  volume integer,
  difficulty integer,
  position_history jsonb default '[]',
  last_checked_at timestamptz,
  created_at timestamptz default now()
);
CREATE INDEX ON seo_keyword_rankings (business_id, keyword);
```

Position check: use web_search (Anthropic tool) to search the keyword and find where the business URL ranks in the first 30 results. Store position (null if not found).
Commit: "feat(seo/keywords): keyword ranking tracker API + DB table"

## TASK 2 — Local SEO scanner
Create src/app/api/seo/local-scan/route.ts

POST { business_id }: scan local SEO signals
Checks:
1. Google Business Profile completeness (NAP — Name, Address, Phone) — check via web search
2. Local keyword opportunities: "{industry} {suburb}" searches — does the business appear?
3. Citation consistency: business name/address consistent across web mentions
4. Local schema markup on the business website (fetch the website, check for LocalBusiness schema)

Return: { score: 0-100, issues: [], opportunities: [], nap_consistent: boolean }
Model: claude-haiku-4-5-20251001 for analysis
Commit: "feat(seo/local): local SEO scanner — NAP, citations, local keywords, schema"

## TASK 3 — Keyword suggestions
Create src/app/api/seo/keyword-suggestions/route.ts

POST { business_id, seed_keyword? }: generate keyword suggestions
- Pull business industry, suburb, products from business context
- Use web search to find related keywords people search for
- Score by estimated difficulty (low/medium/high) and relevance
- Return top 20 keyword suggestions not already being tracked

Model: claude-haiku-4-5-20251001
Commit: "feat(seo/keywords): AI keyword suggestions based on business context"

## TASK 4 — SEO dashboard: Keywords tab
Add "Keywords" tab to existing SEO dashboard page (src/app/dashboard/seo/).
- Keyword table: keyword | position | volume | difficulty | trend (up/down/new)
- Position history sparkline per keyword
- Add keyword input
- "Scan positions now" button (calls keyword-tracking route)
- Local SEO score card with issues list
- Keyword suggestions panel

Commit: "feat(seo/dashboard): keywords tab + local SEO scanner UI"

## TASK 5 — Feed into Aria briefing
In daily briefing context: add top keyword position changes (any keyword moving more than 3 positions).
Add to buildAskAriaContext: SEO position summary (top 5 keywords + positions).
Commit: "feat(seo/briefing): keyword ranking changes in daily briefing context"

## Rules
- vercel.json: do not exceed 22 functions or daily cron max
- Model: claude-haiku-4-5-20251001
- All DB migrations via Supabase MCP (apply_migration tool)
