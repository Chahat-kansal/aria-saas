# Prompt 234 — Social Media Complete Overhaul: Reels, Stories, fal.ai, Admin Influencer, Business Customisation

## Critical rules BEFORE starting
1. Read the FULL file tree: `find src -type f | head -200`
2. Read FULL content of every file you will modify
3. Read the complete DB schema from all migrations in supabase/migrations/
4. Run `npm install` after adding packages
5. Run `npx tsc --noEmit` — fix ALL errors before committing
6. ONE commit for everything: `feat(social): complete social overhaul — Reels + Stories + fal.ai + influencer + business customisation`
7. UPGRADE_ONLY: never remove or weaken ANY existing feature
8. Do NOT rewrite files — use str_replace for targeted edits where possible
9. Do NOT touch: vercel.json, pos terminal, AnimatedBg, FlyToCart, CursorGlow

## Architecture — two completely separate systems

### SYSTEM A — Admin Influencer Studio (/admin/influencer)
- Uses the AI character (Higgsfield image) + Veo 2.0 to generate videos
- Posts to @ariaos.au — AriaOS brand Instagram page
- Features registered Aria customer businesses in content
- NO charges — admin cost only
- Already built: basic generate + approve + publish flow
- NEEDS: Stories support, fal.ai for cheaper longer video, better UI

### SYSTEM B — Business Owner Social (/dashboard/social)
- Business uses their OWN Instagram/Facebook accounts
- Uses their own product images OR Aria-generated images
- Posts Images / Reels / Stories to THEIR account
- Reels charged extra (addon, explicit opt-in already built)
- Already built: image posts, generate video button, caption generation
- NEEDS: fal.ai integration, Stories, full customisation panel, cost display before generating

## PHASE 1 — DB migration
File: `supabase/migrations/20260604000003_social_reels_stories.sql`

```sql
-- Extend social_posts
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS story_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reel_cost_aud NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS reel_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS fal_request_id TEXT,
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'image'
    CHECK (post_type IN ('image', 'reel', 'story'));

CREATE INDEX IF NOT EXISTS social_posts_story_expires_idx
  ON social_posts(story_expires_at)
  WHERE story_expires_at IS NOT NULL;

-- Reel billing log
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
ALTER TABLE reel_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_usage" ON reel_usage_log
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  );
CREATE INDEX IF NOT EXISTS reel_usage_log_biz_idx ON reel_usage_log(business_id, created_at DESC);

-- Extend social_preferences for business customisation
ALTER TABLE social_preferences
  ADD COLUMN IF NOT EXISTS preferred_platforms TEXT[] DEFAULT ARRAY['instagram','facebook'],
  ADD COLUMN IF NOT EXISTS auto_post_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_post_time TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_text TEXT,
  ADD COLUMN IF NOT EXISTS default_post_type TEXT DEFAULT 'image'
    CHECK (default_post_type IN ('image','reel','story')),
  ADD COLUMN IF NOT EXISTS reels_default_duration INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS story_template TEXT DEFAULT 'standard';
```

## PHASE 2 — fal.ai video generation

### Install package
Add to package.json dependencies: `"@fal-ai/client": "^1.0.0"`
Run: `npm install @fal-ai/client`

### Replace generate-video route
File: `src/app/api/social/generate-video/route.ts`

Full replacement. This route handles ALL video generation for business social posts.

Requirements:
- `POST` — start video generation, return immediately with job info
- `GET ?fal_request_id=xxx&model_id=xxx` — poll job status
- Provider priority:
  1. fal.ai Kling 2.1 Standard (FAL_KEY env var) — primary, cheapest
  2. Veo 2.0 (GEMINI_API_KEY) — fallback
  3. Runway (RUNWAY_API_KEY) — last resort

Cost calculation (Kling 2.1 Standard via fal.ai):
- 5s clip: $0.28 AUD
- 10s clip: $0.28 + (5 × $0.056) = $0.56 AUD
- 15s Reel (2 clips): $0.56 × 2 = $1.12 AUD
- 30s Reel (3 clips): $0.56 × 3 = $1.68 AUD

POST body: `{ prompt, image_url, business_id, post_id, duration_seconds, post_type, is_admin }`
- `duration_seconds`: 10 | 15 | 30 (default 15 for Reels, 15 for Stories)
- `post_type`: 'reel' | 'story'
- `is_admin`: boolean — skip reels_enabled check, skip cost log

Response: `{ fal_request_id, model_id, estimated_cost_aud, status: 'queued' }`

