export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { renderBatchHtml, type BatchTemplate, type BatchRenderItem } from '@/lib/tickets/render-batch'

// TICKETS-REBUILD+BATCH-1 — print a batch FROM the chosen template's canvas (WYSIWYG) using the SNAPSHOTTED
// price/promo (immutable since scan). Marks the batch printed. Returns the self-printing HTML sheet.

type Params = { params: Promise<{ id: string }> | { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { template_id?: string }
  if (!body.template_id) return NextResponse.json({ error: 'template_id required' }, { status: 400 })

  const [{ data: batch }, { data: tpl }] = await Promise.all([
    supabaseAdmin.from('ticket_print_batches').select('id, name').eq('id', id).eq('business_id', bid).maybeSingle(),
    supabaseAdmin.from('pos_shelf_ticket_templates').select('*').eq('id', body.template_id).eq('business_id', bid).maybeSingle(),
  ])
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const { data: items } = await supabaseAdmin.from('ticket_print_batch_items')
    .select('product_id, qty, price_snapshot, was_price_snapshot, promo_label').eq('batch_id', id).eq('business_id', bid)
  const ids = Array.from(new Set((items ?? []).map(i => i.product_id as string)))
  const { data: prods } = ids.length ? await supabaseAdmin.from('pos_products').select('id, name, sku, barcode').in('id', ids) : { data: [] }
  const pMap = new Map((prods ?? []).map((p: { id: string; name: string; sku: string | null; barcode: string | null }) => [p.id, p]))

  const renderItems: BatchRenderItem[] = (items ?? []).map(i => {
    const p = pMap.get(i.product_id as string)
    return {
      name: p?.name ?? 'Item', sku: p?.sku ?? null, barcode: p?.barcode ?? null,
      qty: Number(i.qty) || 1, price_snapshot: Number(i.price_snapshot),
      was_price_snapshot: i.was_price_snapshot != null ? Number(i.was_price_snapshot) : null, promo_label: (i.promo_label as string | null) ?? null,
    }
  })
  const html = renderBatchHtml(tpl as unknown as BatchTemplate, renderItems)

  await supabaseAdmin.from('ticket_print_batches').update({ status: 'printed', printed_at: new Date().toISOString(), template_id: body.template_id }).eq('id', id).eq('business_id', bid)
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export const POST = withErrorCapture('tickets/batches/[id]/print', _POST)
