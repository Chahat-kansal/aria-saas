export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyManagerToken } from '@/app/api/pos/manager-verify/route'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { manager_token, amount, reason_code, reason_note, payment_method } = await req.json()
  const managerId = manager_token ? verifyManagerToken(manager_token) : null
  if (!managerId) return NextResponse.json({ error: 'Valid manager PIN required' }, { status: 403 })
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount required' }, { status: 400 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: refundSale } = await supabase.from('pos_sales').insert({
    business_id: bid,
    total_amount: -(Math.abs(amount)),
    payment_method: payment_method ?? 'cash',
    status: 'refund',
    notes: reason_note ? `Unlinked refund: ${reason_note}` : 'Unlinked refund',
  }).select('id').single()

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'refund', reason_code: reason_code ?? 'other',
    reason_note: `Unlinked refund${reason_note ? ': ' + reason_note : ''}`,
    amount, performed_by: user.id, manager_approved_by: managerId,
  })

  return NextResponse.json({ ok: true, refund_sale_id: refundSale?.id })
}

export const POST = withErrorCapture('pos/refund-unlinked', _POST)