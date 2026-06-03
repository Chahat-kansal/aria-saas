# Prompt 234 — Social Media Complete: All 12 Gaps Fixed + Reel Generator

## NON-NEGOTIABLE RULES
1. Read FULL file tree before touching anything: `find src -type f -name "*.ts" -o -name "*.tsx" | sort`
2. Read COMPLETE content of EVERY file you will modify — no assumptions
3. Read ALL supabase/migrations/ files to understand the complete DB schema
4. `npm install` after ANY package change
5. `npx tsc --noEmit` — ZERO errors before committing
6. ONE commit: `feat(social): complete social overhaul — all 12 gaps fixed, Reel generator, Stories, audio merge, TikTok`
7. UPGRADE_ONLY — never remove or weaken any existing feature
8. str_replace for targeted edits — never rewrite entire large files
9. Do NOT touch: vercel.json cron schedules, pos terminal files, AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts

## What exists — read ALL these files in full
- `src/app/dashboard/social/page.tsx` — 1418 lines
- `src/app/api/social/publish/route.ts` — publish to Instagram/Facebook/GBP
- `src/app/api/social/generate-video/route.ts` — current Veo 2.0 video gen
- `src/app/api/social/generate-voiceover/route.ts` — ElevenLabs audio
- `src/app/api/social/approve/route.ts` — post approval
- `src/app/api/social/preferences/route.ts` — social preferences
- `src/app/api/social/reels-addon/route.ts` — reels opt-in gate
- `src/app/api/cron/publish-scheduled/route.ts` — auto-publish cron
- `src/app/api/cron/sync-engagement/route.ts` — engagement metrics sync
- `src/app/api/aria/social-suggest/route.ts` — AI post generation
- `src/app/api/social/calendar/route.ts` — monthly calendar
- `supabase/migrations/20260505000004_social_media.sql` — base schema

---

## SECTION 1 — DATABASE MIGRATION
File: `supabase/migrations/20260604000003_social_reels_stories.sql`

```sql
-- ─────────────────────────────────────────────────────────────
-- Gap 6 fix: approval_status column was missing from social_posts
-- The publish-scheduled cron queries this column — it must exist
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected'));

-- Gap 3/4: Reel content customisation
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'image'
    CHECK (post_type IN ('image','reel','story')),
  ADD COLUMN IF NOT EXISTS reel_mode TEXT DEFAULT 'auto'
    CHECK (reel_mode IN ('auto','image','text')),
  ADD COLUMN IF NOT EXISTS reel_style TEXT DEFAULT 'lifestyle'
    CHECK (reel_style IN ('lifestyle','product_showcase','behind_scenes','flash_sale','testimonial','day_in_life')),
  ADD COLUMN IF NOT EXISTS reel_source_image_url TEXT,
  ADD COLUMN IF NOT EXISTS reel_custom_prompt TEXT,
  ADD COLUMN IF NOT EXISTS reel_duration_seconds INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS reel_cost_aud NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS fal_request_id TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS story_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engagement_data JSONB DEFAULT '{}';

-- Gap 12: story expiry index
CREATE INDEX IF NOT EXISTS social_posts_story_expires_idx
  ON social_posts(story_expires_at)
  WHERE story_expires_at IS NOT NULL;

-- Gap 6: update existing rows to have approval_status based on status
UPDATE social_posts SET approval_status = 'approved'
  WHERE status IN ('approved','scheduled','published') AND approval_status IS NULL;

-- Gap 9: Reel billing log
CREATE TABLE IF NOT EXISTS reel_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  cost_aud NUMERIC(10,4) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  provider TEXT NOT NULL,
  reel_mode TEXT,
  reel_style TEXT,
  fal_request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reel_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_usage" ON reel_usage_log
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS reel_usage_biz_idx ON reel_usage_log(business_id, created_at DESC);

-- Gap 10: Content asset library
CREATE TABLE IF NOT EXISTS social_asset_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'image' CHECK (type IN ('image','video','audio')),
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE social_asset_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_assets" ON social_asset_library
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS social_assets_biz_idx ON social_asset_library(business_id, created_at DESC);

-- Gap 8: Hashtag performance tracking
CREATE TABLE IF NOT EXISTS social_hashtag_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  hashtag TEXT NOT NULL,
  avg_reach NUMERIC,
  avg_likes NUMERIC,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, hashtag)
);
ALTER TABLE social_hashtag_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_hashtag_stats" ON social_hashtag_stats
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Gap 5: Token expiry tracking (add column if missing)
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_token_warning_at TIMESTAMPTZ;

-- Gap 11: TikTok platform support
ALTER TABLE social_connections
  DROP CONSTRAINT IF EXISTS social_connections_platform_check;
ALTER TABLE social_connections
  ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('instagram','facebook','google_business','tiktok'));

-- Gap 1/2: social_preferences — audio and background music settings
ALTER TABLE social_preferences
  ADD COLUMN IF NOT EXISTS reels_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reels_addon_accepted_by TEXT,
  ADD COLUMN IF NOT EXISTS reel_default_duration INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS reel_default_style TEXT DEFAULT 'lifestyle',
  ADD COLUMN IF NOT EXISTS reel_background_music TEXT DEFAULT 'upbeat'
    CHECK (reel_background_music IN ('none','upbeat','warm','minimal','energetic')),
  ADD COLUMN IF NOT EXISTS reel_auto_voiceover BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_platforms TEXT[] DEFAULT ARRAY['instagram','facebook'],
  ADD COLUMN IF NOT EXISTS auto_post_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_text TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_enabled BOOLEAN DEFAULT false;
```

---

## SECTION 2 — NPM PACKAGES
Add to package.json dependencies:
- `"@fal-ai/client": "^1.0.0"` — video generation
- `"fluent-ffmpeg": "^2.1.3"` — audio merge into video
- `"@ffmpeg-installer/ffmpeg": "^1.1.0"` — ffmpeg binary for Node.js
- `"@types/fluent-ffmpeg": "^2.1.24"` — TypeScript types (devDependencies)

Run: `npm install @fal-ai/client fluent-ffmpeg @ffmpeg-installer/ffmpeg`
Run: `npm install -D @types/fluent-ffmpeg`

