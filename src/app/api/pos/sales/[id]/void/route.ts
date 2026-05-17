export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyManagerToken } from '@/lib/pos/manager-token'
import { withErrorCapture } from '@/lib/api/with-error-capture'

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

  await supabase.from('pos_sales').update({ status: 'voided', last_edited_at: new Date().toISOString() }).eq('id', id)

  // Restore stock for all items
  const { data: items } = await supabase.from('pos_sale_items').select('product_id, quantity').eq('sale_id', id)
  for (const item of items ?? []) {
    if (!item.product_id) continue
    const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', item.product_id).maybeSingle()
    if (prod) await supabase.from('pos_products').update({ stock_quantity: (prod.stock_quantity || 0) + item.quantity }).eq('id', item.product_id)
  }

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'void', reason_code: reason_code ?? 'other',
    reason_note, amount: sale.total_amount, sale_id: id,
    performed_by: user.id, manager_approved_by: managerId,
  })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/sales/[id]/void', _POST)