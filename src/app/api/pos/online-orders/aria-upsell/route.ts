export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>
  const { order_id, business_id, items } = body
  if (!order_id || !business_id) return NextResponse.json({ error: 'order_id and business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id as string).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: products } = await db.from('pos_products').select('name, price, category').eq('business_id', business_id as string).eq('is_active', true).limit(30)
  const itemList = Array.isArray(items) ? (items as Array<{ name: string; qty: number }>).map(i => `${i.qty}x ${i.name}`).join(', ') : 'unknown items'
  const productList = (products ?? []).map((p: Record<string,unknown>) => `${p.name} ($${p.price})`).join(', ')
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: `Customer ordered: ${itemList}. Available products: ${productList}. Suggest ONE complementary add-on in 1 sentence, casual Australian tone, under 80 chars. e.g. "Add a slice of banana bread for $4.50?"` }],
  })
  const upsell = ((resp.content[0] as { type: string; text: string }).text ?? '').trim()
  await db.from('pos_online_orders').update({ aria_upsell: upsell }).eq('id', order_id as string).eq('business_id', business_id as string)
  waitUntil((async () => { try { await db.from('aria_ai_calls').insert({ business_id, model: 'claude-haiku-4-5-20251001', prompt_summary: 'online_order_upsell', response_summary: upsell, tokens_used: resp.usage.input_tokens + resp.usage.output_tokens }) } catch (e) { console.error('[silent-catch]', e) } })())
  return NextResponse.json({ upsell })
}

export const POST = withErrorCapture('pos/online-orders/aria-upsell', _POST)
