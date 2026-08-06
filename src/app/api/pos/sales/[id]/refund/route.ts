export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyManagerToken } from '@/lib/pos/manager-token'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { recordSaleMovements, REFUND_MOVEMENT_TYPE, type SaleMovementLine } from '@/lib/inventory/record-sale-movement'

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { manager_token, reason_code, reason_note, amount, items: refundItems } = await req.json()
  const managerId = manager_token ? verifyManagerToken(manager_token) : null
  if (!managerId) return NextResponse.json({ error: 'Valid manager PIN required' }, { status: 403 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: original } = await supabase.from('pos_sales').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!original) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  // INV-DECREMENT-FIX — this route has no per-item link to the original sale (unlike
  // pos/sales/return/route.ts's claim_return_qty guard), so it can't enforce an exact per-line
  // limit. Guard at the sale level instead: a retry/double-click that would refund past the
  // original sale's own total is rejected outright, rather than silently double-restocking stock
  // it already restored on the first, successful call.
  // FIX-REFUND-STATUS-1 — this queried status='refund', a value the CHECK forbids, so priorRefunds
  // was ALWAYS empty, alreadyRefunded was always 0, and the 409 below could never fire. Harmless
  // only while the insert itself failed; the moment §1 makes refunds work, this is the ONLY thing
  // between a double-click and a double refund — and because the stock restore below runs AFTER the
  // insert, it is also the only thing preventing double-restocking. Shipped in the same commit as
  // the write for exactly that reason.
  const { data: priorRefunds } = await supabase.from('pos_sales').select('total_amount').eq('parent_sale_id', id).eq('status', 'refunded')
  let alreadyRefunded = 0
  for (const r of priorRefunds ?? []) alreadyRefunded += Math.abs(Number(r.total_amount) || 0)
  const refundAmount = amount ?? original.total_amount
  if (alreadyRefunded + Math.abs(Number(refundAmount) || 0) > Math.abs(Number(original.total_amount) || 0) + 0.01) {
    return NextResponse.json({ error: 'This sale has already been refunded up to its total — no further refund allowed' }, { status: 409 })
  }
  // BUGFIX-POS-4 FIX 5 — error-check the refund sale insert; a swallowed error previously returned ok:true with
  // a null refund_sale_id (looked successful while no refund was recorded).
  const { data: refundSale, error: refundErr } = await supabase.from('pos_sales').insert({
    business_id: bid,
    parent_sale_id: id,
    total_amount: -(Math.abs(refundAmount)),
    payment_method: original.payment_method,
    // FIX-REFUND-STATUS-1 — was 'refund'. pos_sales_status_check permits
    // pending|draft|open|partial_paid|completed|voided|refunded — NOT 'refund' — so this insert
    // violated the constraint and the route returned 500 'Refund could not be recorded' every time.
    // Refunds have never been recordable through this path: zero 'refund' rows have ever existed.
    status: 'refunded',
    notes: `Refund of sale ${id.slice(-6).toUpperCase()}${reason_note ? ': ' + reason_note : ''}`,
  }).select().single()
  if (refundErr || !refundSale) return NextResponse.json({ error: refundErr?.message ?? 'Refund could not be recorded' }, { status: 500 })

  // Insert refund items if specified
  if (refundItems?.length && refundSale) {
    const { error: refundItemsErr } = await supabase.from('pos_sale_items').insert(
      refundItems.map((it: { product_id: string; product_name: string; quantity: number; unit_price: number }) => ({
        sale_id: refundSale.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: -(Math.abs(it.quantity)),
        unit_price: it.unit_price,
        business_id: bid,
      }))
    )
    if (refundItemsErr) console.error('[pos/sales/refund] refund items insert failed:', refundItemsErr.message) // BUGFIX-POS-4 FIX 5
    // Restore stock for refunded items — CANONICAL items_on_hand (+ stock_quantity cache). (INV-DECREMENT-FIX phase 2)
    const refundOutletId = await resolveOutletId(supabase, bid, (original as { outlet_id?: string | null }).outlet_id ?? null)
    const refundMovementLines: SaleMovementLine[] = []
    for (const it of refundItems) {
      // SECURITY-P5 Tier 2 — supabaseAdmin (not the caller's session role) keeps this RPC callable
      // after EXECUTE is revoked from anon/authenticated at the DB level.
      await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_products', p_id: it.product_id, p_column: 'stock_quantity', p_amount: Math.abs(it.quantity) }) // cache
      const itemsOnHand = await adjustOutletStock(supabase, { businessId: bid, outletId: refundOutletId, productId: it.product_id, delta: Math.abs(Number(it.quantity)) }) // canonical
      refundMovementLines.push({ itemId: it.product_id, quantitySold: Math.abs(Number(it.quantity)), newStock: itemsOnHand })
    }
    await recordSaleMovements(supabase, {
      businessId: bid, saleId: refundSale.id, saleNumber: (refundSale as { sale_number?: string | null }).sale_number ?? null,
      lines: refundMovementLines, movementType: REFUND_MOVEMENT_TYPE, outletId: refundOutletId, writtenBy: 'pos/sales/[id]/refund',
    })
  }

  const { error: auditErr } = await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'refund', reason_code: reason_code ?? 'customer_request',
    reason_note, amount: refundAmount, sale_id: id,
    performed_by: user.id, manager_approved_by: managerId,
  })
  if (auditErr) console.error('[pos/sales/refund] audit log insert failed:', auditErr.message) // BUGFIX-POS-4 FIX 5

  return NextResponse.json({ ok: true, refund_sale_id: refundSale?.id })
}

export const POST = withErrorCapture('pos/sales/[id]/refund', _POST)