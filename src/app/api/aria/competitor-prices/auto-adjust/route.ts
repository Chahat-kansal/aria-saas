export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { createDecision } from '@/lib/decisions/createDecision'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, product_id, suggested_price, reason } = await req.json() as {
    business_id: string; product_id: string; suggested_price: number; reason: string
  }
  if (!business_id || !product_id || !suggested_price)
    return NextResponse.json({ error: 'business_id, product_id, suggested_price required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: product } = await supabase.from('pos_products')
    .select('id,name,price,cost_price').eq('id', product_id).eq('business_id', business_id).maybeSingle()
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const currentPrice = Number(product.price)
  const costPrice = Number(product.cost_price) || 0
  const newMargin = costPrice > 0 ? ((suggested_price - costPrice) / suggested_price * 100).toFixed(1) : null
  const pctChange = ((suggested_price - currentPrice) / Math.max(currentPrice, 0.01) * 100).toFixed(1)

  // SPINE-1 — identical row, now also emitting the 'proposed' moat event + real-time push.
  // createDecision returns the id this route already returned to its caller.
  const actionId = await createDecision({
    business_id,
    domain: 'money',
    kind: 'price_adjustment',
    category: 'pricing',
    priority: Math.abs(suggested_price - currentPrice) / Math.max(currentPrice, 0.01) > 0.10 ? 'important' : 'routine',
    title: 'Price adjustment: ' + String(product.name),
    subtitle: reason || ('Competitor pricing suggests changing ' + String(product.name) + ' from A$' + currentPrice.toFixed(2) + ' to A$' + suggested_price.toFixed(2) + (newMargin ? ' — new margin: ' + newMargin + '%' : '')),
    payload: { product_id, product_name: product.name, current_price: currentPrice, suggested_price, new_margin_pct: newMargin },
    estimated_impact: 'A$' + Math.abs(suggested_price - currentPrice).toFixed(2) + ' price change (' + (suggested_price > currentPrice ? '+' : '') + pctChange + '%)',
  })

  if (!actionId) return NextResponse.json({ error: 'Failed to create price adjustment' }, { status: 500 })
  return NextResponse.json({ ok: true, action_id: actionId, current_price: currentPrice, suggested_price })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action_id } = await req.json() as { action_id: string }
  const { data: action } = await supabase.from('aria_autopilot_actions').select('*').eq('id', action_id).maybeSingle()
  if (!action) return NextResponse.json({ error: 'Action not found' }, { status: 404 })
  if (action.status !== 'approved') return NextResponse.json({ error: 'Action not approved' }, { status: 400 })

  const data = action.action_data as { product_id: string; suggested_price: number }
  const { error: updateErr } = await supabase.from('pos_products')
    .update({ price: data.suggested_price, updated_at: new Date().toISOString() })
    .eq('id', data.product_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await supabase.from('aria_autopilot_actions')
    .update({ status: 'executed', executed_at: new Date().toISOString() })
    .eq('id', action_id)

  return NextResponse.json({ ok: true, new_price: data.suggested_price })
}

export const POST = withErrorCapture('aria/competitor-prices/auto-adjust', _POST)
export const PATCH = withErrorCapture('aria/competitor-prices/auto-adjust', _PATCH)
