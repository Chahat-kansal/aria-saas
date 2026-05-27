export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
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

const TYPE_GUIDANCE: Record<string, string> = {
  update:    'A warm general update — what\'s new, who you are, why someone should care. 1-2 short paragraphs.',
  offer:     'A short, punchy offer. Lead with the discount or deal, then one line of detail. No fluff.',
  new_stock: 'A short post announcing new stock or arrivals. Mention one or two items and why they\'re good.',
  event:     'An event invite — what, when, where, why it\'s worth showing up. Two short paragraphs max.',
  story:     'A one-line 24-hour story style post. Under 25 words. Bold and instantly clear.',
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({})) as { post_type?: string; hint?: string }
  const postType = body.post_type && TYPE_GUIDANCE[body.post_type] ? body.post_type : 'update'
  const hint = (body.hint ?? '').toString().slice(0, 400)

  // Pull a small, grounded slice of the business context so Aria isn't inventing
  const [bizRes, prodRes, salesRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name, industry, city, suburb').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_products')
      .select('name, price, stock_quantity, track_stock')
      .eq('business_id', bid).eq('is_active', true)
      .order('updated_at', { ascending: false }).limit(30),
    supabaseAdmin.from('pos_sale_items')
      .select('product_name, quantity, pos_sales!inner(business_id, created_at, status)')
      .eq('pos_sales.business_id', bid).neq('pos_sales.status', 'voided')
      .gte('pos_sales.created_at', new Date(Date.now() - 30 * 86400000).toISOString()).limit(500),
  ])

  const biz = bizRes.data as { name?: string | null; industry?: string | null; city?: string | null; suburb?: string | null } | null
  type Prod = { name: string; price: number | null; stock_quantity: number | null; track_stock: boolean | null }
  const products = (prodRes.data ?? []) as Prod[]
  const inStock = products.filter(p => p.track_stock === false || Number(p.stock_quantity ?? 0) > 0)
  const sampleProducts = inStock.slice(0, 12).map(p => p.name).join(', ') || 'none yet'

  // Top sellers last 30d
  const sold: Record<string, number> = {}
  for (const r of ((salesRes.data ?? []) as Array<{ product_name: string | null; quantity: number | null }>)) {
    if (!r.product_name) continue
    sold[r.product_name] = (sold[r.product_name] ?? 0) + Number(r.quantity ?? 0)
  }
  const topSellers = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n).join(', ') || 'no recent sales'

  const userPrompt = `Draft an Aria Community post for the customer-facing feed.
Business: ${biz?.name ?? 'an Australian business'}${biz?.industry ? ', a ' + biz.industry : ''}${biz?.city || biz?.suburb ? ' in ' + (biz?.suburb ?? biz?.city) : ''}.
Post type: ${postType} — ${TYPE_GUIDANCE[postType]}
${hint ? 'Owner\'s hint: ' + hint : ''}
Real data:
- In-stock products (sample): ${sampleProducts}
- Top sellers last 30 days: ${topSellers}

Voice: warm, Australian, never corporate. Speak directly to customers. Concise. No emoji spam (max one tasteful emoji if it fits).
${postType === 'story' ? 'Output: a SINGLE line, max 25 words, no title.' : 'Output: a short title (max 8 words) and a 1-3 paragraph body.'}

Return ONLY JSON, no prose:
${postType === 'story' ? '{"body": "the one-liner"}' : '{"title": "...", "body": "..."}'}`

  const msg = await trackAICall(
    { route: 'community/owner/ai-draft', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'community-draft' },
    () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You write social-media posts for Australian small businesses. Warm, specific, never generic. Ground every claim in the real data you are given. Return ONLY the JSON requested.',
      messages: [{ role: 'user', content: userPrompt }],
    })
  )

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const parsed = parseLLMJsonOr<{ title?: string; body?: string }>(text, {}, 'community/owner/ai-draft')
  if (!parsed.body) {
    return NextResponse.json({ error: 'Could not draft a post. Try again with a different hint.' }, { status: 502 })
  }

  return NextResponse.json({
    draft: {
      title: parsed.title ?? null,
      body: parsed.body,
      post_type: postType,
      ai_generated: true,
    },
  })
}

export const POST = withErrorCapture('community/owner/ai-draft', _POST)
