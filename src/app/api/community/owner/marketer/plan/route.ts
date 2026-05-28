export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { parseLLMJsonOr } from '@/lib/ai-json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// ── Best-times analyzer: when do followers engage? ───────────────────
// Looks at community_post_engagement for this business's posts over last 60d
// and returns per-weekday hour suggestions.
async function bestTimes(business_id: string): Promise<Record<number, number>> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString()
  // First get this business's post ids
  const { data: posts } = await supabaseAdmin.from('community_posts')
    .select('id').eq('business_id', business_id).gte('published_at', sixtyDaysAgo).limit(500)
  const postIds = ((posts ?? []) as Array<{ id: string }>).map(p => p.id)
  const defaultByDow: Record<number, number> = { 0: 11, 1: 9, 2: 9, 3: 10, 4: 12, 5: 16, 6: 11 }
  if (postIds.length === 0) return defaultByDow

  const { data: engs } = await supabaseAdmin.from('community_post_engagement')
    .select('created_at, engagement_type')
    .in('post_id', postIds).limit(5000)
  type Eng = { created_at: string; engagement_type: string }
  // Score engagement: like=2, comment=4, save=3, share=3, view=1
  const weight: Record<string, number> = { like: 2, comment: 4, save: 3, share: 3, view: 1 }
  const dowHourScore: Record<string, number> = {}
  for (const e of (engs ?? []) as Eng[]) {
    const d = new Date(e.created_at)
    const key = d.getDay() + '-' + d.getHours()
    dowHourScore[key] = (dowHourScore[key] ?? 0) + (weight[e.engagement_type] ?? 1)
  }
  if (Object.keys(dowHourScore).length === 0) return defaultByDow

  // For each day-of-week, pick the highest-scoring hour (clamped to 7-21 for sanity)
  const best: Record<number, number> = { ...defaultByDow }
  for (let dow = 0; dow < 7; dow++) {
    let topHour = best[dow]
    let topScore = -1
    for (let h = 7; h <= 21; h++) {
      const s = dowHourScore[dow + '-' + h] ?? 0
      if (s > topScore) { topScore = s; topHour = h }
    }
    if (topScore > 0) best[dow] = topHour
  }
  return best
}

interface DraftSpec {
  post_type?: string
  title?: string | null
  body?: string
  hashtags?: string[]
  reasoning?: string
  day_offset?: number  // 0 = Monday this week, 6 = Sunday — best-times will set the hour
}

