export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyManagerToken } from '@/lib/pos/manager-token'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { manager_token, reason_code, reason_note } = await req.json()

  const managerId = manager_token ? verifyManagerToken(manager_token) : null
  if (!managerId) return NextResponse.json({ error: 'Valid manager PIN required' }, { status: 403 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const { data: biz } = await supabase.from('businesses').select('id,industry').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  const bid = active?.business_id ?? biz?.id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: sale } = await supabase.from('pos_sales').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
  if (sale.status === 'voided') return NextResponse.json({ error: 'Sale already voided' }, { status: 400 })

  // void_reason feeds the log_sale_void trigger → deletion_audit_log.reason. Use the cashier's
  // free-text note, falling back to the reason code; nullable so legacy/empty voids still succeed.
  await supabase.from('pos_sales').update({ status: 'voided', void_reason: reason_note || reason_code || null, last_edited_at: new Date().toISOString() }).eq('id', id)

  // Restore stock for all items — CANONICAL items_on_hand (+ stock_quantity cache). Idempotent: the
  // status='voided' guard above means this runs at most once per sale. (INV-DECREMENT-FIX phase 2)
  const voidOutletId = await resolveOutletId(supabase, bid, (sale as { outlet_id?: string | null }).outlet_id ?? null)
  const { data: items } = await supabase.from('pos_sale_items').select('product_id, quantity').eq('sale_id', id)
  for (const item of items ?? []) {
    if (!item.product_id) continue
    await supabase.rpc('increment_numeric', { p_table: 'pos_products', p_id: item.product_id, p_column: 'stock_quantity', p_amount: item.quantity }) // cache
    await adjustOutletStock(supabase, { businessId: bid, outletId: voidOutletId, productId: item.product_id, delta: Math.abs(Number(item.quantity)) }) // canonical
  }

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'void', reason_code: reason_code ?? 'other',
    reason_note, amount: sale.total_amount, sale_id: id,
    performed_by: user.id, manager_approved_by: managerId,
  })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/sales/[id]/void', _POST)