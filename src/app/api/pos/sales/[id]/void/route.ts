export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyManagerToken } from '@/lib/pos/manager-token'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { recordSaleMovements, VOID_MOVEMENT_TYPE, type SaleMovementLine } from '@/lib/inventory/record-sale-movement'
import { reverseEarnOnSale } from '@/lib/loyalty/reverseEarnOnSale'

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
  // BUGFIX-POS-4 FIX 5 — error-check the void BEFORE restoring stock, so a failed void can't double-count
  // stock (status not voided but items_on_hand already incremented).
  const { error: voidErr } = await supabase.from('pos_sales').update({ status: 'voided', void_reason: reason_note || reason_code || null, last_edited_at: new Date().toISOString() }).eq('id', id)
  if (voidErr) return NextResponse.json({ error: voidErr.message }, { status: 500 })

  // Restore stock for all items — CANONICAL items_on_hand (+ stock_quantity cache). Idempotent: the
  // status='voided' guard above means this runs at most once per sale. (INV-DECREMENT-FIX phase 2)
  const voidOutletId = await resolveOutletId(supabase, bid, (sale as { outlet_id?: string | null }).outlet_id ?? null)
  const { data: items } = await supabase.from('pos_sale_items').select('product_id, quantity').eq('sale_id', id)
  const voidMovementLines: SaleMovementLine[] = []
  for (const item of items ?? []) {
    if (!item.product_id) continue
    // SECURITY-P5 Tier 2 — item.product_id here is read from pos_sale_items scoped to `id`, a sale
    // already verified to belong to `bid` above; supabaseAdmin (not the caller's session role) keeps
    // this RPC callable after EXECUTE is revoked from anon/authenticated at the DB level.
    await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_products', p_id: item.product_id, p_column: 'stock_quantity', p_amount: item.quantity }) // cache
    const itemsOnHand = await adjustOutletStock(supabase, { businessId: bid, outletId: voidOutletId, productId: item.product_id, delta: Math.abs(Number(item.quantity)) }) // canonical
    voidMovementLines.push({ itemId: item.product_id, quantitySold: Number(item.quantity), newStock: itemsOnHand })
  }
  await recordSaleMovements(supabase, {
    businessId: bid, saleId: id, saleNumber: (sale as { sale_number?: string | null }).sale_number ?? null,
    lines: voidMovementLines, movementType: VOID_MOVEMENT_TYPE, outletId: voidOutletId, writtenBy: 'pos/sales/[id]/void',
  })

  // LOYALTY-FINISH — reverse any loyalty points earned on this sale. Never
  // blocks the void itself; a reversal failure is logged, not fatal.
  try {
    await reverseEarnOnSale({ businessId: bid, saleId: id, totalAmount: Number(sale.total_amount ?? 0) })
  } catch (e) { console.error('[pos/sales/void] loyalty reversal failed:', (e as Error).message) }

  const { error: auditErr } = await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'void', reason_code: reason_code ?? 'other',
    reason_note, amount: sale.total_amount, sale_id: id,
    performed_by: user.id, manager_approved_by: managerId,
  })
  if (auditErr) console.error('[pos/sales/void] audit log insert failed:', auditErr.message) // BUGFIX-POS-4 FIX 5

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/sales/[id]/void', _POST)