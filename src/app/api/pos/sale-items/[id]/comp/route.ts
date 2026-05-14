export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyManagerToken } from '@/app/api/pos/manager-verify/route'
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
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // Verify item belongs to this business via its sale
  const { data: item } = await supabase
    .from('pos_sale_items').select('*, pos_sales!inner(business_id, total_amount)')
    .eq('id', id).maybeSingle()
  if (!item || (item.pos_sales as any)?.business_id !== bid) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const itemValue = Number(item.unit_price ?? 0) * Number(item.quantity ?? 1)

  await supabase.from('pos_sale_items').update({ unit_price: 0, line_total: 0 }).eq('id', id)

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'comp', reason_code: reason_code ?? 'quality',
    reason_note, amount: itemValue, item_id: id,
    sale_id: item.sale_id, performed_by: user.id, manager_approved_by: managerId,
  })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/sale-items/[id]/comp', _POST)