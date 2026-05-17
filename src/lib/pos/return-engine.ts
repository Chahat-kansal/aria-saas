import { SupabaseClient } from '@supabase/supabase-js'

export const REASON_CODES = [
  'changed_mind','faulty_defective','wrong_item','damaged_in_transit',
  'not_as_described','expired','duplicate_purchase','other',
] as const
export type ReasonCode = typeof REASON_CODES[number]

export const REASON_LABELS: Record<ReasonCode, string> = {
  changed_mind: 'Changed mind',
  faulty_defective: 'Faulty / defective',
  wrong_item: 'Wrong item sent',
  damaged_in_transit: 'Damaged in transit',
  not_as_described: 'Not as described',
  expired: 'Expired / out of date',
  duplicate_purchase: 'Duplicate purchase',
  other: 'Other',
}

export const REFUND_METHODS = ['original_payment','store_credit','cash','card','exchange'] as const
export type RefundMethod = typeof REFUND_METHODS[number]

export const CONDITIONS = ['new','good','damaged','quarantine','dispose'] as const
export type Condition = typeof CONDITIONS[number]

export const CONDITION_RESTOCKS: Record<Condition, boolean> = {
  new: true, good: true, damaged: false, quarantine: false, dispose: false,
}

export interface ReturnLineInput {
  original_item_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  condition: Condition
  restock: boolean
}

export interface ProcessReturnInput {
  business_id: string
  original_sale_id: string
  performed_by_user_id: string
  pos_user_id: string | null
  manager_approved_by: string | null
  reason_code: ReasonCode
  reason_note: string | null
  refund_method: RefundMethod
  lines: ReturnLineInput[]
  customer_id: string | null
  exchange_cart?: { product_id: string; product_name: string; qty: number; unit_price: number }[]
}

export interface ProcessReturnResult {
  return_id: string
  return_number: string
  total_refund: number
  refund_method: RefundMethod
  store_credit_id: string | null
  store_credit_code: string | null
  exchange_sale_id: string | null
  return_sale_id: string | null
}

