# Prompt 234 — Social Media Reels, Stories & fal.ai Video

## Context
Aria OS — Next.js 14, Supabase, Vercel. Repo: github.com/Chahat-kansal/aria-saas.
UPGRADE_ONLY rule: never remove or weaken any existing feature.
One commit for this entire prompt. Run `npx tsc --noEmit` before committing.

## What exists right now

### social_posts table columns (from migration):
- id, business_id, platform, status, caption, hashtags
- image_url, image_prompt, scheduled_for, published_at
- platform_post_id, aria_reasoning, industry_context, performance
- created_at, approved_at
- video_url (added recently), content_type (added recently)

### Publish route currently handles:
- Facebook: image post (photos endpoint) OR text post (feed endpoint)
- Instagram: image post OR Reel (REELS media_type) — Stories NOT supported
- Google Business: text post
- Facebook Reels: NOT supported
- Stories (Instagram or Facebook): NOT supported

### generate-video route:
- Uses Veo 2.0 via GEMINI_API_KEY
- Returns job_id only (async polling separate)
- 5 seconds max, $0.35/sec — too expensive

### social_preferences table has:
- reels_enabled, reels_addon_accepted_at, reels_addon_accepted_by

## What to build — all 5 phases in ONE commit

### PHASE 1 — DB migration
Create file: `supabase/migrations/20260604000003_social_reels_stories.sql`

```sql
-- Extend social_posts for Reels, Stories, audio
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS story_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reel_cost_aud NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS reel_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS fal_request_id TEXT,
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'image'
    CHECK (post_type IN ('image', 'reel', 'story'));

-- Index for story expiry cleanup
CREATE INDEX IF NOT EXISTS social_posts_story_expires_idx
  ON social_posts(story_expires_at)
  WHERE story_expires_at IS NOT NULL;

-- Track Reel addon usage per business per month for billing
CREATE TABLE IF NOT EXISTS reel_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  cost_aud NUMERIC(10,4) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  provider TEXT NOT NULL,
  fal_request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reel_usage_log_business_idx ON reel_usage_log(business_id, created_at DESC);
ALTER TABLE reel_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_usage" ON reel_usage_log
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  );
```

### PHASE 2 — fal.ai video generation route
Replace `src/app/api/social/generate-video/route.ts` completely.

**Requirements:**
- Install `@fal-ai/client` — add to package.json
- Primary provider: fal.ai Kling 2.1 Standard (`fal-ai/kling-video/v2.1/standard/image-to-video`)
  - Cost: $0.28 for 5s, $0.05/sec after = $0.53 for 10s clip
  - Supports image-to-video (use post image_url as start frame)
  - Max 10 seconds per clip
  - 9:16 aspect ratio for Reels
  - Duration options: 5 or 10 seconds
- Fallback: Veo 2.0 via GEMINI_API_KEY (existing logic, keep it)
- Second fallback: Runway (RUNWAY_API_KEY, keep existing)

**Route behaviour:**
- Accept: `{ prompt, image_url, business_id, post_id, duration_seconds (default 15), post_type }`
- For Reels: duration_seconds can be 10, 15, 20, or 30
  - 10s = 1 clip ($0.53 AUD)
  - 15s = submit as 15s to fal (if supported) or 2 clips ($0.80 AUD)
  - 30s = 3 × 10s clips submitted in parallel ($1.59 AUD)
- Before generating: check `reels_enabled` on social_preferences (skip check for admin routes)
- Calculate cost BEFORE generating, return `estimated_cost_aud` in the response
- After generating: log to `reel_usage_log`, update `social_posts` with `reel_cost_aud`, `reel_duration_seconds`, `fal_request_id`
- Return: `{ job_id, provider, estimated_cost_aud, video_url (if sync), status }`
- fal.ai uses async queue — return `fal_request_id` and a polling endpoint
- For Stories: 9:16, 15s max, same cost structure
- Add `GET /api/social/generate-video?request_id=xxx` for polling fal job status

**fal.ai integration pattern:**
```typescript
import * as fal from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const result = await fal.queue.submit("fal-ai/kling-video/v2.1/standard/image-to-video", {
  input: {
    image_url: imageUrl,
    prompt: prompt,
    duration: "10", // "5" or "10"
    aspect_ratio: "9:16",
  },
});
// result.request_id for polling

// Poll:
const status = await fal.queue.status("fal-ai/kling-video/v2.1/standard/image-to-video", {
  requestId: result.request_id,
  logs: true,
});
// status.status === "COMPLETED" | "IN_PROGRESS" | "IN_QUEUE" | "FAILED"

// Get result:
const output = await fal.queue.result("fal-ai/kling-video/v2.1/standard/image-to-video", {
  requestId: result.request_id,
});
// output.data.video.url
```

**Cost calculation function:**
```typescript
function calcReelCost(durationSeconds: number): number {
  // Kling 2.1 Standard: $0.28 for 5s, $0.056/sec after
  // We round up to nearest 10s clip boundary
  const clips = Math.ceil(durationSeconds / 10);
  const costPerClip = 0.28 + (5 * 0.056); // 10s clip = $0.28 + 5 extra seconds
  return Math.round(clips * costPerClip * 100) / 100; // round to 2dp
}
```

### PHASE 3 — Upgrade publish route
File: `src/app/api/social/publish/route.ts`

Add these content types (UPGRADE ONLY — keep all existing logic):

