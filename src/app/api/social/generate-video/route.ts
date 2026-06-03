export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { put } from '@vercel/blob'
import { fal } from '@fal-ai/client'
import { getBackgroundMusicUrl } from '@/lib/social/audio'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

function calcCostAUD(durationSec: number): number {
  return Math.round(Math.ceil(durationSec / 10) * 0.56 * 100) / 100
}

const STYLE_PROMPTS: Record<string, string> = {
  lifestyle:        'Warm cinematic lifestyle shot,',
  product_showcase: 'Professional product showcase, clean background, slow zoom,',
  behind_scenes:    'Authentic behind-the-scenes, candid, natural lighting,',
  flash_sale:       'Energetic fast-cut, bold colours, urgency,',
  testimonial:      'Warm authentic customer moment, genuine smile,',
  day_in_life:      'Documentary-style day-in-the-life, real moments,',
}

async function mergeAudioIntoVideo(
  videoUrl: string,
  audioUrl: string,
  outputKey: string
): Promise<string> {
  const ffmpeg = require('fluent-ffmpeg')
  const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
  ffmpeg.setFfmpegPath(ffmpegPath)

  const [vRes, aRes] = await Promise.all([fetch(videoUrl), fetch(audioUrl)])
  const [vBuf, aBuf] = await Promise.all([vRes.arrayBuffer(), aRes.arrayBuffer()])

  const tmp = require('os').tmpdir()
  const fs = require('fs')
  const videoPath = tmp + '/v_' + Date.now() + '.mp4'
  const audioPath = tmp + '/a_' + Date.now() + '.mp3'
  const outPath   = tmp + '/out_' + Date.now() + '.mp4'

  fs.writeFileSync(videoPath, Buffer.from(vBuf))
  fs.writeFileSync(audioPath, Buffer.from(aBuf))

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .addInput(audioPath)
      .outputOptions(['-c:v copy', '-c:a aac', '-shortest', '-map 0:v:0', '-map 1:a:0'])
      .save(outPath)
      .on('end', resolve)
      .on('error', reject)
  })

  const outBuf = fs.readFileSync(outPath)
  const blob = await put(outputKey, outBuf, { access: 'public', contentType: 'video/mp4' })

  try { fs.unlinkSync(videoPath); fs.unlinkSync(audioPath); fs.unlinkSync(outPath) } catch {}

  return blob.url
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    post_id, business_id,
    reel_mode = 'auto',
    reel_style = 'lifestyle',
    reel_custom_prompt,
    reel_source_image_url,
    duration_seconds = 15,
    is_admin = false,
    background_music = 'none',
    voiceover_url,
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

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

  let post: any = null
  if (post_id) {
    const { data } = await supabase.from('social_posts').select('*').eq('id', post_id).maybeSingle()
    post = data
  }

  const stylePrefix = STYLE_PROMPTS[reel_style] ?? STYLE_PROMPTS.lifestyle
  let videoPrompt = ''
  let sourceImageUrl: string | null = null

  if (reel_mode === 'image') {
    sourceImageUrl = reel_source_image_url || post?.image_url || null
    videoPrompt = stylePrefix + ' ' + (reel_custom_prompt || post?.reel_concept || post?.caption || 'showcase this business') + ' 9:16 vertical, photorealistic, no text overlays'
  } else if (reel_mode === 'text') {
    videoPrompt = stylePrefix + ' ' + (reel_custom_prompt || post?.reel_concept || post?.caption) + ' 9:16 vertical, photorealistic, no text overlays'
    sourceImageUrl = null
  } else {
    sourceImageUrl = post?.image_url || null
    videoPrompt = stylePrefix + ' ' + (post?.reel_concept || post?.caption || 'Australian small business showcase') + ' 9:16 vertical, photorealistic, no text overlays'
  }

  const estimatedCost = calcCostAUD(duration_seconds)

  if (!process.env.FAL_KEY) {
    return NextResponse.json({
      error: 'FAL_KEY not configured',
      message: 'Add FAL_KEY to Vercel environment variables.',
    }, { status: 503 })
  }

  const modelId = sourceImageUrl
    ? 'fal-ai/kling-video/v2.1/standard/image-to-video'
    : 'fal-ai/kling-video/v2.1/standard/text-to-video'

  const falInput: Record<string, any> = {
    prompt: videoPrompt.slice(0, 512),
    duration: duration_seconds <= 10 ? '5' : '10',
  }
  if (sourceImageUrl) falInput.image_url = sourceImageUrl

  const submitResult = await fal.queue.submit(modelId as any, { input: falInput })
  const request_id = (submitResult as any).request_id as string

  if (post_id) {
    try {
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
    } catch {}
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

  // Legacy: support old ?request_id= param
  const legacy_request_id = req.nextUrl.searchParams.get('request_id')
  const effectiveRequestId = fal_request_id || legacy_request_id

  if (!effectiveRequestId) return NextResponse.json({ error: 'fal_request_id required' }, { status: 400 })
  if (!process.env.FAL_KEY) return NextResponse.json({ status: 'no_provider' }, { status: 503 })

  const effectiveModelId = model_id || 'fal-ai/kling-video/v2.1/standard/image-to-video'

  try {
    const status = await fal.queue.status(effectiveModelId as any, { requestId: effectiveRequestId, logs: false })
    const statusStr = (status as any).status as string

    if (statusStr === 'COMPLETED') {
      const result = await fal.queue.result(effectiveModelId as any, { requestId: effectiveRequestId })
      const rawVideoUrl: string = (result as any).data?.video?.url

      if (!rawVideoUrl) return NextResponse.json({ status: 'FAILED', error: 'No video URL in result' })

      let finalVideoUrl = rawVideoUrl
      const audioToMerge = voiceover_url || await getBackgroundMusicUrl(background_music)

      const blobKey = 'aria-social/reels/' + (post_id || effectiveRequestId) + '-' + Date.now() + '.mp4'

      if (audioToMerge) {
        try {
          finalVideoUrl = await mergeAudioIntoVideo(rawVideoUrl, audioToMerge, blobKey)
        } catch (e: any) {
          console.error('[generate-video] audio merge failed:', e.message)
          const vRes = await fetch(rawVideoUrl)
          const vBuf = await vRes.arrayBuffer()
          const blob = await put(blobKey, vBuf, { access: 'public', contentType: 'video/mp4' })
          finalVideoUrl = blob.url
        }
      } else {
        const vRes = await fetch(rawVideoUrl)
        const vBuf = await vRes.arrayBuffer()
        const blob = await put(blobKey, vBuf, { access: 'public', contentType: 'video/mp4' })
        finalVideoUrl = blob.url
      }

      if (post_id) {
        try {
          await supabaseAdmin.from('social_posts').update({ video_url: finalVideoUrl, post_type: 'reel' }).eq('id', post_id)
        } catch {}
      }

      if (business_id && post_id) {
        try {
          const { data: postRow } = await supabaseAdmin.from('social_posts')
            .select('reel_cost_aud, reel_duration_seconds, reel_mode, reel_style')
            .eq('id', post_id).maybeSingle()
          if (postRow) {
            await supabaseAdmin.from('reel_usage_log').insert({
              business_id,
              post_id,
              cost_aud: postRow.reel_cost_aud || 0.56,
              duration_seconds: postRow.reel_duration_seconds || 15,
              provider: effectiveModelId,
              reel_mode: postRow.reel_mode,
              reel_style: postRow.reel_style,
              fal_request_id: effectiveRequestId,
            })
          }
        } catch {}
      }

      return NextResponse.json({ status: 'COMPLETED', video_url: finalVideoUrl })
    }

    if (statusStr === 'FAILED') {
      return NextResponse.json({ status: 'FAILED', error: 'fal.ai generation failed' })
    }

    return NextResponse.json({ status: statusStr })
  } catch (e: any) {
    console.error('[generate-video GET] fal status error:', e?.message ?? e)
    return NextResponse.json({ status: 'error', error: e?.message ?? 'unknown' }, { status: 500 })
  }
}

export const POST = withErrorCapture('social/generate-video', _POST)
export const GET = withErrorCapture('social/generate-video', _GET)