---

## SECTION 3 — NEW API ROUTES

### 3A — Replace generate-video route completely
File: `src/app/api/social/generate-video/route.ts`

Full replacement implementing:
- POST: start fal.ai Kling job (image-to-video or text-to-video)
- GET: poll job status, on COMPLETED download + merge audio + upload to Blob

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { put } from '@vercel/blob'
import * as fal from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

// Cost: Kling 2.1 Standard — 10s clip = $0.56 AUD
function calcCostAUD(durationSec: number): number {
  return Math.round(Math.ceil(durationSec / 10) * 0.56 * 100) / 100
}

// Reel style → scene description prefix
const STYLE_PROMPTS: Record<string, string> = {
  lifestyle: 'Warm cinematic lifestyle shot,',
  product_showcase: 'Professional product showcase, clean background, slow zoom,',
  behind_scenes: 'Authentic behind-the-scenes, candid, natural lighting,',
  flash_sale: 'Energetic fast-cut, bold colours, urgency,',
  testimonial: 'Warm authentic customer moment, genuine smile,',
  day_in_life: 'Documentary-style day-in-the-life, real moments,',
}

// Background music — use royalty-free tracks from Vercel Blob (see Section 5)
const MUSIC_URLS: Record<string, string | null> = {
  none: null,
  upbeat: process.env.NEXT_PUBLIC_APP_URL + '/audio/bg-upbeat.mp3',
  warm: process.env.NEXT_PUBLIC_APP_URL + '/audio/bg-warm.mp3',
  minimal: process.env.NEXT_PUBLIC_APP_URL + '/audio/bg-minimal.mp3',
  energetic: process.env.NEXT_PUBLIC_APP_URL + '/audio/bg-energetic.mp3',
}

// Gap 1: merge audio (voiceover or background music) into video using ffmpeg
async function mergeAudioIntoVideo(
  videoUrl: string,
  audioUrl: string,
  outputKey: string
): Promise<string> {
  const ffmpeg = require('fluent-ffmpeg')
  const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
  ffmpeg.setFfmpegPath(ffmpegPath)

  // Download video and audio to temp buffers
  const [vRes, aRes] = await Promise.all([fetch(videoUrl), fetch(audioUrl)])
  const [vBuf, aBuf] = await Promise.all([vRes.arrayBuffer(), aRes.arrayBuffer()])

  const tmp = require('os').tmpdir()
  const fs = require('fs')
  const videoPath = `${tmp}/v_${Date.now()}.mp4`
  const audioPath = `${tmp}/a_${Date.now()}.mp3`
  const outPath = `${tmp}/out_${Date.now()}.mp4`

  fs.writeFileSync(videoPath, Buffer.from(vBuf))
  fs.writeFileSync(audioPath, Buffer.from(aBuf))

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .addInput(audioPath)
      .outputOptions([
        '-c:v copy',
        '-c:a aac',
        '-shortest',          // stop when shortest stream ends
        '-map 0:v:0',
        '-map 1:a:0',
      ])
      .save(outPath)
      .on('end', resolve)
      .on('error', reject)
  })

  const outBuf = fs.readFileSync(outPath)
  const blob = await put(outputKey, outBuf, { access: 'public', contentType: 'video/mp4' })

  // Cleanup
  try { fs.unlinkSync(videoPath); fs.unlinkSync(audioPath); fs.unlinkSync(outPath) } catch {}

  return blob.url
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    post_id, business_id,
    reel_mode = 'auto',          // 'auto' | 'image' | 'text'
    reel_style = 'lifestyle',    // see STYLE_PROMPTS
    reel_custom_prompt,
    reel_source_image_url,
    duration_seconds = 15,
    is_admin = false,
    background_music = 'none',   // Gap 2
    voiceover_url,               // Gap 1 — ElevenLabs audio URL if pre-generated
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Gap 6: reels_enabled gate (skip for admin)
  if (!is_admin) {
    const { data: prefs } = await supabase.from('social_preferences')
      .select('reels_enabled').eq('business_id', business_id).maybeSingle()
    if (!prefs?.reels_enabled) {
      return NextResponse.json({
        error: 'reels_not_enabled',
        message: 'Enable AI Reels in Social Settings first.',
      }, { status: 403 })
    }
  }

  // Get post data if post_id provided
  let post: any = null
  if (post_id) {
    const { data } = await supabase.from('social_posts').select('*').eq('id', post_id).maybeSingle()
    post = data
  }

  // Build video prompt
  const stylePrefix = STYLE_PROMPTS[reel_style] ?? STYLE_PROMPTS.lifestyle
  let videoPrompt = ''
  let sourceImageUrl: string | null = null

  if (reel_mode === 'image') {
    sourceImageUrl = reel_source_image_url || post?.image_url || null
    videoPrompt = `${stylePrefix} ${reel_custom_prompt || post?.reel_concept || post?.caption || 'showcase this business'} 9:16 vertical, photorealistic, no text overlays`
  } else if (reel_mode === 'text') {
    videoPrompt = `${stylePrefix} ${reel_custom_prompt || post?.reel_concept || post?.caption} 9:16 vertical, photorealistic, no text overlays`
    sourceImageUrl = null
  } else {
    // auto
    sourceImageUrl = post?.image_url || null
    videoPrompt = `${stylePrefix} ${post?.reel_concept || post?.caption || 'Australian small business showcase'} 9:16 vertical, photorealistic, no text overlays`
  }

  const estimatedCost = calcCostAUD(duration_seconds)

  if (!process.env.FAL_KEY) {
    return NextResponse.json({
      error: 'FAL_KEY not configured',
      message: 'Add FAL_KEY to Vercel environment variables.',
    }, { status: 503 })
  }

  // Submit to fal.ai
  const modelId = sourceImageUrl
    ? 'fal-ai/kling-video/v2.1/standard/image-to-video'
    : 'fal-ai/kling-video/v2.1/standard/text-to-video'

  const falInput: Record<string, any> = {
    prompt: videoPrompt,
    duration: duration_seconds <= 10 ? '5' : '10',
    aspect_ratio: '9:16',
  }
  if (sourceImageUrl) falInput.image_url = sourceImageUrl

  const { request_id } = await fal.queue.submit(modelId, { input: falInput })

  // Save to social_posts
  if (post_id) {
    await supabaseAdmin.from('social_posts').update({
      fal_request_id: request_id,
      reel_mode,
      reel_style,
      reel_custom_prompt: reel_custom_prompt || null,
      reel_source_image_url: sourceImageUrl,
      reel_duration_seconds: duration_seconds,
      reel_cost_aud: estimatedCost,
      post_type: 'reel',
    }).eq('id', post_id)
  }

  return NextResponse.json({
    fal_request_id: request_id,
    model_id: modelId,
    estimated_cost_aud: estimatedCost,
    status: 'queued',
    background_music,
    voiceover_url: voiceover_url || null,
  })
}

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fal_request_id = req.nextUrl.searchParams.get('fal_request_id')
  const model_id = req.nextUrl.searchParams.get('model_id')
  const post_id = req.nextUrl.searchParams.get('post_id')
  const business_id = req.nextUrl.searchParams.get('business_id')
  const background_music = req.nextUrl.searchParams.get('background_music') || 'none'
  const voiceover_url = req.nextUrl.searchParams.get('voiceover_url')

  if (!fal_request_id || !model_id) {
    return NextResponse.json({ error: 'fal_request_id and model_id required' }, { status: 400 })
  }

  const status = await fal.queue.status(model_id, { requestId: fal_request_id, logs: false })

  if (status.status === 'COMPLETED') {
    const result = await fal.queue.result(model_id, { requestId: fal_request_id })
    const rawVideoUrl: string = result.data?.video?.url

    if (!rawVideoUrl) return NextResponse.json({ status: 'FAILED', error: 'No video URL in result' })

    // Gap 1 & 2: merge audio if provided
    let finalVideoUrl = rawVideoUrl
    const audioToMerge = voiceover_url || MUSIC_URLS[background_music]

    if (audioToMerge) {
      try {
        finalVideoUrl = await mergeAudioIntoVideo(
          rawVideoUrl,
          audioToMerge,
          `aria-social/reels/${post_id || fal_request_id}-${Date.now()}.mp4`
        )
      } catch (e: any) {
        console.error('[generate-video] audio merge failed:', e.message)
        // Fall back to silent video rather than failing completely
        const vRes = await fetch(rawVideoUrl)
        const vBuf = await vRes.arrayBuffer()
        const blob = await put(
          `aria-social/reels/${post_id || fal_request_id}-${Date.now()}.mp4`,
          vBuf,
          { access: 'public', contentType: 'video/mp4' }
        )
        finalVideoUrl = blob.url
      }
    } else {
      // No audio — still copy to Vercel Blob for reliable serving
      const vRes = await fetch(rawVideoUrl)
      const vBuf = await vRes.arrayBuffer()
      const blob = await put(
        `aria-social/reels/${post_id || fal_request_id}-${Date.now()}.mp4`,
        vBuf,
        { access: 'public', contentType: 'video/mp4' }
      )
      finalVideoUrl = blob.url
    }

    // Update social_posts
    if (post_id) {
      await supabaseAdmin.from('social_posts').update({
        video_url: finalVideoUrl,
        post_type: 'reel',
      }).eq('id', post_id)
    }

    // Gap 9: log to reel_usage_log
    if (business_id && post_id) {
      const { data: post } = await supabaseAdmin.from('social_posts')
        .select('reel_cost_aud, reel_duration_seconds, reel_mode, reel_style')
        .eq('id', post_id).maybeSingle()
      if (post) {
        await supabaseAdmin.from('reel_usage_log').insert({
          business_id,
          post_id,
          cost_aud: post.reel_cost_aud || 0.56,
          duration_seconds: post.reel_duration_seconds || 15,
          provider: model_id,
          reel_mode: post.reel_mode,
          reel_style: post.reel_style,
          fal_request_id,
        })
      }
    }

    return NextResponse.json({ status: 'COMPLETED', video_url: finalVideoUrl })
  }

  if (status.status === 'FAILED') {
    return NextResponse.json({ status: 'FAILED', error: 'fal.ai generation failed' })
  }

  return NextResponse.json({ status: status.status }) // IN_QUEUE or IN_PROGRESS
}

