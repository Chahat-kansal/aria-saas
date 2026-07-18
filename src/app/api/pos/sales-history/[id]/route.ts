export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { reverseEarnOnSale } from '@/lib/loyalty/reverseEarnOnSale'

type Params = { params: { id: string } }

async function _GET(_req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = params
  const { data: sale } = await supabase.from('pos_sales').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [items, payments, edits, returns] = await Promise.all([
    supabase.from('pos_sale_items').select('*').eq('sale_id', id).order('created_at'),
    supabase.from('pos_sale_payments').select('*').eq('sale_id', id),
    supabase.from('pos_sale_edits').select('*').eq('sale_id', id).order('edited_at', { ascending: false }),
    supabase.from('pos_sale_returns').select('*').eq('original_sale_id', id),
  ])

  return NextResponse.json({
    sale,
    items: items.data ?? [],
    payments: payments.data ?? [],
    edits: edits.data ?? [],
    returns: returns.data ?? [],
  })
}

async function _PATCH(req: Request, { params }: Params, { supabase, userId, businessId: bid }: BusinessContext) {
  const { id } = params
  const { data: posUser } = await supabase.from('pos_users').select('id, role, permissions').eq('business_id', bid).eq('auth_user_id', userId).maybeSingle()
  const canEdit = !!(posUser?.permissions as Record<string, unknown> | null)?.can_reopen_sale
    || ['manager', 'admin', 'owner'].includes(posUser?.role ?? '')
  if (!canEdit) {
    const { data: ownsBiz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).maybeSingle()
    if (!ownsBiz) return NextResponse.json({ error: 'Permission denied: manager role or can_reopen_sale required' }, { status: 403 })
  }

  const body = await req.json()
  const { field_changed, new_value, reason } = body
  if (!field_changed || reason == null) return NextResponse.json({ error: 'field_changed and reason required' }, { status: 400 })

  const EDITABLE = new Set(['notes', 'internal_comment', 'external_notes', 'customer_id', 'customer_name', 'customer_phone'])
  if (!EDITABLE.has(field_changed)) {
    return NextResponse.json({ error: `Field "${field_changed}" is not editable on a completed sale` }, { status: 400 })
  }

  const { data: sale } = await supabase.from('pos_sales').select('id, business_id, status').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  const { data: oldRow } = await supabase.from('pos_sales').select(field_changed).eq('id', id).maybeSingle()
  const oldValue = (oldRow as Record<string, unknown> | null)?.[field_changed]

  const { error: updateErr } = await supabase.from('pos_sales').update({
    [field_changed]: new_value,
    last_edited_at: new Date().toISOString(),
    last_edited_by: userId,
  }).eq('id', id).eq('business_id', bid)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await supabase.from('pos_sale_edits').insert({
    sale_id: id,
    business_id: bid,
    edited_by: userId,
    action: 'field_edit',
    field_changed,
    old_value: String(oldValue ?? ''),
    new_value: String(new_value ?? ''),
    reason: String(reason).slice(0, 500),
  })

  return NextResponse.json({ ok: true })
}

async function _DELETE(req: Request, { params }: Params, { supabase, userId, businessId: bid }: BusinessContext) {
  const { id } = params
  const { data: posUser } = await supabase.from('pos_users').select('id, role, permissions').eq('business_id', bid).eq('auth_user_id', userId).maybeSingle()
  const canVoid = !!(posUser?.permissions as Record<string, unknown> | null)?.can_void
    || ['manager', 'admin', 'owner'].includes(posUser?.role ?? '')
  if (!canVoid) {
    const { data: ownsBiz } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).maybeSingle()
    if (!ownsBiz) return NextResponse.json({ error: 'Permission denied: can_void required' }, { status: 403 })
  }

  const body = await req.json()
  const reason = String(body.reason ?? '').slice(0, 500)
  if (!reason) return NextResponse.json({ error: 'Void reason required' }, { status: 400 })

  const { data: sale } = await supabase.from('pos_sales').select('id, business_id, status, total_amount').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sale.status === 'voided') return NextResponse.json({ error: 'Already voided' }, { status: 400 })

  await supabase.from('pos_sales').update({
    status: 'voided',
    last_edited_at: new Date().toISOString(),
    last_edited_by: userId,
  }).eq('id', id).eq('business_id', bid)

  // LOYALTY-FINISH — reverse any loyalty points earned on this sale. Never
  // blocks the void itself; a reversal failure is logged, not fatal.
  try {
    await reverseEarnOnSale({ businessId: bid, saleId: id, totalAmount: Number(sale.total_amount ?? 0) })
  } catch (e) { console.error('[pos/sales-history void] loyalty reversal failed:', (e as Error).message) }

  await supabase.from('pos_sale_edits').insert({
    sale_id: id,
    business_id: bid,
    edited_by: userId,
    action: 'void',
    field_changed: 'status',
    old_value: sale.status,
    new_value: 'voided',
    reason,
  })

  try {
    const { ariaObserve } = await import('@/lib/aria/brain')
    await ariaObserve({
      business_id: bid,
      category: 'sales',
      event_type: 'sale_void',
      data: { sale_id: id, reason, voided_by_role: posUser?.role ?? 'owner' },
      triggered_by: userId,
    })
  } catch (e) { console.error('[non-fatal]', e) }

  return NextResponse.json({ ok: true })
}

export const GET = withBusinessContext('pos/sales-history/[id]', _GET)
export const PATCH = withBusinessContext('pos/sales-history/[id]', _PATCH)
export const DELETE = withBusinessContext('pos/sales-history/[id]', _DELETE)
