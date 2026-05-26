# Prompt 49 — Social: Hootsuite + Buffer + Sprout Social Level Pro Upgrade

## Category leader bar (checked live May 2026)
Hootsuite: unified inbox, hashtag generator, content inspiration, performance analytics across ALL channels, sentiment monitoring, brand listening, team collaboration, campaign planning, bulk scheduling 100s posts.
Buffer: multi-account scheduling, content library, approval workflows, analytics, engagement tracking, AI assistant.
Sprout Social: visual content calendar, shared asset library, AI optimal send times, unified inbox across platforms, social listening, competitor benchmarking.
Aria must match 80% + AI differentiation for Australian small business.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/social/page.tsx` — full read (50KB)
2. `cat src/app/api/social/route.ts` — check if exists
3. `cat src/app/api/social/posts/route.ts` — check
4. `cat src/app/api/social/connections/route.ts` — check
5. `cat src/app/api/social/calendar/route.ts` — check
6. Check DB: `social_posts`, `social_connections`, `social_analytics` tables via Supabase MCP
7. Check existing state vars — page has calendar + best-times tabs, connections, posts, image generation

## What currently exists (DO NOT remove)
- Calendar tab + best-times tab
- Social connections (Instagram/Facebook/LinkedIn)
- Post generation with AI
- Image generation (Stability AI/DALL-E/Unsplash)
- Video jobs
- Publishing
- Brand voice + frequency preferences

## Gaps vs Hootsuite/Buffer/Sprout (add all of these)

### 1. Unified social inbox
New "Inbox" tab — shows all comments, DMs, mentions across connected platforms in one feed.
Real-time polling every 60 seconds.
Reply button on each message — opens composer pre-filled with @mention.
Mark as read/resolved. Filter: unread/all/replied.
Store in `social_inbox` table:
```sql
CREATE TABLE IF NOT EXISTS social_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  platform text,
  message_type text, -- comment/dm/mention
  author_name text,
  author_handle text,
  content text,
  post_url text,
  received_at timestamptz DEFAULT now(),
  is_read boolean DEFAULT false,
  replied_at timestamptz,
  reply_text text
);
```

### 2. Content library (shared asset library)
New "Library" tab — saved content assets: images, captions, hashtag sets.
Upload images → stored in Vercel Blob.
Save caption templates per content type (promotion, product, event, seasonal).
Hashtag sets: save groups of hashtags by category (e.g. #liquor #melbourne #wine).
Reuse: when creating post, "Insert from library" button.
Store in `social_content_library` table.

### 3. Bulk scheduling
"Bulk upload" button — owner uploads CSV with columns: date, time, platform, caption, image_url.
Parse CSV with papaparse (already in stack).
Preview all posts → confirm → schedule all at once.
Show import summary: "23 posts scheduled across 4 platforms"

### 4. Approval workflow
Multi-user: staff creates post draft → owner approves before publishing.
Post status: draft → pending_approval → approved → scheduled → published.
Email notification to owner when post needs approval.
"Approve" / "Request changes" buttons on each pending post.
Store `status` + `approved_by` + `approved_at` on social_posts.

### 5. Analytics dashboard
New "Analytics" tab replacing best-times (move best-times inside analytics).
Show per post: reach, impressions, likes, comments, shares.
Chart: engagement rate over time (recharts LineChart).
Top performing post of the week.
Best performing content type (image vs video vs text).
Follower growth chart.
Data pulled from `social_analytics` table or social platform APIs.

### 6. Social listening (brand mentions)
New "Listening" section in Analytics tab.
Daily web search for: "{business name}" OR "{business name} {city}" site:instagram.com OR facebook.com.
Show results as mention cards.
AI sentiment: positive/negative/neutral tag on each mention.
Alert if negative mention spike (>3 negative in 24hrs).
Log to `aria_ai_calls`.

### 7. Competitor social benchmarking
Pull competitor names from `aria_competitor_watches`.
For each: estimate their posting frequency + engagement (via Google search for their social).
Show: "You post 3x/week. Dan Murphy's posts 8x/week. Consider increasing frequency."
Simple comparison table.

### 8. AI caption improvements (upgrade existing)
Currently: generates caption. Upgrade:
- Platform-specific formatting: Instagram (hashtags), Facebook (longer), LinkedIn (professional)
- 3 caption variants per generation (A/B/C options)
- Tone selector: Playful / Professional / Urgent / Informative
- Character count warning per platform (Instagram 2200, Twitter 280, LinkedIn 3000)

## DB migrations
```sql
CREATE TABLE IF NOT EXISTS social_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  platform text, message_type text, author_name text, author_handle text,
  content text, post_url text, received_at timestamptz DEFAULT now(),
  is_read boolean DEFAULT false, replied_at timestamptz, reply_text text
);
CREATE TABLE IF NOT EXISTS social_content_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  asset_type text CHECK (asset_type IN ('image','caption','hashtag_set')),
  name text, content text, image_url text, tags text[],
  created_at timestamptz DEFAULT now()
);
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS approved_at timestamptz;
```

## Page structure (tabs)
**Calendar** | **Inbox** | **Library** | **Analytics** | **Create** (existing)

## Design & quality bar
Must feel as polished as Buffer's dashboard. Calendar must look like a real editorial calendar.
Inbox: clean chat-like UI, unread count badge on tab.
Analytics: recharts graphs matching Financial Trust palette.

## Execution
1. Run DB migrations via Supabase MCP
2. Read ALL pre-edit files fully
3. Add features additively — never remove existing calendar/create/generate functionality
4. All AI calls log to `aria_ai_calls`
5. `npx tsc --noEmit` — zero errors
6. `npm run build` — must pass
7. `git add -A && git commit -m "feat: social — Hootsuite-level unified inbox, content library, bulk scheduling, approval workflow, analytics, brand listening" && git push`