export const POST = withErrorCapture('social/generate-video', _POST)
export const GET = withErrorCapture('social/generate-video', _GET)
```

### 3B — Image upload route
File: `src/app/api/social/upload-image/route.ts`

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { put } from '@vercel/blob'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const businessId = formData.get('business_id') as string | null

  if (!file || !businessId) return NextResponse.json({ error: 'file and business_id required' }, { status: 400 })
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WEBP allowed' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Max file size 10MB' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase()
  const blob = await put(
    `social-uploads/${businessId}/${Date.now()}-${safeName}`,
    await file.arrayBuffer(),
    { access: 'public', contentType: file.type }
  )

  // Gap 10: save to asset library
  await supabaseAdmin.from('social_asset_library').insert({
    business_id: businessId,
    name: file.name,
    url: blob.url,
    type: 'image',
    size_bytes: file.size,
  })

  return NextResponse.json({ url: blob.url, ok: true })
}

export const POST = withErrorCapture('social/upload-image', _POST)
```

### 3C — Asset library route
File: `src/app/api/social/asset-library/route.ts`

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const business_id = req.nextUrl.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await supabaseAdmin.from('social_asset_library')
    .select('*').eq('business_id', business_id)
    .order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ assets: data ?? [] })
}

async function _DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, business_id } = await req.json()
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await supabaseAdmin.from('social_asset_library').delete()
    .eq('id', id).eq('business_id', business_id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('social/asset-library', _GET)
export const DELETE = withErrorCapture('social/asset-library', _DELETE)
```

### 3D — Reel billing summary route
File: `src/app/api/social/reel-billing/route.ts`

Gap 9: gives the owner visibility of their monthly Reel spend.

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const business_id = req.nextUrl.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const monthStart = new Date()
  monthStart.setDate(1); monthStart.setHours(0,0,0,0)

  const { data: logs } = await supabaseAdmin.from('reel_usage_log')
    .select('cost_aud, duration_seconds, reel_mode, created_at')
    .eq('business_id', business_id)
    .gte('created_at', monthStart.toISOString())
    .order('created_at', { ascending: false })

  const total = (logs ?? []).reduce((s, r) => s + (r.cost_aud ?? 0), 0)
  return NextResponse.json({
    month: monthStart.toISOString().slice(0,7),
    total_cost_aud: Math.round(total * 100) / 100,
    reel_count: logs?.length ?? 0,
    logs: logs ?? [],
  })
}

export const GET = withErrorCapture('social/reel-billing', _GET)
```

### 3E — Token expiry check route (Gap 5)
File: `src/app/api/social/token-status/route.ts`

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connections: [] })
  const business_id = req.nextUrl.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ connections: [] })

  const { data: conns } = await supabase.from('social_connections')
    .select('platform, token_expires_at, is_active, platform_account_name')
    .eq('business_id', business_id).eq('is_active', true)

  const now = new Date()
  const warnings = (conns ?? []).map(c => {
    if (!c.token_expires_at) return { ...c, expires_in_days: null, warning: false }
    const exp = new Date(c.token_expires_at)
    const daysLeft = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return {
      ...c,
      expires_in_days: daysLeft,
      warning: daysLeft < 7,   // warn if < 7 days
      expired: daysLeft < 0,
    }
  })

  return NextResponse.json({ connections: warnings })
}

