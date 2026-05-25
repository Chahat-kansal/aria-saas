export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

interface TplRow {
  width_mm: number; height_mm: number; background_color: string; text_color: string
  band_color: string; band_text_color: string; band_label: string; price_color: string
  show_name: boolean; show_price: boolean; show_sku: boolean; show_barcode: boolean
  show_promo_band: boolean; font_size_name: number; font_size_price: number
  corner_radius: number; name: string
}
interface ProdRow { id: string; name: string; sku: string | null; barcode: string | null; price: number | null; brand: string | null }

function renderTicket(t: TplRow, p: ProdRow, price: number): string {
  const band = t.show_promo_band
    ? `<div style="background:${t.band_color};color:${t.band_text_color};font-size:9px;font-weight:700;padding:3px 6px;letter-spacing:1px;text-transform:uppercase">${t.band_label}</div>`
    : ''
  const nm = t.show_name
    ? `<div style="font-size:${t.font_size_name}px;font-weight:600;color:${t.text_color};line-height:1.2;margin-bottom:2px">${p.name}${p.brand ? ` <span style="font-weight:400;font-size:${t.font_size_name - 2}px">${p.brand}</span>` : ''}</div>`
    : ''
  const pr = t.show_price
    ? `<div style="font-size:${t.font_size_price}px;font-weight:700;color:${t.price_color};line-height:1">$${price.toFixed(2)}</div>`
    : ''
  const sku = t.show_sku && p.sku ? `<div style="font-size:9px;color:#6b7280">SKU: ${p.sku}</div>` : ''
  const bc = t.show_barcode && p.barcode ? `<div style="font-size:8px;font-family:monospace;letter-spacing:2px;color:#374151;margin-top:2px">${p.barcode}</div>` : ''
  return `<div class="ticket" style="width:${t.width_mm}mm;height:${t.height_mm}mm;background:${t.background_color};border-radius:${t.corner_radius}px;page-break-inside:avoid;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;border:1px solid #e5e7eb">${band}<div style="flex:1;padding:4px 6px;display:flex;flex-direction:column;justify-content:space-between">${nm}${pr}${sku}${bc}</div></div>`
}

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
    supabaseAdmin.from('pos_products').select('id,name,sku,barcode,price,brand').in('id', productIds).eq('business_id', bid),
  ])
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const template = tpl as TplRow
  const n = Math.max(1, Math.min(copies, 100))
  const ticketsHtml = (products ?? []).flatMap((p: ProdRow) => {
    const price = priceOverrides[p.id] != null ? Number(priceOverrides[p.id]) : (Number(p.price) || 0)
    return Array.from({ length: n }, () => renderTicket(template, p, price))
  }).join('\n')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Price Tickets — ${template.name}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#f3f4f6;font-family:Arial,sans-serif}.page{display:flex;flex-wrap:wrap;gap:4mm;padding:10mm;justify-content:flex-start}@media print{body{background:#fff}@page{size:${template.width_mm}mm ${template.height_mm}mm;margin:0}.page{gap:2mm;padding:0}.ticket{page-break-inside:avoid}}</style></head><body><div class="page">${ticketsHtml}</div><script>window.onload=()=>{window.print()}<\/script></body></html>`

  void supabaseAdmin.from('aria_ai_calls').insert({ business_id: bid, agent_key: 'ticket_generator', provider: 'internal', model_id: 'none', role: 'generate', success: true, request_summary: `Generated ${productIds.length} tickets using template ${templateId}` }).then(undefined, () => {})
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export const POST = withErrorCapture('tickets/generate', _POST)