GET response: `{ status: 'IN_QUEUE'|'IN_PROGRESS'|'COMPLETED'|'FAILED', video_url?, progress? }`

On COMPLETED:
- Download video from fal CDN URL
- Upload to Vercel Blob: `aria-social/reels/{post_id}-{Date.now()}.mp4`
- Update social_posts: set video_url, reel_cost_aud, reel_duration_seconds, fal_request_id, post_type
- Log to reel_usage_log (if not admin)
- Return video_url

fal.ai Kling integration:
```typescript
import * as fal from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

// Submit job
const { request_id } = await fal.queue.submit(
  "fal-ai/kling-video/v2.1/standard/image-to-video",
  {
    input: {
      image_url: imageUrl,      // business product image as start frame
      prompt: prompt,
      duration: "10",           // "5" or "10" — max per clip
      aspect_ratio: "9:16",     // vertical for Reels and Stories
    },
  }
);

// Poll
const status = await fal.queue.status(
  "fal-ai/kling-video/v2.1/standard/image-to-video",
  { requestId: request_id, logs: true }
);

// Result
const result = await fal.queue.result(
  "fal-ai/kling-video/v2.1/standard/image-to-video",
  { requestId: request_id }
);
const videoUrl = result.data.video.url;
```

For 30-second Reels (3 clips): submit 3 fal jobs in sequence, each using the last frame of the previous clip. Return all 3 request_ids. When all 3 complete, use ffmpeg-static to concatenate into one MP4.

## PHASE 3 — Upgrade publish route (ADDITIVE ONLY)
File: `src/app/api/social/publish/route.ts`

Read the full file first. Add these content types without touching any existing code:

Check `post.post_type` in the Instagram and Facebook branches:

**Instagram Stories (image or video):**
```typescript
if ((post as any).post_type === 'story') {
  const isVideoStory = !!(post as any).video_url;
  const storyBody = isVideoStory
    ? { media_type: 'STORIES', video_url: (post as any).video_url, access_token: conn.access_token }
    : { media_type: 'STORIES', image_url: await ensurePublicImageUrl(post.image_url!, post.id), access_token: conn.access_token };
  const cRes = await fetch(`https://graph.facebook.com/v19.0/${(conn as any).instagram_account_id}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(storyBody)
  });
  const { id: cId, error: cErr } = await cRes.json();
  if (cErr) throw new Error(cErr.message);
  // Poll if video story
  if (isVideoStory) {
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const s = await fetch(`https://graph.facebook.com/v19.0/${cId}?fields=status_code&access_token=${(conn as any).access_token}`).then(r => r.json());
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR') throw new Error('Story video processing failed');
    }
  }
  const pRes = await fetch(`https://graph.facebook.com/v19.0/${(conn as any).instagram_account_id}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: cId, access_token: (conn as any).access_token })
  });
  const pData = await pRes.json();
  if (pData.error) throw new Error(pData.error.message);
  platformPostId = pData.id || null;
  // Set story expiry in DB
  await supabaseAdmin.from('social_posts').update({ story_expires_at: new Date(Date.now() + 24*60*60*1000).toISOString() }).eq('id', post.id);
}
```

**Facebook Reels:**
```typescript
if ((post as any).post_type === 'reel' && (post as any).video_url) {
  // Facebook Reels upload flow
  const initRes = await fetch(`https://graph.facebook.com/v19.0/${(conn as any).platform_page_id}/video_reels`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: (conn as any).access_token })
  });
  const { video_id, upload_url, error: initErr } = await initRes.json();
  if (initErr) throw new Error(initErr.message);
  // Download + upload video
  const vRes = await fetch((post as any).video_url);
  const vBuf = await vRes.arrayBuffer();
  await fetch(upload_url, {
    method: 'POST',
    headers: { Authorization: `OAuth ${(conn as any).access_token}`, 'Content-Type': 'video/mp4' },
    body: vBuf,
  });
  // Finish and publish
  const finRes = await fetch(`https://graph.facebook.com/v19.0/${(conn as any).platform_page_id}/video_reels`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id, upload_phase: 'finish', video_state: 'PUBLISHED', description: fullCaption, access_token: (conn as any).access_token })
  });
  const finData = await finRes.json();
  if (finData.error) throw new Error(finData.error.message);
  platformPostId = video_id || null;
}
```

**Facebook Stories:**
```typescript
if ((post as any).post_type === 'story' && post.image_url) {
  const sRes = await fetch(`https://graph.facebook.com/v19.0/${(conn as any).platform_page_id}/photo_stories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: post.image_url, access_token: (conn as any).access_token })
  });
  const sData = await sRes.json();
  if (sData.error) throw new Error(sData.error.message);
  platformPostId = sData.post_id || null;
  await supabaseAdmin.from('social_posts').update({ story_expires_at: new Date(Date.now() + 24*60*60*1000).toISOString() }).eq('id', post.id);
}
```

## PHASE 4 — Social page UI (ADDITIVE ONLY)
File: `src/app/dashboard/social/page.tsx`

Read the entire file first (1418 lines). Make targeted str_replace edits only.

### 4a — Add post_type and duration to SocialPost interface
Add to the interface: `post_type?: string; reel_cost_aud?: number; fal_request_id?: string; story_expires_at?: string; reel_duration_seconds?: number;`

### 4b — Add duration state and cost display
Add new state variables:
```typescript
const [reelDuration, setReelDuration] = useState<10 | 15 | 30>(15)
const [reelEstimatedCost, setReelEstimatedCost] = useState<number | null>(null)
const [falPolling, setFalPolling] = useState<Record<string, string>>({}) // postId → fal_request_id
```

Cost calculation function:
```typescript
function calcReelCost(duration: number): number {
  // Kling 2.1 Standard: 10s clip = $0.56 AUD
  const clips = Math.ceil(duration / 10);
  return Math.round(clips * 0.56 * 100) / 100;
}
```

### 4c — Upgrade generateVideo function
Replace the existing generateVideo function body:
- First show cost for selected duration
- Then generate: pass `duration_seconds: reelDuration, post_type: 'reel', business_id: bid`
- On response: store `fal_request_id` in `falPolling` state
- Start polling `GET /api/social/generate-video?fal_request_id=xxx&model_id=xxx` every 5 seconds
- When COMPLETED: reload posts, show success

### 4d — Add Story button
Next to the existing Generate Video button, add:
```tsx
<button onClick={() => postAsStory(post.id)}
  style={{ padding: '7px 14px', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700,
    fontSize: 12, cursor: 'pointer', background: 'rgba(139,92,246,0.1)',
    border: '1px solid rgba(139,92,246,0.3)', color: '#8B5CF6' }}>
  📤 Post as Story
</button>
```

`postAsStory` function: updates `post_type = 'story'` on the post via PATCH to social_posts, then calls publish.

### 4e — Add Reel duration + cost selector
Above the Generate Video button, when reels enabled:
```tsx
<div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
  <span style={{ fontSize: 11, color: C.dim }}>Duration:</span>
  {([10, 15, 30] as const).map(d => (
    <button key={d} onClick={() => { setReelDuration(d); setReelEstimatedCost(calcReelCost(d)); }}
      style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        background: reelDuration === d ? 'rgba(251,191,36,0.15)' : 'transparent',
        border: '1px solid ' + (reelDuration === d ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'),
        color: reelDuration === d ? '#F59E0B' : 'var(--text-secondary)' }}>
      {d}s
    </button>
  ))}
  <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700 }}>
    ~A${calcReelCost(reelDuration).toFixed(2)}
  </span>
</div>
```

### 4f — Show polling status on posts
For posts where `falPolling[post.id]` exists, show:
```tsx
<div style={{ padding: '8px 12px', background: 'rgba(251,191,36,0.08)', borderRadius: 8, fontSize: 12, color: '#F59E0B' }}>
  ⏳ Generating Reel... checking status
</div>
```

### 4g — Show Reel cost on published posts
If `post.reel_cost_aud`:
```tsx
<div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
  🎬 Reel · A${post.reel_cost_aud?.toFixed(2)} added to bill
</div>
```

### 4h — Show Story expiry badge
If `post.story_expires_at`:
```tsx
<span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99,
  background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', fontWeight: 700 }}>
  ⏱ Story · expires {new Date(post.story_expires_at).toLocaleDateString('en-AU')}
</span>
```

## PHASE 5 — Business Preferences Panel upgrade
File: `src/app/dashboard/social/page.tsx` — the preferences section

In the existing preferences panel (at bottom of social page), add new preference controls:

**Preferred platforms** — which platforms to post to:
```tsx
<div style={{ marginBottom: 16 }}>
  <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>Post to platforms</div>
  <div style={{ display: 'flex', gap: 8 }}>
    {['instagram', 'facebook'].map(p => {
      const active = (prefs as any).preferred_platforms?.includes(p) ?? true;
      return (
        <button key={p} onClick={() => {
          const current = (prefs as any).preferred_platforms ?? ['instagram', 'facebook'];
          const updated = active ? current.filter((x: string) => x !== p) : [...current, p];
          setPrefs(prev => ({ ...prev, preferred_platforms: updated } as any));
        }} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          background: active ? 'rgba(127,184,151,0.15)' : 'transparent',
          border: '1px solid ' + (active ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.1)'),
          color: active ? '#7FB897' : 'var(--text-secondary)',
          textTransform: 'capitalize' }}>
          {p === 'instagram' ? '📸' : '👍'} {p}
        </button>
      );
    })}
  </div>
</div>
```

**Default post type:**
```tsx
<div style={{ marginBottom: 16 }}>
  <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>Default content type</div>
  <div style={{ display: 'flex', gap: 8 }}>
    {[['image','📸 Image'], ['reel','🎬 Reel'], ['story','📤 Story']].map(([val, label]) => (
      <button key={val} onClick={() => setPrefs(p => ({ ...p, default_post_type: val } as any))}
        style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          background: (prefs as any).default_post_type === val ? 'rgba(127,184,151,0.15)' : 'transparent',
          border: '1px solid ' + ((prefs as any).default_post_type === val ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.1)'),
          color: (prefs as any).default_post_type === val ? '#7FB897' : 'var(--text-secondary)' }}>
        {label}
      </button>
    ))}
  </div>
</div>
```

**Auto-post toggle:**
```tsx
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
  <div>
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Auto-post weekly</div>
    <div style={{ fontSize: 11, color: C.dim }}>Aria generates and posts automatically at the best time</div>
  </div>
  <button onClick={() => setPrefs(p => ({ ...p, auto_post_enabled: !(p as any).auto_post_enabled } as any))}
    style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: (prefs as any).auto_post_enabled ? '#7FB897' : 'rgba(255,255,255,0.15)',
      transition: 'background 0.2s', position: 'relative' }}>
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute',
      top: 3, left: (prefs as any).auto_post_enabled ? 23 : 3, transition: 'left 0.2s' }} />
  </button>
</div>
```

**Watermark text:**
```tsx
<div style={{ marginBottom: 16 }}>
  <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>Watermark / branding text (optional)</div>
  <input value={(prefs as any).watermark_text ?? ''} placeholder="e.g. @mybusiness"
    onChange={e => setPrefs(p => ({ ...p, watermark_text: e.target.value } as any))}
    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
</div>
```

Make sure savePrefs() function sends all new preference fields to `/api/social/preferences` POST endpoint.

## PHASE 6 — Admin influencer page upgrades (ADDITIVE ONLY)
File: `src/app/admin/influencer/page.tsx`

Add Stories support to the Generate panel:
```tsx
// Add post_type toggle next to the business selector
const [adminPostType, setAdminPostType] = useState<'reel' | 'story'>('reel')

// In the generate panel, add:
<div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
  <span style={{ fontSize: 11, color: C.dim, alignSelf: 'center' }}>Content type:</span>
  {(['reel', 'story'] as const).map(t => (
    <button key={t} onClick={() => setAdminPostType(t)}
      style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        background: adminPostType === t ? 'rgba(0,229,255,0.12)' : 'transparent',
        border: '1px solid ' + (adminPostType === t ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.1)'),
        color: adminPostType === t ? C.cyan : C.muted,
        textTransform: 'capitalize' }}>
      {t === 'reel' ? '🎬 Reel' : '📤 Story (24h)'}
    </button>
  ))}
</div>
```

Pass `post_type: adminPostType` to the generate API call.

## PHASE 7 — Influencer generate + publish routes (Stories support)
File: `src/app/api/aria/influencer/generate/route.ts`
- Accept `post_type?: 'reel' | 'story'` in request body (default 'reel')
- For Stories: generate a 15-second scene, set `post_type: 'story'` on the influencer_post

File: `src/app/api/aria/influencer/publish/route.ts`
- Check `post.post_type`
- For Stories: use Instagram Stories API (STORIES media_type) instead of REELS
- For Stories: set `story_expires_at = NOW() + 24h` after publishing

## Final checklist before committing
- [ ] `npm install @fal-ai/client` succeeded
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] All new columns use `IF NOT EXISTS` in migrations
- [ ] All existing social posts (post_type NULL) still display correctly (NULL = 'image')
- [ ] The reels_enabled gate still works for business Reels
- [ ] Admin routes bypass the reels_enabled gate (is_admin: true)
- [ ] fal.ai jobs use async queue — never block the request thread beyond 30s
- [ ] All cost calculations use AUD
- [ ] Story posts set story_expires_at correctly
- [ ] No TypeScript errors on any modified file
