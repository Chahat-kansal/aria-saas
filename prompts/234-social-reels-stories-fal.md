# Prompt 234 — Reel Generator: Image-to-Reel + Text-to-Reel with Full Customisation

## Rules BEFORE starting
1. Read full file tree: `find src -type f -name "*.ts" -o -name "*.tsx" | head -200`
2. Read COMPLETE content of every file you modify
3. Read all supabase/migrations/ to understand full DB schema
4. `npm install` after adding any package
5. `npx tsc --noEmit` — fix ALL errors before committing
6. ONE commit: `feat(social): Reel generator — image-to-reel, text-to-reel, full customisation`
7. UPGRADE_ONLY — never remove or weaken anything existing
8. Use str_replace for targeted edits, never rewrite entire files
9. Do NOT touch: vercel.json, pos terminal, AnimatedBg, FlyToCart, CursorGlow

## What exists (read these files in full before touching them)
- `src/app/dashboard/social/page.tsx` — 1418 lines, has generate/approve/publish flow
- `src/app/api/social/generate-video/route.ts` — current video generation (Veo 2.0)
- `src/app/api/aria/social-suggest/route.ts` — generates reel_concept + reel_script fields
- `src/app/api/social/preferences/route.ts` — GET/POST social preferences
- `supabase/migrations/20260505000004_social_media.sql` — social_posts table

## The problem to solve
Right now when an owner clicks "Generate Video", it uses Aria-generated `reel_concept` text as the prompt.
The owner cannot:
- Upload their own shop/product photo to animate
- Write their own scene description
- Choose image-to-reel vs text-to-reel
- Control what actually appears in the video

## What to build

### PART A — DB migration
File: `supabase/migrations/20260604000003_social_reels_stories.sql`

```sql
-- Reel customisation fields on social_posts
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS reel_source_image_url TEXT,   -- owner-uploaded image for image-to-reel
  ADD COLUMN IF NOT EXISTS reel_mode TEXT DEFAULT 'text'
    CHECK (reel_mode IN ('text', 'image', 'auto')),      -- text-to-reel | image-to-reel | auto (Aria picks)
  ADD COLUMN IF NOT EXISTS reel_custom_prompt TEXT,      -- owner-written scene description
  ADD COLUMN IF NOT EXISTS reel_duration_seconds INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS reel_cost_aud NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS fal_request_id TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,               -- final video URL after generation
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'image'
    CHECK (post_type IN ('image', 'reel', 'story')),
  ADD COLUMN IF NOT EXISTS story_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Reel usage log for billing
CREATE TABLE IF NOT EXISTS reel_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  cost_aud NUMERIC(10,4) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  provider TEXT NOT NULL,
  reel_mode TEXT,
  fal_request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reel_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_usage" ON reel_usage_log
  FOR ALL USING (
    business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  );
CREATE INDEX IF NOT EXISTS reel_usage_biz_idx ON reel_usage_log(business_id, created_at DESC);

-- social_preferences: reel customisation defaults
ALTER TABLE social_preferences
  ADD COLUMN IF NOT EXISTS reels_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_by TEXT,
  ADD COLUMN IF NOT EXISTS reel_default_duration INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS reel_default_mode TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS reel_style TEXT DEFAULT 'cinematic',
  ADD COLUMN IF NOT EXISTS preferred_platforms TEXT[] DEFAULT ARRAY['instagram', 'facebook'],
  ADD COLUMN IF NOT EXISTS auto_post_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_text TEXT;
```

### PART B — fal.ai package
Add `"@fal-ai/client": "^1.0.0"` to package.json dependencies.
Run `npm install @fal-ai/client`.

### PART C — Reel Generator API route
**REPLACE** `src/app/api/social/generate-video/route.ts` completely.

This route does TWO things:
- `POST` — start a reel generation job, return immediately
- `GET ?fal_request_id=xxx` — poll status of a running fal job

#### Cost calculation
```typescript
// Kling 2.1 Standard via fal.ai: $0.28 for 5s, $0.056/s after
// Per 10s clip = $0.28 + (5 × $0.056) = $0.56 AUD
function calcCostAUD(durationSeconds: number): number {
  const clips = Math.ceil(durationSeconds / 10)
  return Math.round(clips * 0.56 * 100) / 100
}
```

