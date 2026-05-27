# Prompt 65 — TikTok Business Integration: Video Performance in Ask Aria

## What this unlocks
Owner asks: "Which TikTok got the most views this week?" or "Is TikTok driving customers?"
Aria pulls: video stats, follower growth, profile insights from TikTok for Business API.
No partnership needed — TikTok for Business API is free with OAuth.

## Pre-edit checklist (MANDATORY)
1. `cat src/app/dashboard/integrations/page.tsx` — full read
2. Check DB: `businesses` table — any tiktok columns?

## What to build

### 1. DB migration
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tiktok_access_token text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tiktok_refresh_token text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tiktok_advertiser_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tiktok_connected boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS tiktok_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  followers integer, total_views bigint, total_likes integer,
  top_video_title text, top_video_views integer,
  videos_this_week integer, avg_views_per_video integer,
  synced_at timestamptz DEFAULT now()
);
```

### 2. OAuth connect
TikTok for Business OAuth 2.0:
Redirect: `https://business-api.tiktok.com/portal/auth?app_id={APP_ID}&redirect_uri={CALLBACK}&scope=user.info.basic,video.list,business.get`

`src/app/api/integrations/tiktok/connect/route.ts`
`src/app/api/integrations/tiktok/callback/route.ts`
- Exchange code for access_token + refresh_token
- Store in businesses table

### 3. Data sync
`src/app/api/integrations/tiktok/sync/route.ts`
TikTok Business API:
- `GET https://business-api.tiktok.com/open_api/v1.3/user/info/` — follower count, profile
- `GET https://business-api.tiktok.com/open_api/v1.3/video/list/` — recent videos with stats
  - Filter: last 7 days
  - Fields: video_id, title, cover, share_url, statistics (play_count, like_count, comment_count, share_count)

Cache in tiktok_cache with 2hr TTL (TikTok rate limits are strict).

### 4. Ask Aria tool
Add `query_tiktok` to aria-tools.ts:
Returns: follower count, top video this week (title + views), avg views, total engagement.
Aria uses for: "Which video performed best?", "Is TikTok growing my following?", "Should I post more?"

### 5. Integrations page card
- TikTok logo + connected status
- Mini summary: "12.4K followers · Top video: 8,200 views · 3 videos this week"
- Connect button links to TikTok OAuth

### 6. Env vars needed
- `TIKTOK_APP_ID`
- `TIKTOK_APP_SECRET`

## Execution order
1. DB migrations via Supabase MCP
2. OAuth routes
3. Sync route
4. Add query_tiktok to aria-tools.ts
5. Add card to integrations page
6. `npx tsc --noEmit` + `npm run build` → must pass
7. Single commit: "feat: TikTok Business integration — OAuth, video sync, Ask Aria tool"
