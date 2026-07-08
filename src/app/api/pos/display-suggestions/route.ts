export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ suggestion: null })

  const body = await req.json() as { customer_id: string; session_id?: string; cart_items?: Array<{ name: string; price: number }> }
  if (!body.customer_id) return NextResponse.json({ suggestion: null })

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString()
  const [custQ, salesQ, bizQ] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id,name,loyalty_points,visit_count,total_spent').eq('id', body.customer_id).eq('business_id', bid).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount,created_at,pos_sale_items(quantity,unit_price,pos_products(id,name,price))').eq('business_id', bid).eq('customer_id', body.customer_id).gte('created_at', ninetyDaysAgo).neq('status', 'voided').order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('businesses').select('display_suggestion_max_pct,name').eq('id', bid).maybeSingle(),
  ])

  const customer = custQ.data
  const pastSales = salesQ.data ?? []
  const maxPct = Number(bizQ.data?.display_suggestion_max_pct ?? 5)

  if (!customer || pastSales.length === 0) return NextResponse.json({ suggestion: null })

  const productFreq: Record<string, { id: string; name: string; count: number; price: number }> = {}
  for (const sale of pastSales) {
    for (const item of (sale.pos_sale_items ?? []) as any[]) {
      const pid = item.pos_products?.id ?? ''; const name = item.pos_products?.name ?? ''
      if (!pid) continue
      if (!productFreq[pid]) productFreq[pid] = { id: pid, name, count: 0, price: Number(item.unit_price ?? 0) }
      productFreq[pid].count += Number(item.quantity ?? 1)
    }
  }
  const topProducts = Object.values(productFreq).sort((a, b) => b.count - a.count).slice(0, 5)
  if (topProducts.length === 0) return NextResponse.json({ suggestion: null })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let suggestionData: { type: string; offer_text: string; products: typeof topProducts; discount_pct: number } | null = null

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      system: 'Generate a personalised customer offer. Return ONLY valid JSON, no markdown. Max discount: ' + maxPct + '%.',
      messages: [{ role: 'user', content: 'Customer: ' + customer.name + ', ' + (customer.visit_count ?? 0) + ' visits. Top products: ' + topProducts.map(p => p.name + ' (x' + p.count + ')').join(', ') + '. Cart: ' + (body.cart_items ?? []).map(c => c.name).join(', ') + '. Return JSON: {"type":"repeat_purchase","offer_text":"<12 words max>","products":[{"name":"...","price":0}],"discount_pct":' + Math.min(maxPct, 5) + '}' }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.offer_text && parsed.type) {
      suggestionData = { type: parsed.type, offer_text: String(parsed.offer_text), products: Array.isArray(parsed.products) ? parsed.products : topProducts.slice(0, 2), discount_pct: Math.min(Number(parsed.discount_pct ?? maxPct), maxPct) }
    }
  } catch { return NextResponse.json({ suggestion: null }) }

  if (!suggestionData) return NextResponse.json({ suggestion: null })

  const { data: suggestion } = await supabaseAdmin.from('pos_display_suggestions').insert({
    business_id: bid, customer_id: body.customer_id, customer_name: customer.name,
    session_id: body.session_id ?? null, suggestion_type: suggestionData.type,
    suggested_products: suggestionData.products, offer_text: suggestionData.offer_text,
    discount_pct: suggestionData.discount_pct, discount_max_pct: maxPct, cashier_decision: 'pending',
  }).select().single()

  return NextResponse.json({ suggestion })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { id: string; decision: 'approved' | 'rejected'; cashier_name?: string }
  if (!body.id || !body.decision) return NextResponse.json({ error: 'id and decision required' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('pos_display_suggestions').update({
    cashier_decision: body.decision, cashier_name: body.cashier_name ?? null,
    decided_at: new Date().toISOString(), shown_on_display: body.decision === 'approved',
  }).eq('id', body.id).eq('business_id', bid).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ suggestion: data, ok: true })
}

export const POST = withErrorCapture('pos/display-suggestions', _POST)
export const PATCH = withErrorCapture('pos/display-suggestions', _PATCH)