**Instagram Stories:**
```typescript
// In the Instagram branch, check post_type
if (post.post_type === 'story') {
  // Stories: media_type not set, use video_url or image_url
  const storyBody = post.video_url
    ? {
        media_type: 'STORIES',
        video_url: post.video_url,
        access_token: conn.access_token,
      }
    : {
        image_url: await ensurePublicImageUrl(post.image_url, post.id),
        access_token: conn.access_token,
        // Note: for Stories, do NOT set media_type for images — just publish directly
      };
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${conn.instagram_account_id}/media`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(storyBody) }
  );
  const { id: creationId, error: cErr } = await containerRes.json();
  if (cErr) throw new Error(cErr.message);
  // For video stories, poll for FINISHED
  if (post.video_url) {
    // same polling loop as Reels
  }
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${conn.instagram_account_id}/media_publish`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: conn.access_token }) }
  );
  const pubData = await publishRes.json();
  if (pubData.error) throw new Error(pubData.error.message);
  platformPostId = pubData.id || null;
}
```

**Facebook Reels:**
```typescript
// In the Facebook branch, check post_type
if (post.post_type === 'reel' && post.video_url) {
  // Facebook Reels API
  const initRes = await fetch(
    `https://graph.facebook.com/v19.0/${conn.platform_page_id}/video_reels`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'start',
        access_token: conn.access_token,
      }),
    }
  );
  const { video_id, upload_url } = await initRes.json();
  // Upload video bytes to upload_url
  const videoRes = await fetch(post.video_url);
  const videoBuffer = await videoRes.arrayBuffer();
  await fetch(upload_url, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${conn.access_token}`,
      'Content-Type': 'video/mp4',
    },
    body: videoBuffer,
  });
  // Finish upload
  const finishRes = await fetch(
    `https://graph.facebook.com/v19.0/${conn.platform_page_id}/video_reels`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id,
        upload_phase: 'finish',
        video_state: 'PUBLISHED',
        description: fullCaption,
        access_token: conn.access_token,
      }),
    }
  );
  const finishData = await finishRes.json();
  if (finishData.error) throw new Error(finishData.error.message);
  platformPostId = video_id || null;
}
```

**Facebook Stories:**
```typescript
// Facebook Stories via Pages API
if (post.post_type === 'story') {
  const storyRes = await fetch(
    `https://graph.facebook.com/v19.0/${conn.platform_page_id}/photo_stories`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: post.image_url,
        access_token: conn.access_token,
      }),
    }
  );
  const storyData = await storyRes.json();
  if (storyData.error) throw new Error(storyData.error.message);
  platformPostId = storyData.post_id || null;
}
```

### PHASE 4 — Social page UI upgrades
File: `src/app/dashboard/social/page.tsx`

**UPGRADE ONLY — do not remove any existing functionality.**

Add to the existing post card UI:

1. **Post type badge** — show "📸 Image", "🎬 Reel", or "⏱ Story (24h)" based on `post.post_type`

2. **Cost display for Reels** — when a post has `reel_cost_aud`, show:
   ```
   🎬 Reel · $X.XX AUD · added to monthly bill
   ```

3. **Generate Reel button** — upgrade the existing button:
   - Show duration selector before generating: 10s / 15s / 30s
   - Show estimated cost for selected duration BEFORE generating
   - After clicking generate, show spinner with "Generating Reel... (~60s)"
   - Use polling to check fal job status every 5s

4. **Story button** — add next to the existing Generate Image/Video buttons:
   - "📤 Post as Story (24h)" — sets post_type to story, posts as Story format
   - Show "Stories disappear after 24 hours" note

5. **Polling for fal jobs** — when `fal_request_id` exists on a post, show a "⏳ Generating..." state and poll `GET /api/social/generate-video?request_id=xxx` every 5 seconds until complete

### PHASE 5 — Admin social features
The admin influencer page at `/admin/influencer` already handles Reels.
Add Stories support:
- In the Generate panel: add "Post Type" toggle — Reel | Story
- Stories: no cost, generate 15s video, post as Story to @ariaos.au
- Update `/api/aria/influencer/generate` to accept `post_type` param
- Update `/api/aria/influencer/publish` to handle Stories via Instagram Stories API

## Critical rules
1. `npx tsc --noEmit` must pass — fix ALL TypeScript errors before committing
2. `npm run build` must pass
3. One commit: `feat(social): Reels + Stories + fal.ai video — phases 1-5 complete`
4. Add `@fal-ai/client` to package.json dependencies
5. Add `FAL_KEY` to the list of env vars used (but do NOT hardcode it)
6. UPGRADE_ONLY — every existing feature must still work after this change
7. The `post_type` column defaults to 'image' so all existing posts still work
8. Cost display is informational — actual billing is handled separately
9. For Stories: set `story_expires_at = NOW() + INTERVAL '24 hours'` on publish
10. Read the full dependency chain before editing any file:
    - social_posts → publish route → social page UI
    - social_preferences → generate-video route → social page UI
    - Do NOT break the existing publish-scheduled cron

## Files to create/modify
- CREATE: `supabase/migrations/20260604000003_social_reels_stories.sql`
- MODIFY: `src/app/api/social/generate-video/route.ts` (full replacement)
- MODIFY: `src/app/api/social/publish/route.ts` (additive only)
- MODIFY: `src/app/dashboard/social/page.tsx` (additive only)
- MODIFY: `src/app/admin/influencer/page.tsx` (add Stories toggle)
- MODIFY: `src/app/api/aria/influencer/generate/route.ts` (add post_type)
- MODIFY: `src/app/api/aria/influencer/publish/route.ts` (add Stories support)
- MODIFY: `package.json` (add @fal-ai/client)
