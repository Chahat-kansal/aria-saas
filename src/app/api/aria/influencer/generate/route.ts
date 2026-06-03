export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { put } from '@vercel/blob'

const anthropic = new Anthropic()
const VEO_MODEL = 'veo-2.0-generate-001'

const SCENE_PROMPTS: Record<string, string[]> = {
  cafe: [
    'A young woman with curly dark hair and warm brown skin walks into a cosy Melbourne cafe, smiles warmly at camera, picks up a coffee cup, steam rising, morning golden light, authentic UGC Reel style, 9:16 vertical, photorealistic',
    'Young woman with curly dark hair enjoys a flat white at a Melbourne cafe, looks at camera and smiles genuinely, warm ambient cafe light, authentic Reel style, 9:16 vertical, photorealistic',
  ],
  liquor: [
    'Young woman with curly dark hair and warm brown skin walks through a well-stocked bottle shop, picks up a wine bottle, examines it smiling, warm retail lighting, candid UGC style, 9:16 vertical, photorealistic',
  ],
  restaurant: [
    'Young woman with curly dark hair sits at a restaurant table, beautiful plate of food arrives, she looks genuinely excited, warm dining room, candid UGC Reel style, 9:16 vertical, photorealistic',
  ],
  bakery: [
    'Young woman with curly dark hair walks into an artisan bakery, picks up a fresh loaf and smells it delightedly, warm golden bakery light, candid UGC style, 9:16 vertical, photorealistic',
  ],
  retail: [
    'Young woman with curly dark hair browses a local retail store, picks up a product, examines it with interest, smiles at camera, bright retail lighting, candid Reel style, 9:16 vertical, photorealistic',
  ],
  other: [
    'Young woman with curly dark hair visits a local Australian small business, she looks genuinely impressed, smiles warmly at camera, natural lighting, authentic UGC Reel, 9:16 vertical, photorealistic',
  ],
}

async function generateVeoVideo(scenePrompt: string, masterImageUrl: string, apiKey: string): Promise<string | null> {
  const requestBody: Record<string, unknown> = {
    model: VEO_MODEL,
    prompt: { text: scenePrompt },
    generationConfig: { durationSeconds: 5, aspectRatio: '9:16' },
  }

  try {
    const imgRes = await fetch(masterImageUrl)
    if (imgRes.ok) {
      const imgBuf = await imgRes.arrayBuffer()
      requestBody.image = {
        imageBytes: Buffer.from(imgBuf).toString('base64'),
        mimeType: imgRes.headers.get('content-type') ?? 'image/jpeg',
      }
    }
  } catch { /* proceed without start frame */ }

  const veoRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:generateVideo?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) }
  )
  const veoData = await veoRes.json() as { name?: string; error?: { message: string } }
  if (veoData.error) throw new Error(veoData.error.message)
  if (!veoData.name) return null

  // Poll up to 20 attempts × 5s = 100s max
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${veoData.name}?key=${apiKey}`)
    const pollData = await pollRes.json() as { done?: boolean; response?: { generatedVideos?: Array<{ video?: { uri: string } }> } }
    if (pollData.done && pollData.response?.generatedVideos?.[0]?.video?.uri) {
      const videoUri = pollData.response.generatedVideos[0].video.uri
      const videoRes = await fetch(`${videoUri}&key=${apiKey}`)
      if (!videoRes.ok) return null
      const buf = await videoRes.arrayBuffer()
      const blob = await put(`aria-influencer/reel-${Date.now()}.mp4`, buf, { access: 'public', contentType: 'video/mp4' })
      return blob.url
    }
  }
  return null
}

/**
 * POST /api/aria/influencer/generate
 * Full pipeline: pick featured business → pull real data → Claude caption → Veo Reel → queue for approval
 * Called manually from dashboard OR by weekly cron (council-session cron triggers this on Sundays)
 */
async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; skip_video?: boolean; post_type?: string }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  // Get influencer config (master image URL)
  const { data: config } = await supabaseAdmin.from('aria_influencer_config')
    .select('*').eq('is_active', true).limit(1).maybeSingle()
  if (!config) return NextResponse.json({ error: 'Influencer not configured. Set up master image first.' }, { status: 400 })

  // Pick featured business — either specified or pick one with most activity this week
  let bizId = body.business_id
  if (!bizId) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: activeBiz } = await supabaseAdmin.from('pos_sales')
      .select('business_id')
      .gte('created_at', weekAgo)
      .eq('status', 'completed')
      .limit(100)
    // Pick the business with most sales this week
    const counts: Record<string, number> = {}
    for (const r of activeBiz ?? []) {
      counts[r.business_id] = (counts[r.business_id] ?? 0) + 1
    }
    bizId = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0]
  }
  if (!bizId) return NextResponse.json({ error: 'No active business found to feature' }, { status: 404 })

  // Load business data
  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('id,name,industry,suburb,state').eq('id', bizId).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [salesRes, topProductRes, reviewRes] = await Promise.all([
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bizId).eq('status','completed').gte('created_at', weekAgo),
    supabaseAdmin.from('pos_sale_items').select('quantity,pos_products(name,price)').eq('business_id', bizId).gte('created_at', weekAgo).order('quantity',{ascending:false}).limit(3),
    supabaseAdmin.from('pos_reviews').select('rating,review_text,reviewer_name').eq('business_id', bizId).eq('rating',5).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ])

  const weekRevenue = (salesRes.data ?? []).reduce((s,r) => s + (r.total_amount ?? 0), 0)
  const topProduct = (topProductRes.data ?? []).find((i: any) => i.pos_products?.name)
  const topProductName = (topProduct as any)?.pos_products?.name ?? null
  const bestReview = reviewRes.data

  // Generate caption with Claude
  const captionPrompt = `You are writing an Instagram Reel caption for @ariaos.au — the AriaOS AI platform Instagram page.
