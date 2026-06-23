export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// TICKETS-REBUILD+BATCH-1 — batch detail: the snapshotted items (price/promo immutable since scan time).

type Params = { params: Promise<{ id: string }> | { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: batch } = await supabaseAdmin.from('ticket_print_batches')
    .select('id, name, status, item_count, created_at, printed_at, template_id').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: items } = await supabaseAdmin.from('ticket_print_batch_items')
    .select('id, product_id, qty, price_snapshot, was_price_snapshot, promo_label').eq('batch_id', id).eq('business_id', bid)
  const ids = Array.from(new Set((items ?? []).map(i => i.product_id as string)))
  const { data: prods } = ids.length ? await supabaseAdmin.from('pos_products').select('id, name, sku').in('id', ids) : { data: [] }
  const pMap = new Map((prods ?? []).map((p: { id: string; name: string; sku: string | null }) => [p.id, p]))

  return NextResponse.json({
    batch: { id: batch.id, name: batch.name, status: batch.status, item_count: batch.item_count, created_at: batch.created_at, printed_at: batch.printed_at, template_id: batch.template_id },
    items: (items ?? []).map(i => ({
      id: i.id, product_id: i.product_id, qty: Number(i.qty) || 1,
      product_name: pMap.get(i.product_id as string)?.name ?? 'Item', product_sku: pMap.get(i.product_id as string)?.sku ?? null,
      price_snapshot: Number(i.price_snapshot), was_price_snapshot: i.was_price_snapshot != null ? Number(i.was_price_snapshot) : null, promo_label: (i.promo_label as string | null) ?? null,
    })),
  })
}

export const GET = withErrorCapture('tickets/batches/[id]', _GET)
