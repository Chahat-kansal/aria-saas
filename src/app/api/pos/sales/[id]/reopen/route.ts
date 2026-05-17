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

  const { manager_token, reason_note } = await req.json()
  const managerId = manager_token ? verifyManagerToken(manager_token) : null
  if (!managerId) return NextResponse.json({ error: 'Valid manager PIN required' }, { status: 403 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: sale } = await supabase.from('pos_sales').select('id, status, total_amount').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  await supabase.from('pos_sales').update({ status: 'open', last_edited_at: new Date().toISOString(), last_edited_by: managerId }).eq('id', id)

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'reopen', reason_note, amount: sale.total_amount,
    sale_id: id, performed_by: user.id, manager_approved_by: managerId,
  })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/sales/[id]/reopen', _POST)