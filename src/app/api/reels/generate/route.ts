export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const FAL_KEY = process.env.FAL_API_KEY ?? ''
const FAL_T2V = 'fal-ai/kling-video/v2.1/pro/text-to-video'
const FAL_I2V = 'fal-ai/kling-video/v2.1/pro/image-to-video'

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

  if (!FAL_KEY) return NextResponse.json({ error: 'FAL_API_KEY not configured' }, { status: 503 })

  const {
    business_id, influencer_id, image_url,
    prompt, style = 'lifestyle', duration_seconds = 10,
  } = await req.json()

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Rate limit
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const { count } = await supabaseAdmin.from('reel_studio_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business_id).gte('created_at', dayStart.toISOString())
  if ((count ?? 0) >= 25)
    return NextResponse.json({ error: 'Daily reel limit reached (25/day).' }, { status: 429 })

  // fal.ai: duration must be string "5" or "10"
  const dur = duration_seconds >= 10 ? '10' : '5'
  const durNum = parseInt(dur)
  const costAud = Math.round(durNum * 0.07 * 1.55 * 100) / 100

  const stylePrefix = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.lifestyle
  const videoPrompt = (stylePrefix + ' ' + (prompt ?? 'Australian small business, authentic and warm') + ', 9:16 vertical').slice(0, 500)

  // Create session first
  const { data: session } = await supabaseAdmin.from('reel_studio_sessions').insert({
    business_id,
    influencer_id: influencer_id ?? null,
    prompt: videoPrompt,
    style,
    duration_seconds: durNum,
    status: 'processing',
    cost_aud: costAud,
    credits_used: durNum,
  }).select().single()

  // Submit to fal.ai queue — returns immediately with request_id
  const model = image_url ? FAL_I2V : FAL_T2V
  const falBody: Record<string, any> = {
    prompt: videoPrompt,
    duration: dur,
    aspect_ratio: '9:16',
    negative_prompt: 'blur, distort, low quality',
  }
  if (image_url) falBody.image_url = image_url

  try {
    const res = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falBody),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    console.log('[reels/generate] fal submit status:', res.status, JSON.stringify(data).slice(0, 200))

    if (!res.ok) {
      throw new Error(`fal.ai error ${res.status}: ${data.detail ?? JSON.stringify(data).slice(0, 100)}`)
    }

    const { request_id, status_url, response_url } = data
    if (!request_id) throw new Error('No request_id returned from fal.ai')

    // Save request_id and response_url to DB
    await supabaseAdmin.from('reel_studio_sessions').update({
      higgsfield_job_id: request_id,
      // store response_url in scene_image_url temporarily for result fetching
      scene_image_url: response_url ?? null,
    }).eq('id', session?.id)

    return NextResponse.json({
      job_id: request_id,
      session_id: session?.id,
      status_url,
      response_url,
      duration: durNum,
      estimated_cost_aud: costAud,
    })
  } catch (e: any) {
    await supabaseAdmin.from('reel_studio_sessions').update({ status: 'failed' }).eq('id', session?.id)
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
