export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { buildSocialSystemPrompt, getSocialIndustryConfig } from '@/lib/social/industry-prompts'
import { getBestSlotForPlatform } from '@/lib/social/smart-scheduler'
import { getRelevantImage } from '@/lib/images/pixabay'
import { guardOutput, numbersIn } from '@/lib/aria/ground-guard'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { business_id, request_text, schedule_kind, specific_date, recurrence_rule } = body

  if (!business_id || !request_text?.trim()) {
    return NextResponse.json({ error: 'business_id and request_text required' }, { status: 400 })
  }

  // Verify ownership
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, industry')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Log the request
  const { data: reqRow } = await supabase
    .from('social_owner_requests')
    .insert({
      business_id: biz.id,
      request_text,
      schedule_kind: schedule_kind ?? 'asap',
      specific_date: specific_date ?? null,
      recurrence_rule: recurrence_rule ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  const cfg = getSocialIndustryConfig(biz.industry ?? 'other')
  const systemPrompt = buildSocialSystemPrompt(biz.industry ?? 'other', biz.name)

  // Get connected platforms
  const { data: connections } = await supabase
    .from('social_connections')
    .select('platform')
    .eq('business_id', biz.id)
    .eq('is_active', true)

  const activePlatforms = (connections ?? [])
    .map(c => c.platform)
    .filter(p => cfg.preferredPlatforms.includes(p as 'instagram' | 'facebook' | 'google_business'))

  if (activePlatforms.length === 0) {
    return NextResponse.json({ error: 'No connected platforms matching this industry' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Determine schedule time — use smart scheduler for asap
  let scheduledFor: string | null = null
  if (schedule_kind === 'specific_date' && specific_date) {
    scheduledFor = new Date(specific_date).toISOString()
  } else if (schedule_kind === 'asap' || !schedule_kind) {
    // Pick the next optimal slot for the first connected platform
    const firstPlatform = activePlatforms[0]
    if (firstPlatform) {
      scheduledFor = getBestSlotForPlatform(firstPlatform, biz.industry ?? 'other', new Date())
    }
  }

  const userPrompt = `The business owner just requested:
"${request_text}"

Schedule type: ${schedule_kind ?? 'asap'}
${specific_date ? 'Specific date: ' + specific_date : ''}
${recurrence_rule ? 'Recurrence: ' + recurrence_rule : ''}

Generate ${activePlatforms.length} post(s) — one optimized for each platform:
${activePlatforms.map(p => '- ' + p).join('\n')}

IMPORTANT: do NOT state any price, discount, statistic, or number unless it appears verbatim in the owner's request above. This business has no data feed here — invented figures would be published publicly.

Return a JSON array with this exact shape:
[
  {
    "platform": "instagram",
    "caption": "...",
    "hashtags": ["#tag1","#tag2"],
    "image_query": "2-4 word search term for relevant photo",
    "scheduled_for": "${scheduledFor ?? 'null'}",
    "post_type": "image"
  }
]

Only output the JSON array. No preamble.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cleaned = text.replace(/```json|```/g, '').trim()

  let posts: Array<{
    platform: string
    caption: string
    hashtags?: string[]
    image_query?: string
    scheduled_for?: string | null
    post_type?: string
  }> = []

  try {
    posts = JSON.parse(cleaned)
  } catch {
    console.error('[owner-request] AI parse failed:', cleaned.slice(0, 200))
    return NextResponse.json({ error: 'AI parse failed' }, { status: 500 })
  }

  // FAB-FIX-2 — this surface injects NO business data, so the ONLY grounded numbers are those the owner
  // typed in their request. Any $/%/stat the model invented is stripped before the (pending-approval) draft.
  const allowedNums = numbersIn(request_text)

  const createdIds: string[] = []

  for (const p of posts) {
    const capGuard = await guardOutput(p.caption ?? '', allowedNums, { mode: 'redact', businessId: biz.id, surface: 'social/owner-request:caption' })
    p.caption = capGuard.text
    let imageUrl: string | null = null
    if (p.image_query) {
      try {
        imageUrl = await getRelevantImage(p.image_query, {
          category: ['cafe', 'restaurant', 'bakery'].includes(biz.industry ?? '') ? 'food' : 'business',
        })
      } catch (e) { console.error('[non-fatal]', e) }
    }

    const { data: newPost } = await supabase
      .from('social_posts')
      .insert({
        business_id: biz.id,
        platform: p.platform,
        caption: p.caption,
        hashtags: p.hashtags ?? [],
        image_url: imageUrl,
        scheduled_for: p.scheduled_for && p.scheduled_for !== 'null' ? p.scheduled_for : null,
        status: 'draft',
        approval_status: 'pending',
        owner_request: request_text,
        schedule_kind: schedule_kind ?? 'once',
        recurrence_rule: recurrence_rule ?? null,
      })
      .select('id')
      .single()

    if (newPost) createdIds.push(newPost.id)
  }

  // Mark request as generated
  if (reqRow) {
    await supabase
      .from('social_owner_requests')
      .update({ resolved_post_ids: createdIds, status: 'generated' })
      .eq('id', reqRow.id)
  }

  return NextResponse.json({ ok: true, post_ids: createdIds, count: createdIds.length })
}

export const POST = withErrorCapture('social/owner-request', _POST)