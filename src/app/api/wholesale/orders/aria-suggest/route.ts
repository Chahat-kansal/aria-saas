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
  customer_id: z.string().uuid(),
})

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await validateBody(req, Schema)
  if ('error' in parsed) return parsed.error
  const { business_id, customer_id } = parsed.data

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch last 6 orders for this customer
  const { data: orders } = await supabaseAdmin
    .from('wholesale_orders')
    .select('id, created_at, total')
    .eq('business_id', business_id)
    .eq('customer_id', customer_id)
    .in('status', ['confirmed', 'invoiced', 'sent', 'paid'])
    .order('created_at', { ascending: false })
    .limit(6)

  if (!orders || orders.length < 3) {
    return NextResponse.json({ suggestion: null, reason: 'no_clear_pattern' })
  }

  // Fetch items for all those orders
  const orderIds = orders.map((o: { id: string }) => o.id)
  const { data: allItems } = await supabaseAdmin
    .from('wholesale_order_items')
    .select('order_id, product_id, name, sku, unit_price, quantity')
    .in('order_id', orderIds)

  // Count product_id occurrences
  const productCount: Record<string, { count: number; name: string; sku: string | null; unit_price: number; quantity: number }> = {}
  for (const item of (allItems ?? [])) {
    if (!item.product_id) continue
    if (!productCount[item.product_id]) {
      productCount[item.product_id] = {
        count: 0,
        name: item.name,
        sku: item.sku ?? null,
        unit_price: item.unit_price,
        quantity: item.quantity,
      }
    }
    productCount[item.product_id].count += 1
  }

  // Items appearing in >= 3 orders
  const repeatItems = Object.entries(productCount)
    .filter(([, v]) => v.count >= 3)
    .map(([product_id, v]) => ({ product_id, ...v }))

  if (repeatItems.length === 0) {
    return NextResponse.json({ suggestion: null, reason: 'no_clear_pattern' })
  }

  // Use AI to analyze and refine the suggestion
  const suggestion = await trackAICall(
    {
      route: 'wholesale/orders/aria-suggest',
      model: 'claude-haiku-4-5-20251001',
      businessId: business_id,
      purpose: 'wholesale pattern detection',
    },
    async () => {
      const client = new Anthropic()
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: 'Based on these repeat order items for a wholesale customer, suggest a smart reorder cart. Return JSON only: {"items": [{"product_id": string, "name": string, "sku": string|null, "quantity": number, "unit_price": number}], "summary": string}\n\nRepeat items: ' + JSON.stringify(repeatItems) + '\n\nOrder history: ' + JSON.stringify(orders.map((o: { id: string; created_at: string; total: number }) => ({ id: o.id, date: o.created_at, total: o.total }))),
        }],
      })

      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { items: repeatItems.map(i => ({ product_id: i.product_id, name: i.name, sku: i.sku, quantity: i.quantity, unit_price: i.unit_price })), summary: 'Based on your order history with this customer' }
      return JSON.parse(jsonMatch[0])
    }
  )

  return NextResponse.json({ suggestion })
}

export const POST = withErrorCapture('wholesale/orders/aria-suggest', _POST)
