export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single()
  return data?.id ?? null
}

interface ReceiveLine { product_id: string; received_qty: number }

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { business_id: string; received_lines: ReceiveLine[] }
  const { business_id, received_lines } = body
  if (!business_id || !received_lines?.length) {
    return NextResponse.json({ error: 'business_id and received_lines required' }, { status: 400 })
  }
  if (!await verifyBiz(supabase, user.id, business_id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: po } = await supabaseAdmin
    .from('warehouse_purchase_orders')
    .select('id, status, items, supplier_id, po_number, business_id')
    .eq('id', params.id)
    .eq('business_id', business_id)
    .single()
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.status === 'received') return NextResponse.json({ error: 'PO already received' }, { status: 400 })

  const poItems: Array<{ product_id: string; product_name: string; qty: number; unit_cost?: number }> = po.items ?? []
  const orderedMap = new Map(poItems.map(i => [i.product_id, i]))

  const discrepancies: Array<{ product_name: string; ordered: number; received: number; diff: number }> = []
  const priceRows: Array<{ business_id: string; supplier_id: string | null; product_id: string; product_name: string; cost_price: number; source: string }> = []

  for (const line of received_lines) {
    if (!line.product_id || line.received_qty < 0) continue

    const { data: prod } = await supabaseAdmin
      .from('pos_products')
      .select('stock_quantity, name, cost_price')
      .eq('id', line.product_id)
      .eq('business_id', business_id)
      .single()
    if (!prod) continue

    const newQty = Number(prod.stock_quantity ?? 0) + line.received_qty
    await supabaseAdmin.from('pos_products')
      .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', line.product_id)
      .eq('business_id', business_id)

    const ordered = orderedMap.get(line.product_id)
    if (ordered && ordered.qty !== line.received_qty) {
      discrepancies.push({ product_name: ordered.product_name, ordered: ordered.qty, received: line.received_qty, diff: line.received_qty - ordered.qty })
    }

    if (ordered?.unit_cost && ordered.unit_cost > 0) {
      priceRows.push({
        business_id, supplier_id: po.supplier_id ?? null,
        product_id: line.product_id, product_name: ordered.product_name ?? prod.name,
        cost_price: ordered.unit_cost, source: 'po_confirmed',
      })
    }
  }

  // Record price points
  if (priceRows.length) {
    void Promise.resolve(supabaseAdmin.from('supplier_product_prices').insert(priceRows)).catch(() => {})
  }

  // Update PO status
  await supabaseAdmin.from('warehouse_purchase_orders').update({
    status: 'received',
    delivery_confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  // Claude summary
  let summary = `Stock updated for ${received_lines.length} products.`
  let inputTokens = 0; let outputTokens = 0; let claudeSuccess = false
  if (discrepancies.length) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
      const discStr = discrepancies.map(d => `${d.product_name}: ordered ${d.ordered}, received ${d.received} (${d.diff > 0 ? '+' : ''}${d.diff})`).join('\n')
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: 'You are Aria. Give a brief 1-2 sentence summary of a stock receipt with discrepancies. Suggest action for shortfalls. Australian English.',
        messages: [{ role: 'user', content: 'PO ' + (po.po_number ?? params.id) + ' received. Discrepancies:\n' + discStr }],
      })
      inputTokens = msg.usage.input_tokens
      outputTokens = msg.usage.output_tokens
      claudeSuccess = true
      summary = (msg.content[0] as any).text ?? summary
    } catch { /* non-fatal */ }
  }

  // Log
  void Promise.resolve(supabaseAdmin.from('aria_ai_calls').insert({
    business_id, agent_key: 'po_receive', provider: 'anthropic',
    model_id: 'claude-haiku-4-5-20251001', role: 'inventory',
    input_tokens: inputTokens, output_tokens: outputTokens, success: claudeSuccess,
  })).catch(() => {})

  return NextResponse.json({ ok: true, summary, discrepancies, stock_updated: received_lines.length })
}

export const PATCH = withErrorCapture('warehouse/purchase-orders/[id]/receive', _PATCH)
