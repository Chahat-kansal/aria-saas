export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getUpcomingHolidays } from '@/lib/external-apis'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, month, platforms, posts_per_week = 3 } = await req.json() as {
    business_id: string; month: string; platforms: string[]; posts_per_week: number
  }
  if (!business_id || !month) return NextResponse.json({ error: 'business_id and month required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id,name,industry,city').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get business media library
  const { data: mediaLibrary } = await supabaseAdmin
    .from('business_media')
    .select('id, url, aria_description, tags, used_in_posts')
    .eq('business_id', business_id)
    .eq('media_type', 'image')
    .order('used_in_posts', { ascending: true }) // prioritise least-used photos
    .limit(50)

  // Get top selling products for content ideas
  const { data: salesItems } = await supabaseAdmin
    .from('pos_sale_items')
    .select('product_name, quantity')
    .eq('business_id', business_id)
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())

  const productCounts: Record<string, number> = {}
  for (const item of salesItems ?? []) {
    if (item.product_name) productCounts[item.product_name] = (productCounts[item.product_name] || 0) + item.quantity
  }
  const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name)

  // Get upcoming holidays for content hooks
  const holidays = getUpcomingHolidays(45, 'VIC')

  // Calculate posting dates for the month
  const [year, monthNum] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const postDates: string[] = []
  const daysPerWeek = Math.floor(7 / posts_per_week)
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthNum - 1, day)
    if (day % daysPerWeek === 0 || (posts_per_week >= 5 && [1,3,5].includes(date.getDay()))) {
      postDates.push(`${month}-${String(day).padStart(2, '0')}`)
    }
  }

  const hasMedia = (mediaLibrary ?? []).length > 0
  const mediaDescriptions = (mediaLibrary ?? []).slice(0, 15).map((m, i) =>
    `Photo ${i + 1}: ${m.aria_description || 'Business photo'} (ID: ${m.id})`
  ).join('\n')

  // Generate full month content calendar with Claude Sonnet
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Generate a full month social media content calendar for this Australian ${biz.industry} business.

BUSINESS: ${biz.name}, ${biz.city || 'Australia'}
INDUSTRY: ${biz.industry}
MONTH: ${month}
PLATFORMS: ${(platforms || ['instagram', 'facebook']).join(', ')}
POSTING DATES: ${postDates.slice(0, 20).join(', ')}

${hasMedia ? `BUSINESS PHOTOS AVAILABLE (use these, don't suggest stock photos):
${mediaDescriptions}` : 'No business photos uploaded yet — suggest image concepts they should photograph.'}

TOP SELLING PRODUCTS: ${topProducts.join(', ') || 'Various products'}

UPCOMING EVENTS/HOLIDAYS: ${holidays.slice(0, 5).map((h: Record<string, unknown>) => `${h.name} (${h.days_away} days away)`).join(', ') || 'None soon'}

Return ONLY a valid JSON array of posts. Each post:
{
  "date": "YYYY-MM-DD",
  "platform": "instagram" | "facebook" | "google_business",
  "caption": "Full caption ready to post — authentic Australian voice, specific to business",
  "hashtags": ["array", "of", "hashtags", "max 8"],
  "best_time": "HH:MM",
  "topic": "product" | "story" | "promotion" | "event" | "behind_scenes" | "customer" | "tip",
  "media_id": "use photo ID from above or null if no photo fits",
  "image_concept": "Specific photo to take if no media_id — e.g. 'Close-up of your [specific item] on the counter'",
  "why": "One sentence why this works for this business"
}

Generate ${Math.min(postDates.length, 16)} posts spread across the month. Mix topics. Use real photo IDs when they match the post concept.`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

  let posts: Record<string, unknown>[] = []
  try {
    posts = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Failed to generate calendar', raw }, { status: 500 })
  }

  // Save all posts to social_posts table
  const saved = []
  for (const p of posts) {
    const mediaId = p.media_id && mediaLibrary?.find(m => m.id === p.media_id) ? p.media_id : null
    const mediaUrl = mediaId ? mediaLibrary?.find(m => m.id === mediaId)?.url ?? null : null

    const { data: post } = await supabaseAdmin.from('social_posts').insert({
      business_id,
      platform: p.platform,
      status: 'draft',
      approval_status: 'pending',
      caption: p.caption,
      hashtags: p.hashtags,
      image_url: mediaUrl,
      media_id: mediaId,
      aria_reasoning: p.why,
      industry_context: p.image_concept,
      scheduled_for: `${p.date}T${p.best_time || '09:00'}:00`,
      content_calendar_month: month,
    }).select().single()

    if (post) {
      saved.push({ ...post, topic: p.topic, image_concept: p.image_concept })
      // Increment used_in_posts counter for used media
      if (mediaId) {
        await supabaseAdmin.from('business_media')
          .update({ used_in_posts: (mediaLibrary?.find(m => m.id === mediaId)?.used_in_posts ?? 0) + 1 })
          .eq('id', mediaId)
      }
    }
  }

  return NextResponse.json({
    posts: saved,
    count: saved.length,
    month,
    has_media: hasMedia,
    media_count: (mediaLibrary ?? []).length,
  })
}

export const POST = withErrorCapture('social/calendar', _POST)
