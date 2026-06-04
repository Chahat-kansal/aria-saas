export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const FAL_KEY = process.env.FAL_API_KEY ?? ''
const FAL_URL = 'https://fal.run/fal-ai/kling-video/v2.1/pro/text-to-video'
const FAL_URL_IMG = 'https://fal.run/fal-ai/kling-video/v2.1/pro/image-to-video'

const STYLE_PROMPTS: Record<string, string> = {
  lifestyle:        'Warm cinematic lifestyle,',
  ugc:              'Authentic UGC creator style, handheld, raw,',
  product_showcase: 'Professional product hero shot, slow zoom,',
  cinematic:        'Cinematic wide shot, dramatic lighting, film grain,',
  behind_scenes:    'Authentic behind-the-scenes, candid,',
  flash_sale:       'Energetic fast-cut, bold colours, urgent,',
  testimonial:      'Warm authentic customer moment, genuine emotion,',
  day_in_life:      'Documentary day-in-the-life, real moments,',
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, influencer_id, image_url, prompt, style = 'lifestyle',
    duration_seconds = 10, resolution = '720p' } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  if (!FAL_KEY) return NextResponse.json({ error: 'FAL_API_KEY not configured' }, { status: 503 })

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const { count } = await supabaseAdmin.from('reel_studio_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business_id).gte('created_at', dayStart.toISOString())
  if ((count ?? 0) >= 25)
    return NextResponse.json({ error: 'Daily reel limit reached (25/day).' }, { status: 429 })

  const dur = Math.min(Math.max(Math.round(duration_seconds), 5), 10)
  const costAud = Math.round(dur * 0.07 * 1.5 * 100) / 100 // $0.07/sec * AUD markup

  const stylePrefix = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.lifestyle
  const videoPrompt = (stylePrefix + ' ' + (prompt ?? 'Australian small business, authentic and warm') + ', 9:16 vertical, cinematic').slice(0, 500)

  const { data: session } = await supabaseAdmin.from('reel_studio_sessions').insert({
    business_id, influencer_id: influencer_id ?? null,
    prompt: videoPrompt, style, duration_seconds: dur,
    status: 'processing', cost_aud: costAud, credits_used: dur,
  }).select().single()

  // Build fal.ai payload - use image-to-video if influencer image provided
  const useImageToVideo = !!image_url
  const falUrl = useImageToVideo ? FAL_URL_IMG : FAL_URL
  const falBody: Record<string, any> = {
    prompt: videoPrompt,
    duration: String(dur),
    aspect_ratio: '9:16',
  }
  if (useImageToVideo) falBody.image_url = image_url

  try {
    const res = await fetch(falUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falBody),
      signal: AbortSignal.timeout(55000),
    })
    const text = await res.text()
    console.log('[reels/generate] fal.ai ->', res.status, text.slice(0, 200))
    if (!res.ok) throw new Error(`fal.ai ${res.status}: ${text.slice(0, 150)}`)
    const d = JSON.parse(text)
    const jobId = d.request_id ?? d.id
    if (!jobId) throw new Error('No request_id from fal.ai: ' + text.slice(0, 100))
    await supabaseAdmin.from('reel_studio_sessions').update({ higgsfield_job_id: jobId }).eq('id', session?.id)
    return NextResponse.json({ job_id: jobId, session_id: session?.id, duration: dur, estimated_cost_aud: costAud, status: 'queued', provider: 'fal' })
  } catch (e: any) {
    await supabaseAdmin.from('reel_studio_sessions').update({ status: 'failed' }).eq('id', session?.id)
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
