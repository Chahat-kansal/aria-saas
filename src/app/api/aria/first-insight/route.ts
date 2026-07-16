import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { guardOutput, numbersIn } from '@/lib/aria/ground-guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const anthropic = new Anthropic()

/**
 * GET /api/aria/first-insight?businessId=
 * Generates a single sharp insight from the business's real data.
 * Called once after first product is added. Uses Haiku for speed.
 */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ insight: null })

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ insight: null })

  const { data: biz } = await supabase
    .from('businesses').select('name,industry,suburb,state')
    .eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ insight: null })

  // Gather data
  const [products, sales, customers] = await Promise.all([
    supabase.from('pos_products').select('name,price,category').eq('business_id', businessId).eq('is_active', true).limit(20),
    supabase.from('pos_sales').select('total_amount,created_at').eq('business_id', businessId).eq('status', 'completed').order('created_at', { ascending: false }).limit(30),
    supabase.from('pos_customers').select('id').eq('business_id', businessId),
  ])

  const productCount = products.data?.length ?? 0
  if (productCount === 0) return NextResponse.json({ insight: null })

  const totalRevenue = (sales.data ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const saleCount = sales.data?.length ?? 0
  const avgBasket = saleCount > 0 ? totalRevenue / saleCount : 0
  const topProducts = (products.data ?? []).slice(0, 5).map(p => `${p.name} ($${p.price})`).join(', ')

  const prompt = `You are Aria, an AI business co-owner for Australian small businesses. 
A ${biz.industry} business called "${biz.name}" in ${biz.suburb ?? 'Australia'} just connected their data.

Their data:
- ${productCount} active products. Top items: ${topProducts}
- ${saleCount} sales recorded. Total revenue: A$${totalRevenue.toFixed(2)}
- Average basket: A$${avgBasket.toFixed(2)}
- ${customers.data?.length ?? 0} customers

Write ONE sharp, specific insight about their business in 2 sentences max. 
Be concrete — reference their actual numbers. Make them feel like Aria already knows their business.
Do not use bullet points. Do not be generic. Tone: confident business partner, not assistant.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    })
    let text = msg.content.find(b => b.type === 'text')?.text ?? null
    // INTEL-COMPUTE-3 — this call bypassed grounded.ts entirely (direct Anthropic SDK, no guard of
    // any kind), and the model only sees a 20-product/30-sale SAMPLE (not the business's full data)
    // — real risk of it improvising a plausible-sounding number/day/total it was never given.
    // Redact any $/%/count not grounded in the real figures actually passed in the prompt.
    if (text) {
      const allowed = numbersIn(`${productCount} ${saleCount} ${totalRevenue.toFixed(2)} ${avgBasket.toFixed(2)} ${customers.data?.length ?? 0} ${topProducts}`)
      text = (await guardOutput(text, allowed, { mode: 'redact', businessId, surface: 'first-insight' })).text
    }
    return NextResponse.json({ insight: text })
  } catch {
    return NextResponse.json({ insight: null })
  }
}
