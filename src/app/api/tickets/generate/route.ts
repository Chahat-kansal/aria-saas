export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { renderBatchHtml, type BatchTemplate, type BatchRenderItem } from '@/lib/tickets/render-batch'
import { resolveTicketPrice } from '@/lib/tickets/ticket-price'

interface ProdRow { id: string; name: string; sku: string | null; barcode: string | null; price: number | null }

// TICKETS-REBUILD — print FROM the canvas (canvas_elements is the single source of truth). The old flat
// show_*/band_* renderer is gone; the printed sheet now matches the canvas design (WYSIWYG). Price is the live
// pos_products.price; a real active promo (pos_promotions) drives was-price/savings, else omitted (no fabrication).

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (active?.business_id as string | null) ?? (await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()).data?.id as string | null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { productIds: string[]; templateId: string; copies?: number; priceOverrides?: Record<string, number> }
  const { productIds, templateId, copies = 1, priceOverrides = {} } = body
  if (!productIds?.length || !templateId) return NextResponse.json({ error: 'productIds and templateId required' }, { status: 400 })

  const [{ data: tpl }, { data: products }] = await Promise.all([
    supabaseAdmin.from('pos_shelf_ticket_templates').select('*').eq('id', templateId).eq('business_id', bid).single(),
    supabaseAdmin.from('pos_products').select('id,name,sku,barcode,price').in('id', productIds).eq('business_id', bid),
  ])
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const template = tpl as unknown as BatchTemplate
  const n = Math.max(1, Math.min(copies, 100))
  const items: BatchRenderItem[] = []
  for (const p of (products ?? []) as ProdRow[]) {
    const override = priceOverrides[p.id]
    const tp = override != null ? { price_snapshot: Number(override), was_price_snapshot: null, promo_label: null } : await resolveTicketPrice(supabaseAdmin, bid, p)
    items.push({ name: p.name, sku: p.sku, barcode: p.barcode, qty: n, ...tp })
  }
  const html = renderBatchHtml(template, items)

  void supabaseAdmin.from('aria_ai_calls').insert({ business_id: bid, agent_key: 'ticket_generator', provider: 'other', model_id: 'none', role: 'generator', success: true, request_summary: `Generated ${productIds.length} tickets (canvas) using template ${templateId}` }).then(undefined, () => {})
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export const POST = withErrorCapture('tickets/generate', _POST)