#### POST handler logic
```typescript
// Body: { post_id, business_id, reel_mode, reel_custom_prompt, reel_source_image_url, duration_seconds, is_admin }

// 1. Verify reels_enabled unless is_admin
// 2. Get the post from social_posts to read existing image_url, reel_concept, caption
// 3. Determine what goes IN the reel:
//    - reel_mode === 'image': use reel_source_image_url as start frame + reel_custom_prompt as motion description
//    - reel_mode === 'text': use reel_custom_prompt as full scene description, no image
//    - reel_mode === 'auto': use post.image_url as start frame + post.reel_concept as prompt
// 4. Calculate cost, return it before generating: { estimated_cost_aud, will_generate: true }
//    But also proceed to generate (fire-and-forget with fal queue)
// 5. Submit to fal.ai:

import * as fal from "@fal-ai/client";
fal.config({ credentials: process.env.FAL_KEY });

// Image-to-reel (fal.ai Kling 2.1 Standard)
const falJob = await fal.queue.submit(
  "fal-ai/kling-video/v2.1/standard/image-to-video",
  {
    input: {
      image_url: sourceImageUrl,   // owner photo or post image
      prompt: videoPrompt,         // scene description
      duration: "10",              // "5" or "10"
      aspect_ratio: "9:16",
    },
  }
);

// Text-to-reel (fal.ai Kling 2.1 Standard text-to-video)
const falJob = await fal.queue.submit(
  "fal-ai/kling-video/v2.1/standard/text-to-video",
  {
    input: {
      prompt: videoPrompt,
      duration: "10",
      aspect_ratio: "9:16",
    },
  }
);

// 6. Save fal_request_id + reel_mode + reel_custom_prompt + reel_source_image_url to social_posts
// 7. Return: { fal_request_id, model_id: "fal-ai/kling-video/v2.1/standard/...", estimated_cost_aud, status: "queued" }
```

#### GET handler (poll status)
```typescript
// Query params: fal_request_id, model_id
const status = await fal.queue.status(model_id, { requestId: fal_request_id, logs: false })
// status.status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED"

// If COMPLETED:
const result = await fal.queue.result(model_id, { requestId: fal_request_id })
const videoUrl = result.data?.video?.url

// Download video, upload to Vercel Blob
// Update social_posts: video_url, reel_cost_aud, post_type='reel'
// Log to reel_usage_log (if not admin)
// Return: { status: "COMPLETED", video_url, cost_aud }

// If IN_PROGRESS or IN_QUEUE:
// Return: { status: "IN_PROGRESS" } or { status: "IN_QUEUE" }

// If FAILED:
// Return: { status: "FAILED", error: "..." }
```

Fallback: if FAL_KEY not set, fall back to existing Veo 2.0 / Runway logic.

### PART D — Reel Generator UI Panel

Add a "🎬 Create Reel" modal/panel to `src/app/dashboard/social/page.tsx`.

**Trigger:** When owner clicks "🎬 Generate Video" button on a post, instead of immediately generating, open a Reel Creator panel for that post.

**State to add:**
```typescript
const [reelCreatorPostId, setReelCreatorPostId] = useState<string | null>(null)
const [reelMode, setReelMode] = useState<'auto' | 'image' | 'text'>('auto')
const [reelCustomPrompt, setReelCustomPrompt] = useState('')
const [reelSourceImage, setReelSourceImage] = useState<string | null>(null)
const [reelDuration, setReelDuration] = useState<10 | 15 | 30>(15)
const [reelGenerating, setReelGenerating] = useState(false)
const [reelPolling, setReelPolling] = useState<Record<string, { requestId: string; modelId: string }>>({})
```

**Reel Creator Panel** (renders as a slide-up panel or modal when reelCreatorPostId is set):

```
┌─────────────────────────────────────────────────────┐
│  🎬  Create a Reel                          [×]     │
│                                                     │
│  Mode                                               │
│  [🖼 Image to Reel] [✍️ Text to Reel] [✨ Auto]      │
│                                                     │
│  ── If "Image to Reel" ──────────────────────────── │
│  Upload your photo (shop, product, team)            │
│  [  Drop image here or click to upload  ]           │
│  OR use the post image already attached ✓           │
│                                                     │
│  What should happen in the video?                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ e.g. "Camera slowly zooms into the coffee    │   │
│  │  cup as steam rises, warm morning light"    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ── If "Text to Reel" ───────────────────────────── │
│  Describe your reel                                 │
│  ┌─────────────────────────────────────────────┐   │
│  │ e.g. "A busy Melbourne cafe at morning rush, │   │
│  │  barista making flat white, cosy atmosphere" │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ── If "Auto" ───────────────────────────────────── │
│  Aria uses your post image + caption to decide     │
│                                                     │
│  Duration      Cost                                 │
│  [10s] [15s] [30s]    ~A$0.56 / $1.12 / $1.68     │
│                                                     │
│  ⚠ This Reel will cost ~A$1.12 added to your bill  │
│                                                     │
│  [Cancel]  [✦ Generate Reel — A$1.12]              │
└─────────────────────────────────────────────────────┘
```

**Image upload in the panel:**
- File input, accept="image/*"
- On select: upload to `/api/social/upload-image` (simple upload → Vercel Blob → return URL)
- Show thumbnail preview once uploaded
- OR: checkbox "Use image already on this post" — uses post.image_url