// POST — generate a week's worth of marketing drafts
async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  // Pull a slice of real business context
  const [bizRes, prodRes, salesRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name, industry, city, suburb, community_bio').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_products').select('name, price, stock_quantity, track_stock')
      .eq('business_id', bid).eq('is_active', true).order('updated_at', { ascending: false }).limit(40),
    supabaseAdmin.from('pos_sale_items')
      .select('product_name, quantity, pos_sales!inner(business_id, created_at, status)')
      .eq('pos_sales.business_id', bid).neq('pos_sales.status', 'voided')
      .gte('pos_sales.created_at', new Date(Date.now() - 30 * 86400_000).toISOString()).limit(2000),
  ])
  const biz = bizRes.data as { name?: string | null; industry?: string | null; city?: string | null; suburb?: string | null; community_bio?: string | null } | null
  type Prod = { name: string; price: number | null; stock_quantity: number | null; track_stock: boolean | null }
  const products = (prodRes.data ?? []) as Prod[]
  const inStock = products.filter(p => p.track_stock === false || Number(p.stock_quantity ?? 0) > 0)
  const productNames = inStock.slice(0, 16).map(p => p.name)
  // Top sellers last 30d
  const sold: Record<string, number> = {}
  for (const r of (salesRes.data ?? []) as Array<{ product_name: string | null; quantity: number | null }>) {
    if (!r.product_name) continue
    sold[r.product_name] = (sold[r.product_name] ?? 0) + Number(r.quantity ?? 0)
  }
  const topSellers = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n)

  // Best-times preload (used to pre-fill suggested_for_at)
  const best = await bestTimes(bid)

  // Compute Monday this week (local-ish — use UTC midnight + AU offset is close enough)
  const now = new Date()
  const day = now.getDay() // 0 = Sunday
  const offsetToMonday = (day + 6) % 7   // Mon→0, Tue→1, …, Sun→6
  const monday = new Date(now)
  monday.setDate(now.getDate() - offsetToMonday)
  monday.setHours(0, 0, 0, 0)

  const userPrompt = `Draft a week of community posts (7 posts, one per day) for this Australian small business.
Business: ${biz?.name ?? 'a local shop'}${biz?.industry ? ', a ' + biz.industry : ''}${biz?.suburb || biz?.city ? ' in ' + (biz?.suburb ?? biz?.city) : ''}.
${biz?.community_bio ? 'Bio: ' + biz.community_bio.slice(0, 240) : ''}

Real data:
- In-stock products (sample): ${productNames.join(', ') || 'none yet'}
- Top sellers last 30 days: ${topSellers.join(', ') || 'no recent sales'}

Voice: warm, Australian, specific. Vary the post_type across the week.
Available post_types: update | offer | new_stock | event | story.
Use AT LEAST 4 different post_types across the 7 days.
Keep titles short (max 8 words). Body 1-3 short paragraphs.
Pick 3-6 relevant hashtags per post — short, lowercase, no spaces.

Return ONLY a JSON object with this exact shape, nothing else:
{"drafts": [{"day_offset": 0, "post_type": "update|offer|new_stock|event|story", "title": "...", "body": "...", "hashtags": ["...", "..."], "reasoning": "one short sentence — why this post on this day"}]}`

  const resp = await trackAICall(
    { route: 'community/owner/marketer/plan', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'community-week-plan' },
    () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2400,
      system: 'You write a full week of social posts for an Australian small business. Ground every post in the data given — never invent products. Return ONLY the JSON requested, nothing else.',
      messages: [{ role: 'user', content: userPrompt }],
    })
  )
  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  const parsed = parseLLMJsonOr<{ drafts?: DraftSpec[] }>(text, {}, 'community/owner/marketer/plan')
  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.slice(0, 7) : []
  if (drafts.length === 0) return NextResponse.json({ error: 'Could not generate drafts. Try again.' }, { status: 502 })

  const plan_run_id = randomUUID()
  const rows = drafts.map(d => {
    const dayOff = Math.max(0, Math.min(6, Number(d.day_offset ?? 0)))
    const scheduled = new Date(monday)
    scheduled.setDate(monday.getDate() + dayOff)
    // Map "monday=0..sunday=6" back to JS day-of-week for best-times lookup
    const jsDow = (1 + dayOff) % 7 // mon→1, sun→0
    scheduled.setHours(best[jsDow] ?? 10, 0, 0, 0)
    return {
      business_id: bid,
      plan_run_id,
      post_type: ['update','offer','new_stock','event','story'].includes(d.post_type ?? '') ? d.post_type : 'update',
      draft_title: (d.title ?? '').toString().slice(0, 200) || null,
      draft_body: (d.body ?? '').toString().slice(0, 4000),
      draft_hashtags: Array.isArray(d.hashtags) ? d.hashtags.slice(0, 8) : [],
      channels: ['community'],
      suggested_for_at: scheduled.toISOString(),
      aria_reasoning: (d.reasoning ?? '').toString().slice(0, 300) || null,
      status: 'proposed',
    }
  }).filter(r => r.draft_body)

  if (rows.length === 0) return NextResponse.json({ error: 'No usable drafts in the response.' }, { status: 502 })

  const { data: inserted, error } = await supabaseAdmin.from('aria_marketing_drafts').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan_run_id, drafts: inserted ?? [] })
}

// GET — list this week's drafts (default) or a specific plan_run_id
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const plan_run_id = searchParams.get('plan_run_id')

  let q = supabaseAdmin.from('aria_marketing_drafts')
    .select('id, plan_run_id, post_type, draft_title, draft_body, draft_hashtags, channels, suggested_for_at, aria_reasoning, status, community_post_id, social_post_ids, posted_at, created_at')
    .eq('business_id', bid)
    .order('suggested_for_at', { ascending: true })
    .limit(40)
  if (plan_run_id) q = q.eq('plan_run_id', plan_run_id)

  const { data } = await q
  return NextResponse.json({ drafts: data ?? [] })
}

export const GET  = withErrorCapture('community/owner/marketer/plan', _GET)
export const POST = withErrorCapture('community/owner/marketer/plan', _POST)