export const GET = withErrorCapture('social/token-status', _GET)
```

### 3F — Hashtag performance update (Gap 8)
Upgrade `src/app/api/cron/sync-engagement/route.ts` — ADDITIVE ONLY.

After the existing metrics sync loop, add a second loop that updates `social_hashtag_stats`:

```typescript
// After the existing for (const post of posts) loop, add:

// Gap 8: Update hashtag performance stats
const publishedPostsWithHashtags = await supabase
  .from('social_posts')
  .select('id, business_id, hashtags, engagement_data')
  .eq('status', 'published')
  .not('hashtags', 'eq', '{}')
  .gte('published_at', cutoff.toISOString())
  .limit(100)

for (const post of publishedPostsWithHashtags.data ?? []) {
  if (!post.hashtags?.length || !post.engagement_data) continue
  const reach = (post.engagement_data as any).reach ?? (post.engagement_data as any).post_impressions ?? 0
  const likes = (post.engagement_data as any).likes ?? (post.engagement_data as any).post_engaged_users ?? 0
  if (!reach) continue

  for (const tag of post.hashtags as string[]) {
    await supabase.from('social_hashtag_stats')
      .upsert({
        business_id: post.business_id,
        hashtag: tag.replace(/^#+/, ''),
        avg_reach: reach,
        avg_likes: likes,
        usage_count: 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'business_id,hashtag',
      })
      .then(async ({ error }) => {
        if (!error) {
          // Increment usage_count
          await supabase.rpc('increment_hashtag_usage', {
            p_business_id: post.business_id,
            p_hashtag: tag.replace(/^#+/, ''),
            p_reach: reach,
            p_likes: likes,
          }).catch(() => {})
        }
      })
  }
}
```

Also add a DB function for this in the migration file:
```sql
CREATE OR REPLACE FUNCTION increment_hashtag_usage(
  p_business_id UUID, p_hashtag TEXT, p_reach NUMERIC, p_likes NUMERIC
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE social_hashtag_stats
  SET
    usage_count = usage_count + 1,
    avg_reach = (avg_reach + p_reach) / 2,
    avg_likes = (avg_likes + p_likes) / 2,
    updated_at = NOW()
  WHERE business_id = p_business_id AND hashtag = p_hashtag;
END;
$$;
```

Add this function to the SQL migration file.

### 3G — Story cleanup cron integration (Gap 12)
Add to `src/app/api/cron/sync-engagement/route.ts` — after existing sync loop:

```typescript
// Gap 12: Mark expired stories
await supabase.from('social_posts')
  .update({ status: 'expired' as any })
  .eq('post_type', 'reel')  // actually use post_type = 'story' once column exists
  .lt('story_expires_at', new Date().toISOString())
  .not('status', 'eq', 'expired')
  .then(() => {})
```

Wait — `status` CHECK constraint only allows specific values. Add 'expired' to it:
In the migration:
```sql
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_status_check;
ALTER TABLE social_posts ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('draft','approved','scheduled','published','failed','skipped','expired'));
```

### 3H — TikTok connection callback (Gap 11)
File: `src/app/api/social/callback/tiktok/route.ts`

TikTok OAuth callback — stores connection. TikTok uses OAuth 2.0 with Content Posting API.

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // business_id
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=${encodeURIComponent(error ?? 'missing_code')}`)
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/dashboard/social?error=not_authenticated`)

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${appUrl}/api/social/callback/tiktok`,
      }),
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description)

    const { access_token, open_id, expires_in } = tokenData.data

    // Get user info
    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const userData = await userRes.json()
    const displayName = userData.data?.user?.display_name ?? 'TikTok Account'

    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString()

    await supabase.from('social_connections').upsert({
      business_id: state,
      platform: 'tiktok',
      platform_account_id: open_id,
      platform_account_name: displayName,
      access_token,
      token_expires_at: expiresAt,
      is_active: true,
    }, { onConflict: 'business_id,platform' })

    return NextResponse.redirect(`${appUrl}/dashboard/social?connected=tiktok`)
  } catch (e: any) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=${encodeURIComponent(e.message)}`)
  }
}

export const GET = withErrorCapture('social/callback/tiktok', _GET)
```

### 3I — TikTok publish in publish route (Gap 11)
In `src/app/api/social/publish/route.ts`, add TikTok branch AFTER the existing google_business branch (additive only):

```typescript
} else if (post.platform === 'tiktok') {
  if (!post.video_url) throw new Error('TikTok requires a video_url (Reel)')
  
  // TikTok Content Posting API
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: fullCaption.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: post.video_url,
      },
    }),
  })
  const initData = await initRes.json()
  if (initData.error?.code !== 'ok') throw new Error(initData.error?.message ?? 'TikTok init failed')
  platformPostId = initData.data?.publish_id ?? null
}
```

---