**Generate button action:**
```typescript
async function startReelGeneration() {
  setReelGenerating(true)
  const post = posts.find(p => p.id === reelCreatorPostId)
  const res = await fetch('/api/social/generate-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_id: reelCreatorPostId,
      business_id: bid,
      reel_mode: reelMode,
      reel_custom_prompt: reelCustomPrompt || post?.reel_concept || post?.caption,
      reel_source_image_url: reelMode === 'image' ? (reelSourceImage || post?.image_url) : null,
      duration_seconds: reelDuration,
    }),
  })
  const d = await res.json()
  if (d.fal_request_id) {
    // Start polling
    setReelPolling(prev => ({
      ...prev,
      [reelCreatorPostId!]: { requestId: d.fal_request_id, modelId: d.model_id }
    }))
    setReelCreatorPostId(null) // close panel
    // Show "⏳ Generating..." on the post card
  } else {
    alert(d.error || 'Generation failed')
  }
  setReelGenerating(false)
}
```

**Polling effect:**
```typescript
useEffect(() => {
  if (Object.keys(reelPolling).length === 0) return
  const interval = setInterval(async () => {
    for (const [postId, { requestId, modelId }] of Object.entries(reelPolling)) {
      const res = await fetch(`/api/social/generate-video?fal_request_id=${requestId}&model_id=${encodeURIComponent(modelId)}`)
      const d = await res.json()
      if (d.status === 'COMPLETED') {
        // Update post in state with video_url
        setPosts(prev => prev.map(p => p.id === postId
          ? { ...p, video_url: d.video_url, post_type: 'reel', reel_cost_aud: d.cost_aud }
          : p
        ))
        // Remove from polling
        setReelPolling(prev => { const n = { ...prev }; delete n[postId]; return n })
      } else if (d.status === 'FAILED') {
        setReelPolling(prev => { const n = { ...prev }; delete n[postId]; return n })
      }
    }
  }, 5000)
  return () => clearInterval(interval)
}, [reelPolling])
```

**On each post card, replace the current "Generate Video" button section with:**
```tsx
{/* Reel creator trigger */}
{!reelsEnabled ? (
  <button onClick={() => setShowReelsModal(true)} ...>
    🎬 Enable Reels (Add-on)
  </button>
) : reelPolling[post.id] ? (
  <span style={{ fontSize: 11, color: '#3B82F6', padding: '5px 12px' }}>
    ⏳ Generating Reel...
  </span>
) : post.video_url ? (
  <div>
    <video src={post.video_url} controls style={{ width: '100%', maxHeight: 200, borderRadius: 8 }} />
    {post.reel_cost_aud && (
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
        🎬 A${post.reel_cost_aud.toFixed(2)} added to bill
      </p>
    )}
  </div>
) : (
  <button onClick={() => {
    setReelCreatorPostId(post.id)
    setReelMode('auto')
    setReelCustomPrompt(post.reel_concept || '')
    setReelSourceImage(null)
    setReelDuration(15)
  }} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(59,130,246,0.4)',
    background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit' }}>
    🎬 Create Reel
  </button>
)}
```

**Reel Creator Panel renders as a full-screen overlay** at the end of the page return, when `reelCreatorPostId !== null`. Build it with all the fields described above. Use the design tokens (forest green, sage, Fraunces) consistent with Aria design system.

### PART E — Image upload route
Create `src/app/api/social/upload-image/route.ts`

Simple POST route:
- Accept multipart form data with an image file
- Upload to Vercel Blob: `social-uploads/{business_id}/{Date.now()}.jpg`
- Return `{ url: string }`
- Auth: requires valid session + business ownership
- Max file size: 10MB
- Accept: image/jpeg, image/png, image/webp

```typescript
import { put } from '@vercel/blob'

export async function POST(req: Request) {
  // ... auth check ...
  const formData = await req.formData()
  const file = formData.get('file') as File
  const businessId = formData.get('business_id') as string
  // ... ownership check ...
  const bytes = await file.arrayBuffer()
  const blob = await put(
    `social-uploads/${businessId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`,
    bytes,
    { access: 'public', contentType: file.type }
  )
  return NextResponse.json({ url: blob.url })
}
```

### PART F — Upgrade the "Generate Video" button trigger
In the social page, the current "Generate Video" button calls `generateVideo(post.id, post.reel_concept)` directly.

Replace this with opening the Reel Creator panel instead:
```typescript
// OLD:
onClick={() => generateVideo(post.id, post.reel_concept)}

// NEW:
onClick={() => {
  setReelCreatorPostId(post.id)
  setReelMode('auto')
  setReelCustomPrompt(post.reel_concept || post.caption || '')
  setReelSourceImage(null)
  setReelDuration(15)
}}
```

Keep the old `generateVideo` function but it is now only called from inside the Reel Creator panel's submit action.

## Final checklist
- [ ] `npm install @fal-ai/client` succeeded — check package-lock.json updated
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Image upload route handles missing FAL_KEY gracefully (falls back to Veo)
- [ ] Polling cleans up correctly (no memory leaks)
- [ ] Cost is shown in AUD before generating
- [ ] reelPolling state is per post.id not global
- [ ] Reel Creator panel closes correctly on cancel or after starting generation
- [ ] All new social_posts columns use IF NOT EXISTS
- [ ] Existing posts with NULL video_url and NULL post_type still display correctly
- [ ] The reels_enabled gate is still enforced in the generate-video route
- [ ] Image upload validates file type and size before uploading
- [ ] fal.ai errors are caught and shown to user, not silently swallowed
