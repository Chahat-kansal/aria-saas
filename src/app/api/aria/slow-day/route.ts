export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, slow_day } = await req.json()
  if (!business_id || !slow_day) return NextResponse.json({ error: 'business_id and slow_day required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('name,industry,city').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: topProducts } = await supabase
    .from('pos_products')
    .select('name,price,stock_quantity')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('price', { ascending: false })
    .limit(10)

  const prompt = `You are a marketing expert for Australian small businesses.

Business: ${biz.name} (${biz.industry ?? 'retail'}) in ${biz.city ?? 'Australia'}
Slow day to boost: ${slow_day}
Top products: ${(topProducts ?? []).map(p => p.name + ' A$' + p.price).join(', ')}

Generate 3 specific promotional ideas to increase revenue on ${slow_day}. Each idea must be realistic and actionable for a small ${biz.industry ?? 'retail'} business.

Return ONLY a JSON array:
[{
  "title": "Happy Hour deal name",
  "description": "Why this works and how to run it",
  "discount": "20% off" or "Buy 2 get 1 free" etc,
  "channel": "sms" or "social" or "instore" or "email",
  "estimated_uplift": "15-25% more revenue",
  "message_template": "Ready to send SMS/social message under 160 chars"
}]`

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = ((resp.content[0] as { type: string; text: string }).text ?? '').trim()
    const ideas = parseLLMJsonOr<unknown[]>(text, [], 'slow-day', 'array')
    return NextResponse.json({ ideas })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export const POST = withErrorCapture('aria/slow-day', _POST)