## SECTION 4 — UPGRADE APPROVE ROUTE (Gap 6)
File: `src/app/api/social/approve/route.ts`

The approve route must set BOTH `status = 'approved'` AND `approval_status = 'approved'` so the publish-scheduled cron finds it.

Read the full file, then add `approval_status: 'approved'` to the updates object alongside the existing `status` update.

---

## SECTION 5 — BACKGROUND MUSIC VIA API (Gap 2)

No manual file uploads needed. Audio is pulled at runtime from two sources:

### Primary: Mubert API (AI-generated, exact duration, mood-matched)
If `MUBERT_API_KEY` is set in env — generate a track exactly matching the Reel duration.

```typescript
// lib/social/audio.ts
export async function fetchMubertTrack(mood: string, durationSeconds: number): Promise<string | null> {
  const key = process.env.MUBERT_API_KEY
  if (!key) return null
  try {
    // Step 1: get token
    const authRes = await fetch('https://api-b2b.mubert.com/v2/GetServiceAccess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GetServiceAccess',
        params: { email: process.env.MUBERT_EMAIL ?? 'aria@ariaos.site', license: 'ttmmubertlicense', token: key }
      })
    })
    const authData = await authRes.json()
    const pat = authData?.data?.pat
    if (!pat) return null

    // Step 2: render track
    const moodMap: Record<string, string> = {
      upbeat: 'uplifting background music, energetic, positive',
      warm: 'warm acoustic background, friendly, inviting cafe atmosphere',
      minimal: 'minimal ambient, clean, professional',
      energetic: 'energetic upbeat commercial, exciting, bold',
    }
    const renderRes = await fetch('https://api-b2b.mubert.com/v2/RecordTrackTTM', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'RecordTrackTTM',
        params: {
          pat,
          text: moodMap[mood] ?? moodMap.upbeat,
          duration: durationSeconds,
          mode: 'track',
          format: 'mp3',
          intensity: 'medium',
        }
      })
    })
    const renderData = await renderRes.json()
    // Poll until ready
    const taskId = renderData?.data?.tasks_id
    if (!taskId) return null

    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const statusRes = await fetch('https://api-b2b.mubert.com/v2/GetTasksStatuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'GetTasksStatuses', params: { pat, tasks: [taskId] } })
      })
      const statusData = await statusRes.json()
      const task = statusData?.data?.tasks?.[0]
      if (task?.status === 'done' && task?.download_link) return task.download_link
      if (task?.status === 'error') return null
    }
    return null
  } catch { return null }
}
```

### Fallback: Pixabay Audio API (free, uses existing PIXABAY_KEY)
If Mubert unavailable or not configured — search Pixabay for a matching track.

```typescript
export async function fetchPixabayTrack(mood: string): Promise<string | null> {
  const key = process.env.PIXABAY_KEY  // already in env for image search
  if (!key) return null
  const moodQuery: Record<string, string> = {
    upbeat: 'upbeat happy background',
    warm: 'warm acoustic cafe',
    minimal: 'minimal ambient background',
    energetic: 'energetic upbeat commercial',
  }
  try {
    const q = encodeURIComponent(moodQuery[mood] ?? 'upbeat background music')
    const res = await fetch(
      `https://pixabay.com/api/videos/?key=${key}&q=${q}&video_type=music&per_page=5&safesearch=true`
    )
    // Note: Pixabay audio API endpoint
    const audioRes = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${q}&media_type=music&per_page=5`
    )
    // Pixabay returns audio tracks in their API
    // Use the first result's audio URL
    if (!audioRes.ok) return null
    const d = await audioRes.json()
    const track = d.hits?.[0]
    return track?.audio?.url ?? track?.previewURL ?? null
  } catch { return null }
}

// Combined: try Mubert first, fall back to Pixabay
export async function getBackgroundMusic(mood: string, durationSeconds: number): Promise<string | null> {
  if (mood === 'none') return null
  const mubert = await fetchMubertTrack(mood, durationSeconds)
  if (mubert) return mubert
  return fetchPixabayTrack(mood)
}
```

Create this file at `src/lib/social/audio.ts`.

Then in `generate-video/route.ts` GET handler, replace:
```typescript
const audioToMerge = voiceover_url || MUSIC_URLS[background_music]
```
with:
```typescript
import { getBackgroundMusic } from '@/lib/social/audio'
const audioToMerge = voiceover_url || await getBackgroundMusic(background_music, duration_seconds ?? 15)
```

Remove the `MUSIC_URLS` constant entirely — no static file paths needed.

### No static audio files needed
Do NOT create any files in `public/audio/`. Audio is fetched at runtime from Mubert or Pixabay APIs.

### UI update
In the Reel Creator panel background music selector, the options render as before (None/Upbeat/Warm/Minimal/Energetic).
Remove the "coming soon" note — music now works when MUBERT_API_KEY or PIXABAY_KEY is set.
Add a small note: "Powered by Mubert AI" if MUBERT_API_KEY is set, otherwise "Powered by Pixabay".
Since Claude Code can't know which key is set, just show: "AI-generated background music • royalty-free"

### Env vars for audio (what you need from Chahat — see bottom of prompt)
- `MUBERT_API_KEY` — get from mubert.com/api (paid plan ~$39/mo for full API)
- `MUBERT_EMAIL` — email used to register Mubert account
- `PIXABAY_KEY` — already in env ✅ (used for image search, same key works for audio)

If only PIXABAY_KEY is set: free audio from Pixabay library (good quality, fixed tracks)
If MUBERT_API_KEY is set: AI-generated audio, exact duration, mood-matched (better quality)

---

## SECTION 6 — SOCIAL PAGE UI UPGRADES
File: `src/app/dashboard/social/page.tsx`

Read the full 1418-line file before making any changes. Use str_replace for all edits.

### 6A — Token expiry banner (Gap 5)
Add state:
```typescript
const [tokenWarnings, setTokenWarnings] = useState<Array<{platform: string; expires_in_days: number | null; warning: boolean; expired: boolean}>>([])
```

In the existing useEffect that loads bid, add:
```typescript
if (bid) {
  fetch(`/api/social/token-status?business_id=${bid}`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d?.connections) setTokenWarnings(d.connections.filter((c: any) => c.warning || c.expired)) })
    .catch(() => {})
}
```

