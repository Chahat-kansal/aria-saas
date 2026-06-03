export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const business_id = req.nextUrl.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Verify ownership
  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('id, name, industry').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Gather POS intelligence in parallel
  const [topProducts, slowDays, lowStock, newProducts, recentReviews, recentSales] = await Promise.all([
    // Top selling products last 30 days
    supabaseAdmin.from('pos_sale_items').select('quantity, pos_products(name, price, category)')
      .eq('pos_sales.business_id', business_id)
      .gte('pos_sales.created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(100).then(r => {
        const counts: Record<string, { name: string; price: number; qty: number }> = {}
        for (const item of r.data ?? []) {
          const p = (item as any).pos_products
          if (!p) continue
          if (!counts[p.name]) counts[p.name] = { name: p.name, price: p.price, qty: 0 }
          counts[p.name].qty += item.quantity ?? 1
        }
        return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 5)
      }).catch(() => []),

    // Slowest days of week
    supabaseAdmin.rpc('get_slow_days', { p_business_id: business_id }).then(r => r.data ?? []).catch(async () => {
      const { data } = await supabaseAdmin.from('pos_sales')
        .select('created_at').eq('business_id', business_id).neq('status', 'voided').limit(200)
      if (!data?.length) return []
      const days: Record<string, number> = {}
      const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      for (const s of data) { const d = names[new Date(s.created_at).getDay()]; days[d] = (days[d] ?? 0) + 1 }
      return Object.entries(days).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([day]) => day)
    }),

    // Low stock products
    supabaseAdmin.from('pos_products')
      .select('name, stock_quantity, price').eq('business_id', business_id)
      .eq('is_active', true).not('stock_quantity', 'is', null).lt('stock_quantity', 10)
      .order('stock_quantity').limit(3).then(r => r.data ?? []).catch(() => []),

    // New products added last 14 days
    supabaseAdmin.from('pos_products')
      .select('name, price, created_at').eq('business_id', business_id).eq('is_active', true)
      .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('created_at', { ascending: false }).limit(4).then(r => r.data ?? []).catch(() => []),

    // Recent positive reviews
    supabaseAdmin.from('reviews').select('rating, review_text, reviewer_name')
      .eq('business_id', business_id).gte('rating', 4)
      .order('created_at', { ascending: false }).limit(3)
      .then(r => r.data ?? []).catch(() => []),

    // Revenue last 7 days vs prior 7 days
    supabaseAdmin.from('pos_sales').select('total_amount, created_at')
      .eq('business_id', business_id).neq('status', 'voided')
      .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .then(r => {
        const sales = r.data ?? []
        const cutoff = Date.now() - 7 * 86400000
        const recent = sales.filter(s => new Date(s.created_at).getTime() > cutoff)
        const prior = sales.filter(s => new Date(s.created_at).getTime() <= cutoff)
        const recentRev = recent.reduce((a, s) => a + Number(s.total_amount ?? 0), 0)
        const priorRev = prior.reduce((a, s) => a + Number(s.total_amount ?? 0), 0)
        return { recentRev, priorRev, trend: priorRev > 0 ? ((recentRev - priorRev) / priorRev * 100).toFixed(0) : null }
      }).catch(() => ({ recentRev: 0, priorRev: 0, trend: null })),
  ])

  // Build context for Claude
  const context = {
    business_name: biz.name,
    industry: biz.industry,
    top_products: topProducts,
    slow_days: slowDays,
    low_stock: lowStock,
    new_products: newProducts,
    recent_reviews: recentReviews,
    revenue_trend: recentSales,
  }

  const prompt = `You are Aria, an AI business advisor for Australian small businesses. Generate exactly 5 specific, actionable reel ideas based on this live business data.

Business: ${biz.name} (${biz.industry})
Top selling products (last 30 days): ${JSON.stringify(topProducts)}
Slowest days of week: ${JSON.stringify(slowDays)}
Low stock products: ${JSON.stringify(lowStock)}
New products added recently: ${JSON.stringify(newProducts)}
Recent positive reviews: ${JSON.stringify(recentReviews)}
Revenue trend (this week vs last week): ${JSON.stringify(recentSales)}

Generate 5 reel ideas. Each idea must be directly tied to the actual business data above — reference specific product names, days, or insights.

Respond ONLY with a JSON array of exactly 5 objects. No other text. Each object:
{
  "title": "Short punchy title (max 6 words)",
  "why": "One sentence explaining why this reel makes business sense based on the data",
  "style": "One of: lifestyle, ugc, product_showcase, cinematic, behind_scenes, flash_sale, testimonial, day_in_life",
  "prompt": "Specific scene description for video generation (2-3 sentences, mention the actual product/day/offer)",
  "hook": "Opening caption hook for Instagram (max 10 words, attention-grabbing)",
  "hashtags": ["tag1", "tag2", "tag3"],
  "urgency": "high|medium|low"
}`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (response.content[0] as any).text ?? ''
  let ideas = []
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    ideas = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'Failed to parse ideas', raw: text }, { status: 500 })
  }

  return NextResponse.json({ ideas, context })
}