function generateCreditCode(): string {
  return 'SC-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

function generateReturnNumber(count: number): string {
  return 'RET-' + String(count + 1).padStart(4, '0')
}

export async function processReturn(
  supabase: SupabaseClient,
  input: ProcessReturnInput,
): Promise<{ ok: true; result: ProcessReturnResult } | { ok: false; error: string }> {
  const { business_id, original_sale_id, lines, refund_method, reason_code, reason_note,
    customer_id, pos_user_id, manager_approved_by, performed_by_user_id, exchange_cart } = input

  // 1. Validate original sale
  const { data: origSale } = await supabase
    .from('pos_sales').select('id, total_amount, payment_method, status, outlet_id')
    .eq('id', original_sale_id).eq('business_id', business_id).maybeSingle()
  if (!origSale) return { ok: false, error: 'Original sale not found' }
  if (origSale.status === 'voided') return { ok: false, error: 'Cannot return a voided sale' }

  // 2. Validate returned_quantity guard per line
  for (const line of lines) {
    const { data: item } = await supabase
      .from('pos_sale_items')
      .select('quantity, returned_quantity')
      .eq('id', line.original_item_id).maybeSingle()
    if (!item) return { ok: false, error: `Item ${line.original_item_id} not found` }
    const available = (Number(item.quantity) || 0) - (Number(item.returned_quantity) || 0)
    if (line.quantity > available) {
      return { ok: false, error: `${line.product_name}: only ${available} unit(s) available to return` }
    }
  }

  // 3. Calculate total refund
  const totalRefund = lines.reduce((s, l) => s + (Number(l.unit_price) || 0) * l.quantity, 0)

  // 4. Generate return number
  const { count } = await supabase.from('pos_returns').select('id', { count: 'exact', head: true }).eq('business_id', business_id)
  const returnNumber = generateReturnNumber(count ?? 0)

  let storeCreditId: string | null = null
  let storeCreditCode: string | null = null
  let exchangeSaleId: string | null = null
  let returnSaleId: string | null = null

  // 5. Create return sale (negative) for non-exchange refund methods
  if (refund_method !== 'exchange') {
    const payMethod =
      refund_method === 'store_credit' ? 'other' :
      refund_method === 'original_payment' ? (origSale.payment_method ?? 'card') :
      refund_method
    const { data: returnSale } = await supabase.from('pos_sales').insert({
      business_id,
      original_sale_id,
      sale_number: returnNumber,
      payment_method: payMethod,
      total_amount: -(Math.abs(totalRefund)),
      subtotal: -(Math.abs(totalRefund)),
      tax_amount: -((Math.abs(totalRefund)) - (Math.abs(totalRefund)) / 1.1),
      discount_amount: 0,
      status: 'refunded',
      customer_id: customer_id ?? null,
      notes: `Return ${returnNumber}: ${REASON_LABELS[reason_code]}${reason_note ? ' — ' + reason_note : ''}`,
      pos_user_id: pos_user_id ?? null,
    }).select('id').single()
    returnSaleId = returnSale?.id ?? null

    if (returnSaleId) {
      await supabase.from('pos_sale_items').insert(
        lines.map(l => ({
          sale_id: returnSaleId,
          product_id: l.product_id,
          product_name: l.product_name,
          quantity: -l.quantity,
          unit_price: l.unit_price,
          line_total: -((Number(l.unit_price) || 0) * l.quantity),
          business_id,
        }))
      )
    }
  }

  // 6. Store credit issuance
  if (refund_method === 'store_credit') {
    const code = generateCreditCode()
    const { data: credit } = await supabase.from('pos_store_credits').insert({
      business_id,
      customer_id: customer_id ?? null,
      code,
      initial_amount: totalRefund,
      balance: totalRefund,
      reason: `Return ${returnNumber}: ${REASON_LABELS[reason_code]}`,
      issued_by_sale_id: returnSaleId,
    }).select('id').single()
    storeCreditId = credit?.id ?? null
    storeCreditCode = code
    if (storeCreditId) {
      await supabase.from('pos_store_credit_txns').insert({
        business_id, credit_id: storeCreditId,
        sale_id: returnSaleId,
        amount: totalRefund,
        type: 'issue',
        balance_after: totalRefund,
        note: `Issued for return ${returnNumber}`,
      })
    }
  }

  // 7. Exchange flow
  if (refund_method === 'exchange' && exchange_cart?.length) {
    const exchangeTotal = exchange_cart.reduce((s, i) => s + (Number(i.unit_price) || 0) * i.qty, 0)
    const netDifference = exchangeTotal - totalRefund
    const { data: exSale } = await supabase.from('pos_sales').insert({
      business_id,
      original_sale_id,
      sale_number: returnNumber + '-EX',
      payment_method: netDifference > 0 ? (origSale.payment_method ?? 'card') : 'other',
      total_amount: netDifference,
      subtotal: netDifference,
      tax_amount: 0,
      discount_amount: 0,
      status: 'completed',
      customer_id: customer_id ?? null,
      notes: `Exchange for ${returnNumber}`,
      pos_user_id: pos_user_id ?? null,
    }).select('id').single()
    exchangeSaleId = exSale?.id ?? null

    if (exchangeSaleId) {
      await supabase.from('pos_sale_items').insert(
        exchange_cart.map(i => ({
          sale_id: exchangeSaleId,
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.qty,
          unit_price: i.unit_price,
          line_total: (Number(i.unit_price) || 0) * i.qty,
          business_id,
        }))
      )
    }
  }

  // 8. Insert pos_returns record
  const { data: returnRecord } = await supabase.from('pos_returns').insert({
    business_id,
    original_sale_id,
    return_sale_id: returnSaleId,
    return_number: returnNumber,
    reason_code,
    reason_note,
    refund_method,
    total_refund: totalRefund,
    store_credit_id: storeCreditId,
    exchange_sale_id: exchangeSaleId,
    processed_by: pos_user_id,
    manager_approved_by,
    status: 'completed',
  }).select('id').single()

  // 9. Insert pos_return_lines
  if (returnRecord) {
    await supabase.from('pos_return_lines').insert(
      lines.map(l => ({
        return_id: returnRecord.id,
        original_item_id: l.original_item_id,
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_refund: (Number(l.unit_price) || 0) * l.quantity,
        condition: l.condition,
        restock: l.restock && CONDITION_RESTOCKS[l.condition],
      }))
    )
  }

  // 10. Increment returned_quantity on each original sale item (raw select+update — no RPC)
  for (const line of lines) {
    const { data: cur } = await supabase.from('pos_sale_items')
      .select('returned_quantity').eq('id', line.original_item_id).maybeSingle()
    const newQty = (Number(cur?.returned_quantity) || 0) + line.quantity
    await supabase.from('pos_sale_items')
      .update({ returned_quantity: newQty })
      .eq('id', line.original_item_id)
  }

  // 11. Restore inventory via existing RPC
  for (const line of lines) {
    if (!line.product_id) continue
    if (!line.restock || !CONDITION_RESTOCKS[line.condition]) continue
    const { data: prod } = await supabase.from('pos_products')
      .select('track_stock').eq('id', line.product_id).maybeSingle()
    if (!prod?.track_stock) continue
    try {
      await supabase.rpc('reverse_outlet_inventory', {
        p_product_id: line.product_id,
        p_outlet_id: origSale.outlet_id ?? null,
        p_quantity: line.quantity,
        p_business_id: business_id,
        p_reason: `return:${returnNumber}`,
      })
    } catch { /* non-fatal */ }
  }

  // 12. Audit log (Sprint-B-aware — falls back to direct insert if check-permission not yet shipped)
  try {
    const helper = await import('@/lib/pos/check-permission').catch(() => null) as any
    if (helper?.writeAuditLog) {
      await helper.writeAuditLog(supabase, {
        business_id,
        action: 'return',
        pos_user_id: pos_user_id ?? null,
        performed_by: performed_by_user_id,
        manager_approved_by: manager_approved_by ?? null,
        sale_id: original_sale_id,
        amount: totalRefund,
        reason_code,
        reason_note,
        metadata: { return_number: returnNumber, refund_method, lines: lines.length },
      })
    } else {
      await supabase.from('pos_audit_log').insert({
        business_id,
        action: 'return',
        sale_id: original_sale_id,
        performed_by: performed_by_user_id,
        manager_approved_by,
        amount: totalRefund,
        reason_code,
        reason_note,
      })
    }
  } catch { /* non-fatal */ }

  return {
    ok: true,
    result: {
      return_id: returnRecord?.id ?? '',
      return_number: returnNumber,
      total_refund: totalRefund,
      refund_method,
      store_credit_id: storeCreditId,
      store_credit_code: storeCreditCode,
      exchange_sale_id: exchangeSaleId,
      return_sale_id: returnSaleId,
    }
  }
}

export async function detectReturnAbuse(
  supabase: SupabaseClient,
  business_id: string,
  customer_id: string | null,
): Promise<{ flag: boolean; reason: string | null }> {
  if (customer_id) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: customerSales } = await supabase
      .from('pos_sales').select('id')
      .eq('business_id', business_id).eq('customer_id', customer_id)
      .gte('created_at', since)
    const saleIds = (customerSales ?? []).map((s: { id: string }) => s.id)
    if (saleIds.length > 0) {
      const { count } = await supabase.from('pos_returns')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .in('original_sale_id', saleIds)
      if ((count ?? 0) >= 3) {
        return { flag: true, reason: `Customer has ${count} returns in 30 days` }
      }
    }
  }
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [{ count: salesCount }, { count: returnsCount }] = await Promise.all([
    supabase.from('pos_sales').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).gte('created_at', weekAgo)
      .not('status', 'in', '("voided","refunded")'),
    supabase.from('pos_returns').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).gte('created_at', weekAgo),
  ])
  const rate = (salesCount ?? 0) > 0 ? ((returnsCount ?? 0) / (salesCount as number)) * 100 : 0
  if (rate > 10 && (returnsCount ?? 0) >= 3) {
    return { flag: true, reason: `Return rate ${rate.toFixed(1)}% this week (${returnsCount}/${salesCount})` }
  }
  return { flag: false, reason: null }
}