export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { target_sale_id } = await req.json()
  if (!target_sale_id) return NextResponse.json({ error: 'target_sale_id required' }, { status: 400 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: item } = await supabase
    .from('pos_sale_items').select('*, pos_sales!inner(business_id)')
    .eq('id', id).maybeSingle()
  if (!item || (item.pos_sales as any)?.business_id !== bid) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const { data: targetSale } = await supabase
    .from('pos_sales').select('id').eq('id', target_sale_id).eq('business_id', bid).maybeSingle()
  if (!targetSale) return NextResponse.json({ error: 'Target sale not found' }, { status: 404 })

  await supabase.from('pos_sale_items').update({ sale_id: target_sale_id }).eq('id', id)

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'move', item_id: id,
    sale_id: item.sale_id, performed_by: user.id,
    reason_note: `Moved to sale ${target_sale_id.slice(-6).toUpperCase()}`,
  })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/sale-items/[id]/move', _POST)