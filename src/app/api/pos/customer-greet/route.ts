import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getWeatherContext } from '@/lib/aria/get-weather-context'
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const POST = withErrorCapture('pos/customer-greet', async (req: Request) => {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { customerName, businessId } = await req.json().catch(() => ({}))

  if (!user || !customerName || !businessId || !supabaseAdmin) {
    return NextResponse.json({ greeting: null, customer: null })
  }

  const { data: bizOwned } = await supabase.from('businesses').select('id').eq('id', businessId as string).eq('user_id', user.id).maybeSingle()
  if (!bizOwned) return NextResponse.json({ greeting: null, customer: null })

  // Fetch business info
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, industry, city, suburb')
    .eq('id', businessId)
    .single()

  // Fuzzy customer match by name
  const { data: customers } = await supabaseAdmin
    .from('customers')
    .select('id, name, total_spent, visit_count, last_visit, notes')
    .eq('business_id', businessId)
    .ilike('name', `%${(customerName as string).trim()}%`)
    .limit(3)

  const customer = (customers as any[])?.[0] ?? null

  // Pull last 10 purchases if customer found
  let purchaseHistory: any[] = []
  if (customer) {
    const { data: sales } = await supabaseAdmin
      .from('pos_sales')
      .select('id, total_amount, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customer.id)
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .limit(10)

    purchaseHistory = sales ?? []

    // Supplement with pos_sale_items if pos_sales.items is sparse
    if (purchaseHistory.every((s: any) => !Array.isArray(s.items) || s.items.length === 0)) {
      const saleIds = purchaseHistory.map((s: any) => s.id).filter(Boolean)
      if (saleIds.length > 0) {
        const { data: lineItems } = await supabaseAdmin
          .from('pos_sale_items')
          .select('product_name, quantity, unit_price, sale_id')
          .in('sale_id', saleIds)
          .limit(50)
        if (lineItems && lineItems.length > 0) {
          // Remap into items array for frequency counting
          const byId: Record<string, any[]> = {}
          for (const li of lineItems as any[]) {
            if (!byId[li.sale_id]) byId[li.sale_id] = []
            byId[li.sale_id].push({ name: li.product_name, quantity: li.quantity, price: li.unit_price })
          }
          purchaseHistory = purchaseHistory.map((s: any) => ({ ...s, items: byId[s.id] ?? s.items }))
        }
      }
    }
  }

  // Extract favourite products from purchase history
  const productFreq: Record<string, { name: string; count: number }> = {}
  for (const sale of purchaseHistory) {
    if (!Array.isArray(sale.items)) continue
    for (const item of sale.items) {
      const key = item.product_id ?? item.name ?? 'unknown'
      if (!productFreq[key]) productFreq[key] = { name: item.name ?? key, count: 0 }
      productFreq[key].count += item.quantity ?? 1
    }
  }
  const favourites = Object.values(productFreq)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Get featured / trending products to suggest for new customers
  const { data: trending } = await supabaseAdmin
    .from('pos_products')
    .select('name, category')
    .eq('business_id', businessId)
    .eq('featured', true)
    .limit(5)

  const city     = biz?.city ?? biz?.suburb ?? 'Melbourne'
  const industry = biz?.industry ?? 'retail'
  const weather  = await getWeatherContext(industry, city)

  const daysSince = customer?.last_visit
    ? Math.floor((Date.now() - new Date(customer.last_visit).getTime()) / 86400000)
    : null

  const ctx = {
    customer: customer
      ? {
          first_name:             (customer.name as string).split(' ')[0],
          full_name:              customer.name,
          visit_count:            customer.visit_count,
          total_spent:            customer.total_spent,
          days_since_last_visit:  daysSince,
          notes:                  customer.notes,
          favourite_products:     favourites,
        }
      : {
          first_name: (customerName as string).split(' ')[0],
          full_name:  customerName,
          is_new:     true,
        },
    business: { name: biz?.name, industry: biz?.industry },
    trending_products: trending ?? [],
    weather: weather
      ? { temp_c: weather.today.temp_c, condition: weather.today.condition, description: weather.today.description }
      : null,
  }

  const isLapsed = daysSince != null && daysSince > 30

  const systemPrompt = `You are Aria, the AI co-owner of ${biz?.name ?? 'this business'}.
You generate short, warm, personalised greetings shown on a customer-facing display at the POS.

RULES:
- First name only, always
- Max 2 sentences. Never more.
- Conversational and warm — like a local who remembers you
- Always weave in ONE specific product reference (from their history OR a trending product that fits the weather/season)
- Weather: if it's hot, suggest something cold. If rainy, something comforting. If mild, ignore weather.
- Lapsed customers (30+ days): acknowledge the gap warmly, never make them feel guilty
- New customers: welcoming, suggest your most popular item
- Never use: "Welcome back", "Great to see you", "How can I help", "leverage", "experience"
- No emojis
- Australian English and tone — casual, genuine, never corporate

EXAMPLES by scenario:

Returning regular, hot day, likes craft beer:
"Hey Matty — 36 degrees out there, you've earned a cold one.
The Stone & Wood's ice cold up the front if you're keen."

Lapsed customer, 6 weeks gone, wine buyer:
"Sarah! It's been a minute — good to have you back.
We just got a Hunter Valley Shiraz in you'd love."

New customer, rainy day, cafe:
"Hey Emma, welcome in — perfect day for it.
The house blend is going off today if you want a proper warm up."

Regular, cold day, convenience store:
"James — freezing one today hey.
Grabbed some of those new chilli chips if you want something to take the edge off."

Output ONLY the greeting text. No quotes, no preamble, nothing else.`

  const response = await anthropic.messages.create({
    model:       'claude-haiku-4-5-20251001',
    max_tokens:  100,
    temperature: 0.85,
    system:      systemPrompt,
    messages: [{ role: 'user', content: `Generate a greeting:\n${JSON.stringify(ctx, null, 2)}` }],
  })

  const greeting = response.content[0].type === 'text' ? response.content[0].text.trim() : null

  // Update last_visit timestamp
  if (customer) {
    await supabaseAdmin
      .from('customers')
      .update({ last_visit: new Date().toISOString() })
      .eq('id', customer.id)
  }

  return NextResponse.json({
    greeting,
    customer: customer
      ? {
          name:                  customer.name,
          visit_count:           customer.visit_count,
          total_spent:           customer.total_spent,
          days_since_last_visit: daysSince,
          is_known:              true,
          is_lapsed:             isLapsed,
        }
      : { name: customerName, is_known: false },
  })
})