Render at the very top of the social page return (before any other content):
```tsx
{tokenWarnings.map(w => (
  <div key={w.platform} style={{
    background: w.expired ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
    border: `1px solid ${w.expired ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'}`,
    borderRadius: 10, padding: '10px 16px', marginBottom: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }}>
    <span style={{ fontSize: 13, color: w.expired ? '#EF4444' : '#F59E0B', fontWeight: 600 }}>
      {w.expired
        ? `⚠ Your ${w.platform} connection has expired — posts will fail until you reconnect`
        : `⚠ Your ${w.platform} connection expires in ${w.expires_in_days} days — reconnect soon`}
    </span>
    <a href="/dashboard/social" style={{ fontSize: 12, color: '#7FB897', fontWeight: 700, textDecoration: 'none' }}>
      Reconnect →
    </a>
  </div>
))}
```

### 6B — Reel Creator Panel state (Gap 3/4)
Add these state variables after the existing reels state:
```typescript
const [reelCreatorPostId, setReelCreatorPostId] = useState<string | null>(null)
const [reelMode, setReelMode] = useState<'auto'|'image'|'text'>('auto')
const [reelStyle, setReelStyle] = useState('lifestyle')
const [reelCustomPrompt, setReelCustomPrompt] = useState('')
const [reelSourceImage, setReelSourceImage] = useState<string | null>(null)
const [reelDuration, setReelDuration] = useState<10|15|30>(15)
const [reelBgMusic, setReelBgMusic] = useState('none')
const [reelGenerating, setReelGenerating] = useState(false)
const [reelPolling, setReelPolling] = useState<Record<string, {requestId: string; modelId: string; bgMusic: string; voiceoverUrl?: string}>>({})
const [assetLibrary, setAssetLibrary] = useState<Array<{id: string; url: string; name: string}>>([])
const [showAssetLibrary, setShowAssetLibrary] = useState(false)
const [reelBillingThisMonth, setReelBillingThisMonth] = useState<{total_cost_aud: number; reel_count: number} | null>(null)
```

Cost function:
```typescript
function calcReelCost(dur: number): number {
  return Math.round(Math.ceil(dur / 10) * 0.56 * 100) / 100
}
```

Load asset library and billing when bid loads (add to existing useEffect):
```typescript
if (bid) {
  fetch(`/api/social/asset-library?business_id=${bid}`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d?.assets) setAssetLibrary(d.assets) })
    .catch(() => {})
  fetch(`/api/social/reel-billing?business_id=${bid}`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d) setReelBillingThisMonth(d) })
    .catch(() => {})
}
```

### 6C — Polling effect (Gap 3)
Add after existing useEffects:
```typescript
useEffect(() => {
  if (Object.keys(reelPolling).length === 0) return
  const interval = setInterval(async () => {
    for (const [postId, { requestId, modelId, bgMusic, voiceoverUrl }] of Object.entries(reelPolling)) {
      try {
        const params = new URLSearchParams({
          fal_request_id: requestId,
          model_id: modelId,
          post_id: postId,
          business_id: bid ?? '',
          background_music: bgMusic,
        })
        if (voiceoverUrl) params.set('voiceover_url', voiceoverUrl)
        const res = await fetch(`/api/social/generate-video?${params}`)
        const d = await res.json()
        if (d.status === 'COMPLETED') {
          setPosts(prev => prev.map(p => p.id === postId
            ? { ...p, video_url: d.video_url, post_type: 'reel' } : p))
          setReelPolling(prev => { const n = {...prev}; delete n[postId]; return n })
        } else if (d.status === 'FAILED') {
          setReelPolling(prev => { const n = {...prev}; delete n[postId]; return n })
          alert('Reel generation failed. Please try again.')
        }
      } catch {}
    }
  }, 5000)
  return () => clearInterval(interval)
}, [reelPolling, bid])
```

### 6D — Generate Reel function
Replace the existing `generateVideo` function:
```typescript
async function generateVideo(postId: string, concept: string | null) {
  // Open reel creator panel instead of immediately generating
  const post = posts.find(p => p.id === postId)
  setReelCreatorPostId(postId)
  setReelMode('auto')
  setReelStyle('lifestyle')
  setReelCustomPrompt(concept || post?.reel_concept || post?.caption || '')
  setReelSourceImage(post?.image_url || null)
  setReelDuration(15)
  setReelBgMusic('none')
}

