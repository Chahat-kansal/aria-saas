import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

const anthropic = new Anthropic()

/**
 * POST /api/social/growth-post
 * Auto-generates a social post from real POS data and queues it for one-tap approval.
 * Called by the owner from the Social dashboard "Growth Engine" panel.
 * UPGRADE_ONLY: add more content types, never remove existing ones.
 *
 * The generated post goes to social_posts with status='draft' and approval_status='pending'.
 * The owner sees it instantly and can approve with one tap — which schedules it for next
 * optimal posting time via the existing publish-scheduled cron.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { business_id, platform } = await req.json()
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id,name,industry,suburb,state')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check social connection exists
  const targetPlatform = platform || 'instagram'
  const { data: conn } = await supabase.from('social_connections')
    .select('id,platform,platform_account_name')
    .eq('business_id', business_id).eq('platform', targetPlatform).eq('is_active', true).maybeSingle()
  if (!conn) return NextResponse.json({ error: `${targetPlatform} not connected` }, { status: 400 })

  // Gather real data for content
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [salesRes, topProductRes, reviewRes] = await Promise.all([
    supabase.from('pos_sales').select('total_amount').eq('business_id', business_id)
      .eq('status', 'completed').gte('created_at', weekAgo),
    // Top product by quantity sold this week
    supabase.from('pos_sale_items')
      .select('quantity, pos_products(name, price, category)')
      .eq('business_id', business_id).gte('created_at', weekAgo)
      .order('quantity', { ascending: false }).limit(5),
    // Best recent review
    supabase.from('reviews').select('rating,content,text,reviewer_name')
      .eq('business_id', business_id).eq('rating', 5)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const weekRevenue = (salesRes.data ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const topProduct = (topProductRes.data ?? []).find((i: any) => i.pos_products?.name)
  const topProductName = (topProduct as any)?.pos_products?.name ?? null
  const topProductPrice = (topProduct as any)?.pos_products?.price ?? null
  const bestReview = reviewRes.data

  // Determine post angle based on available data
  let angle = 'general'
  if (topProductName) angle = 'top_product'
  else if (bestReview?.content ?? bestReview?.text) angle = 'social_proof'
  else if (weekRevenue > 0) angle = 'week_celebration'

  const INDUSTRY_VOICE: Record<string, string> = {
    cafe: 'warm, coffee-loving, community-focused. Use sensory language about coffee and food. Australian casual tone.',
    liquor: 'knowledgeable, friendly, responsible. Celebrate craft and discovery. Always include responsible service reminder.',
    restaurant: 'passionate about food, welcoming, storytelling-focused.',
    retail: 'helpful, value-focused, no-nonsense Australian tone.',
    bakery: 'warm, artisan, celebrate the craft of baking.',
    convenience: 'friendly, quick, local-focused.',
    other: 'friendly, professional, locally focused.',
  }
  const voice = INDUSTRY_VOICE[biz.industry ?? 'other'] ?? INDUSTRY_VOICE.other

  const prompt = `You are writing a ${targetPlatform} post for ${biz.name}, a ${biz.industry} in ${biz.suburb ?? 'Australia'}.

Tone: ${voice}

${angle === 'top_product' ? `Their best-selling item this week: ${topProductName} at $${topProductPrice}.` : ''}
${angle === 'social_proof' && bestReview ? `Recent 5-star review: "${bestReview.content ?? (bestReview as any).text ?? ''}" — from ${bestReview.reviewer_name ?? 'a happy customer'}.` : ''}
${angle === 'week_celebration' ? `They had $${weekRevenue.toFixed(0)} in sales this week.` : ''}

Write ONE ${targetPlatform} post. Requirements:
- 2-3 sentences max. Punchy, visual, real.
- End with a clear call to action (visit us, try it today, come in this week, etc.)
- For instagram: include 5-8 relevant hashtags on a new line
- For facebook: no hashtags, more conversational
- DO NOT use emojis in the hashtags line
- DO NOT mention prices unless it helps
- Make it feel written by a human, not a robot
- Australian English

Respond with JSON only, no markdown:
{
  "caption": "the post text without hashtags",
  "hashtags": ["hashtag1", "hashtag2"],
  "image_prompt": "a vivid 10-word description of the ideal photo to accompany this post",
  "reasoning": "one sentence on why this angle will attract new customers"
}`

  let caption = '', hashtags: string[] = [], image_prompt = '', reasoning = ''
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.find(b => b.type === 'text')?.text ?? '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    caption = parsed.caption ?? ''
    hashtags = parsed.hashtags ?? []
    image_prompt = parsed.image_prompt ?? ''
    reasoning = parsed.reasoning ?? ''
  } catch (e: any) {
    return NextResponse.json({ error: 'AI generation failed: ' + e.message }, { status: 500 })
  }

  if (!caption) return NextResponse.json({ error: 'No caption generated' }, { status: 500 })

  // Schedule for next optimal posting time
  // Cafe: 8am next weekday; Liquor/retail: 5pm Thursday-Friday; others: 10am
  const now = new Date()
  const scheduled = new Date(now)
  scheduled.setDate(scheduled.getDate() + 1)
  scheduled.setMinutes(0); scheduled.setSeconds(0)
  if (['cafe', 'bakery'].includes(biz.industry ?? '')) {
    scheduled.setHours(8)
  } else if (['liquor', 'retail', 'convenience'].includes(biz.industry ?? '')) {
    scheduled.setHours(17)
    // Push to Thursday if weekend
    if ([0,1,2].includes(scheduled.getDay())) {
      const daysToThursday = (4 - scheduled.getDay() + 7) % 7 || 7
      scheduled.setDate(scheduled.getDate() + daysToThursday)
    }
  } else {
    scheduled.setHours(10)
  }

  // Insert as draft — owner approves with one tap
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('social_posts')
    .insert({
      business_id,
      platform: targetPlatform,
      caption,
      hashtags,
      image_url: null,
      image_prompt,
      status: 'draft',
      approval_status: 'pending',
      scheduled_for: scheduled.toISOString(),
      aria_reasoning: reasoning,
      industry_context: `Auto-generated growth post. Angle: ${angle}. Week revenue: $${weekRevenue.toFixed(0)}.`,
      content_type: 'growth_post',
    })
    .select().single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    post: inserted,
    angle,
    scheduled_for: scheduled.toISOString(),
    message: `Growth post created for ${targetPlatform}. Tap Approve to schedule it for ${scheduled.toLocaleDateString('en-AU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`,
  })
}