The post features Aria, our AI ambassador, visiting ${biz.name} (a ${biz.industry ?? 'small business'} in ${biz.suburb ?? 'Australia'}).

Real data this week:
${topProductName ? `- Best seller: ${topProductName}` : ''}
${weekRevenue > 0 ? `- Revenue this week: A$${weekRevenue.toFixed(0)}` : ''}
${bestReview?.review_text ? `- Latest 5-star review: "${bestReview.review_text}"` : ''}

Write a SHORT Instagram caption (2-3 sentences max). Tone: warm, genuine, proud of small businesses.
Mention that Aria (the AI) helped power results. Tag the business concept.
End with a CTA like "powered by @ariaos.au".
Include 6-8 hashtags on a new line.
Australian English. No emojis in hashtags.

Respond with JSON only:
{"caption": "main text", "hashtags": ["tag1","tag2"]}`

  let caption = `Aria visited ${biz.name} this week 🤍 powered by @ariaos.au`
  let hashtags: string[] = ['ariaos', 'australiansmallbusiness', 'supportlocal', 'aiforsmallbusiness']

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: captionPrompt }],
    })
    const text = msg.content.find(b => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
    if (parsed.caption) caption = parsed.caption
    if (parsed.hashtags?.length) hashtags = parsed.hashtags
  } catch { /* use defaults */ }

  // Generate Veo Reel
  const industry = (biz.industry ?? 'other').toLowerCase()
  const scenes = SCENE_PROMPTS[industry] ?? SCENE_PROMPTS.other
  const scenePrompt = scenes[Math.floor(Math.random() * scenes.length)]

  let videoUrl: string | null = null
  if (!body.skip_video) {
    videoUrl = await generateVeoVideo(scenePrompt, config.master_image_url, apiKey)
  }

  const effectivePostType = body.post_type === 'story' ? 'story' : 'reel'

  // Save to aria_influencer_posts as draft — owner approves before it goes live
  const { data: post, error } = await supabaseAdmin.from('aria_influencer_posts').insert({
    featured_business_id: bizId,
    video_url: videoUrl,
    caption,
    hashtags,
    scene_prompt: scenePrompt,
    industry,
    status: 'draft',
    post_type: effectivePostType,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    post,
    video_url: videoUrl,
    caption,
    hashtags,
    featured_business: biz.name,
    message: videoUrl
      ? 'Reel generated and queued for approval. Review in the Influencer dashboard.'
      : 'Caption generated. Video generation skipped (set skip_video: false to generate).',
  })
}

export const POST = withErrorCapture('aria/influencer/generate', _POST)