async function submitReelGeneration() {
  if (!reelCreatorPostId || !bid) return
  setReelGenerating(true)
  const post = posts.find(p => p.id === reelCreatorPostId)
  try {
    const res = await fetch('/api/social/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: reelCreatorPostId,
        business_id: bid,
        reel_mode: reelMode,
        reel_style: reelStyle,
        reel_custom_prompt: reelCustomPrompt || null,
        reel_source_image_url: reelMode === 'image' ? (reelSourceImage || post?.image_url) : null,
        duration_seconds: reelDuration,
        background_music: reelBgMusic,
        voiceover_url: voiceUrls[reelCreatorPostId] || null,
      }),
    })
    const d = await res.json()
    if (d.fal_request_id) {
      setReelPolling(prev => ({
        ...prev,
        [reelCreatorPostId]: {
          requestId: d.fal_request_id,
          modelId: d.model_id,
          bgMusic: reelBgMusic,
          voiceoverUrl: voiceUrls[reelCreatorPostId],
        }
      }))
      setReelCreatorPostId(null)
    } else {
      alert(d.message || d.error || 'Generation failed')
    }
  } catch (e: any) {
    alert('Network error: ' + e.message)
  }
  setReelGenerating(false)
}
```

### 6E — Replace Generate Video button on post cards
Find the section where "Generate Video" button renders (around line 1186-1207).
Replace the conditional block with:

```tsx
{reelPolling[post.id] ? (
  <span style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7,
    background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.3)' }}>
    ⏳ Generating Reel... (~60s)
  </span>
) : post.video_url ? (
  <div style={{ marginTop: 8 }}>
    <video src={post.video_url} controls muted
      style={{ width: '100%', maxHeight: 240, borderRadius: 10, background: '#000' }} />
    {(post as any).reel_cost_aud && (
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
        🎬 A${Number((post as any).reel_cost_aud).toFixed(2)} · added to {new Date().toLocaleString('en-AU', {month:'long'})} bill
      </p>
    )}
  </div>
) : !reelsEnabled ? (
  <button onClick={() => setShowReelsModal(true)}
    style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(251,191,36,0.3)',
      background: 'rgba(251,191,36,0.08)', color: '#F59E0B', fontSize: 11, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit' }}>
    🎬 Enable Reels (Add-on)
  </button>
) : (
  <button onClick={() => generateVideo(post.id, (post as any).reel_concept)}
    style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(59,130,246,0.4)',
      background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 11, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit' }}>
    🎬 Create Reel
  </button>
)}
```

### 6F — Reel Creator Panel (Gap 3/4)
Add this full-screen overlay before the closing `);` of the page return.

The panel covers:
- Mode tabs: Auto / Image to Reel / Text to Reel
- Style picker: 6 pre-built styles with descriptive labels
- Image source: upload new OR pick from asset library OR use post image
- Scene description textarea (with placeholder examples per style)
- Duration: 10s / 15s / 30s with cost shown
- Background music: None / Upbeat / Warm / Minimal / Energetic (note: "coming soon")
- Estimated cost displayed prominently
- Cancel / Generate buttons

```tsx
{reelCreatorPostId && (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 9998,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    padding: '0 0 0 0',
  }} onClick={() => !reelGenerating && setReelCreatorPostId(null)}>
    <div onClick={e => e.stopPropagation()} style={{
      background: 'var(--bg-surface)',
      border: '1px solid rgba(127,184,151,0.2)',
      borderRadius: '20px 20px 0 0',
      padding: '24px 24px 32px',
      width: '100%', maxWidth: 560,
      maxHeight: '92vh', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, color: '#7FB897', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Aria Reel Generator
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Create a Reel</div>
        </div>
        <button onClick={() => setReelCreatorPostId(null)} disabled={reelGenerating}
          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 20, cursor: 'pointer', padding: 4 }}>×</button>
      </div>

      {/* Mode tabs */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Content type</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            ['auto', '✨ Auto', 'Aria decides'],
            ['image', '🖼 Image to Reel', 'Animate your photo'],
            ['text', '✍️ Text to Reel', 'Describe a scene'],
          ].map(([val, label, sub]) => (
            <button key={val} onClick={() => setReelMode(val as any)}
              style={{ flex: 1, padding: '8px 6px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid ' + (reelMode === val ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.08)'),
                background: reelMode === val ? 'rgba(127,184,151,0.12)' : 'transparent',
                textAlign: 'center' as const }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: reelMode === val ? '#7FB897' : 'var(--text-secondary)' }}>{label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Style picker */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Reel style</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['lifestyle', '🌿 Lifestyle', 'Warm & authentic'],
            ['product_showcase', '📦 Product', 'Clean showcase'],
            ['behind_scenes', '🎥 Behind scenes', 'Real & candid'],
            ['flash_sale', '⚡ Flash sale', 'Urgent & bold'],
            ['testimonial', '💬 Testimonial', 'Customer moment'],
            ['day_in_life', '☀️ Day in life', 'Documentary feel'],
          ].map(([val, label, sub]) => (
            <button key={val} onClick={() => setReelStyle(val)}
              style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left' as const,
                border: '1px solid ' + (reelStyle === val ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.08)'),
                background: reelStyle === val ? 'rgba(127,184,151,0.1)' : 'transparent' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: reelStyle === val ? '#7FB897' : 'var(--text-primary)' }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Image source (only for auto and image modes) */}
      {reelMode !== 'text' && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            {reelMode === 'auto' ? 'Start frame (optional)' : 'Your photo (required)'}
          </div>
          {reelSourceImage ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img src={reelSourceImage} alt="source"
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(127,184,151,0.3)' }} />
              <div>
                <button onClick={() => setReelSourceImage(null)}
                  style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'block', marginBottom: 4 }}>
                  × Remove
                </button>
                <button onClick={() => setShowAssetLibrary(true)}
                  style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  📁 Choose different
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.15)',
                textAlign: 'center' as const, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={async e => {
                    const f = e.target.files?.[0]
                    if (!f || !bid) return
                    const fd = new FormData(); fd.append('file', f); fd.append('business_id', bid)
                    const r = await fetch('/api/social/upload-image', { method: 'POST', body: fd })
                    const d = await r.json()
                    if (d.url) { setReelSourceImage(d.url); setAssetLibrary(prev => [{ id: Date.now().toString(), url: d.url, name: f.name }, ...prev]) }
                  }} />
                📸 Upload photo
              </label>
              <button onClick={() => setShowAssetLibrary(true)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                📁 My library ({assetLibrary.length})
              </button>
            </div>
          )}

          {/* Asset library picker */}
          {showAssetLibrary && assetLibrary.length > 0 && (
            <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {assetLibrary.slice(0, 12).map(a => (
                  <div key={a.id} onClick={() => { setReelSourceImage(a.url); setShowAssetLibrary(false) }}
                    style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1' }}>
                    <img src={a.url} alt={a.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              <button onClick={() => setShowAssetLibrary(false)}
                style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8, fontFamily: 'inherit' }}>
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scene description */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
          {reelMode === 'image' ? 'What should happen in the video?' : reelMode === 'text' ? 'Describe your scene' : 'Customise the scene (optional)'}
        </div>
        <textarea
          value={reelCustomPrompt}
          onChange={e => setReelCustomPrompt(e.target.value)}
          rows={3}
          placeholder={
            reelMode === 'image'
              ? 'e.g. "Camera slowly zooms into the coffee cup as steam rises, warm morning light"'
              : reelMode === 'text'
              ? 'e.g. "Busy Melbourne café at morning rush, barista making flat white, cosy warm atmosphere"'
              : 'Leave blank and Aria will decide based on your post content'
          }
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'vertical' as const,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const }}
        />
      </div>

      {/* Duration */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Duration</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([10, 15, 30] as const).map(d => (
            <button key={d} onClick={() => setReelDuration(d)}
              style={{ flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid ' + (reelDuration === d ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.1)'),
                background: reelDuration === d ? 'rgba(127,184,151,0.1)' : 'transparent' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: reelDuration === d ? '#7FB897' : 'var(--text-primary)' }}>{d}s</div>
              <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700 }}>A${calcReelCost(d).toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Background music */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Background music</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {[['none','🔇 None'],['upbeat','🎵 Upbeat'],['warm','🎶 Warm'],['minimal','🎹 Minimal'],['energetic','⚡ Energetic']].map(([val, label]) => (
            <button key={val} onClick={() => setReelBgMusic(val)}
              style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid ' + (reelBgMusic === val ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.1)'),
                background: reelBgMusic === val ? 'rgba(127,184,151,0.12)' : 'transparent',
                color: reelBgMusic === val ? '#7FB897' : 'var(--text-secondary)' }}>
              {label}
            </button>
          ))}
        </div>
        {reelBgMusic !== 'none' && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Background music coming soon — royalty-free tracks being sourced.
          </p>
        )}
      </div>

      {/* Cost + CTA */}
      <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
        borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Estimated cost</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#F59E0B' }}>A${calcReelCost(reelDuration).toFixed(2)}</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
          Added to your {new Date().toLocaleString('en-AU', {month:'long'})} invoice.
          {reelBillingThisMonth && ` This month so far: A${reelBillingThisMonth.total_cost_aud.toFixed(2)} (${reelBillingThisMonth.reel_count} Reels).`}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setReelCreatorPostId(null)} disabled={reelGenerating}
          style={{ flex: 1, padding: '12px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 700,
            fontSize: 14, cursor: 'pointer', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
          Cancel
        </button>
        <button onClick={submitReelGeneration} disabled={reelGenerating || (reelMode === 'image' && !reelSourceImage && !posts.find(p => p.id === reelCreatorPostId)?.image_url)}
          style={{ flex: 2, padding: '12px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 700,
            fontSize: 14, cursor: reelGenerating ? 'wait' : 'pointer',
            background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.4)',
            color: '#7FB897',
            opacity: (reelGenerating || (reelMode === 'image' && !reelSourceImage && !posts.find(p => p.id === reelCreatorPostId)?.image_url)) ? 0.5 : 1 }}>
          {reelGenerating ? '⏳ Submitting...' : `✦ Generate Reel — A$${calcReelCost(reelDuration).toFixed(2)}`}
        </button>
      </div>
    </div>
  </div>
)}
```

### 6G — Performance panel (Gap 7)
In the existing analytics/stats section of the social page (find the analytics display area), add a Reel vs Image comparison:

Find where `analytics.summary` is displayed and add after it:

```tsx
{/* Gap 7: Reel performance comparison */}
{analytics?.summary && (
  <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
      Content performance
    </div>
    <div style={{ display: 'flex', gap: 16 }}>
      {analytics.summary.by_type && Object.entries(analytics.summary.by_type as Record<string, any>).map(([type, count]) => (
        <div key={type} style={{ flex: 1, textAlign: 'center' as const }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: type === 'reel' ? '#7FB897' : 'var(--text-primary)' }}>{String(count)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, textTransform: 'capitalize' as const }}>{type}s</div>
        </div>
      ))}
    </div>
    {reelBillingThisMonth && reelBillingThisMonth.reel_count > 0 && (
      <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(127,184,151,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
        💰 {reelBillingThisMonth.reel_count} Reels this month · A${reelBillingThisMonth.total_cost_aud.toFixed(2)} charged
      </div>
    )}
  </div>
)}
```

---

## SECTION 7 — FINAL CHECKLIST
Before committing, verify ALL of the following:

- [ ] `npm install @fal-ai/client fluent-ffmpeg @ffmpeg-installer/ffmpeg` succeeded
- [ ] `npm install -D @types/fluent-ffmpeg` succeeded
- [ ] `npx tsc --noEmit` — ZERO errors
- [ ] `npm run build` passes (or at minimum tsc passes)
- [ ] Gap 1: audio merge function exists in generate-video route, falls back gracefully if merge fails
- [ ] Gap 2: `src/lib/social/audio.ts` created with `getBackgroundMusic()` function
- [ ] Gap 2: `fetchMubertTrack()` uses MUBERT_API_KEY if set (AI-generated, exact duration)
- [ ] Gap 2: `fetchPixabayTrack()` uses PIXABAY_KEY as free fallback (already in env)
- [ ] Gap 2: generate-video GET handler calls `getBackgroundMusic()` not static MUSIC_URLS
- [ ] Gap 2: no static files in public/audio/ — all audio fetched at runtime
- [ ] Gap 2: background music selector in UI shows all 5 options (none/upbeat/warm/minimal/energetic)
- [ ] Gap 3: Reel Creator panel has all 3 modes (auto/image/text)
- [ ] Gap 4: 6 style options render correctly, style prefix applied to video prompt
- [ ] Gap 5: token-status route exists, warning banner renders on social page
- [ ] Gap 6: approval_status column added to migration, approve route sets both status AND approval_status
- [ ] Gap 7: performance panel shows reel count and billing this month
- [ ] Gap 8: hashtag stats table created, sync-engagement updates it, increment function in migration
- [ ] Gap 9: reel_usage_log table created, logged on COMPLETED, billing route returns monthly summary
- [ ] Gap 10: social_asset_library table created, upload saves to it, asset picker shows in Reel Creator
- [ ] Gap 11: TikTok callback route exists, TikTok branch in publish route, platform CHECK updated
- [ ] Gap 12: story expiry status set to 'expired', status CHECK updated, cleanup in sync-engagement
- [ ] All SQL uses IF NOT EXISTS and IF EXISTS — idempotent
- [ ] All new tables have RLS enabled and correct policies
- [ ] reelCreatorPostId null when modal closes — no stale state
- [ ] Polling effect cleans up on unmount (clearInterval in return)
- [ ] fal.queue calls handle errors with try/catch, return useful error messages
- [ ] Image upload validates type (jpeg/png/webp only) and size (max 10MB)
- [ ] Background music files noted as TODO in public/audio/
- [ ] TikTok env vars (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET) noted as required but not hardcoded
