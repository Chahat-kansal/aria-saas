export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { validateBody } from '@/lib/api/validate'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const Schema = z.object({
  business_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  text: z.string().min(1).max(10000),
})

interface ParsedOrderItem {
  name: string
  quantity: number
}

interface ProductRow {
  id: string
  name: string
  sku: string | null
  price: number
  cost_price: number | null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await validateBody(req, Schema)
  if ('error' in parsed) return parsed.error
  const { business_id, customer_id, text } = parsed.data

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch all products for fuzzy matching
  const { data: products } = await supabaseAdmin
    .from('pos_products')
    .select('id, name, sku, price, cost_price')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .limit(500)

  const productList = (products ?? []) as ProductRow[]

  // Use AI to parse the email/pasted text
  const parsedItems = await trackAICall(
    {
      route: 'wholesale/orders/from-email',
      model: 'claude-haiku-4-5-20251001',
      businessId: business_id,
      purpose: 'wholesale email parsing',
    },
    async () => {
      const client = new Anthropic()
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: 'Parse this wholesale order email/text and extract product names and quantities. Return JSON only: {"items": [{"name": string, "quantity": number}]}\n\nText:\n' + text,
        }],
      })

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { items: [] }
      const result = JSON.parse(jsonMatch[0])
      return result
    }
  )

  const aiItems: ParsedOrderItem[] = Array.isArray(parsedItems?.items) ? parsedItems.items : []

  // Fuzzy-match products
  const matched: Array<{ parsed_name: string; quantity: number; product: ProductRow }> = []
  const unmatched: Array<{ parsed_name: string; quantity: number }> = []

  for (const item of aiItems) {
    const nameLower = (item.name || '').toLowerCase()
    // Exact match first
    let found = productList.find(p => p.name.toLowerCase() === nameLower)
    // Partial match
    if (!found) found = productList.find(p => p.name.toLowerCase().includes(nameLower) || nameLower.includes(p.name.toLowerCase()))
    // SKU match
    if (!found && item.name) found = productList.find(p => p.sku && p.sku.toLowerCase() === nameLower)

    if (found) {
      matched.push({ parsed_name: item.name, quantity: item.quantity, product: found })
    } else {
      unmatched.push({ parsed_name: item.name, quantity: item.quantity })
    }
  }

  // Fetch customer tier for pricing
  let customerTier = 0
  if (customer_id) {
    const { data: cust } = await supabaseAdmin.from('customers').select('wholesale_tier').eq('id', customer_id).maybeSingle()
    customerTier = Number(cust?.wholesale_tier) || 0
  }

  function calcPrice(product: ProductRow, tier: number): number {
    if (product.cost_price != null && Number(product.cost_price) > 0) return Number(product.cost_price)
    const retail = Number(product.price) || 0
    if (tier === 1) return Math.round(retail * 0.85 * 100) / 100
    if (tier === 2) return Math.round(retail * 0.78 * 100) / 100
    if (tier === 3) return Math.round(retail * 0.70 * 100) / 100
    return retail
  }

  const matchedResult = matched.map(m => ({
    parsed_name: m.parsed_name,
    quantity: m.quantity,
    product_id: m.product.id,
    name: m.product.name,
    sku: m.product.sku,
    unit_price: calcPrice(m.product, customerTier),
    retail_price: Number(m.product.price) || 0,
    line_total: Math.round(calcPrice(m.product, customerTier) * m.quantity * 100) / 100,
  }))

  return NextResponse.json({ matched: matchedResult, unmatched })
}

export const POST = withErrorCapture('wholesale/orders/from-email', _POST)
