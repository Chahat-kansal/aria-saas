export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: leave } = await supabase.from('staff_leave')
    .select('*').eq('id', params.id).eq('business_id', bid).maybeSingle()
  if (!leave) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { status?: string }
  const newStatus = String(body.status ?? '')
  if (!['approved', 'declined', 'cancelled'].includes(newStatus)) {
    return NextResponse.json({ error: 'status must be approved, declined, or cancelled' }, { status: 400 })
  }

  await supabase.from('staff_leave').update({ status: newStatus }).eq('id', params.id)

  // On approval: update leave balance
  if (newStatus === 'approved' && leave.staff_id && leave.days_taken) {
    const year = new Date(String(leave.start_date)).getFullYear()
    const { data: bal } = await supabase.from('staff_leave_balances')
      .select('id,taken_days').eq('staff_member_id', String(leave.staff_id))
      .eq('year', year).eq('leave_type', String(leave.leave_type)).maybeSingle()

    if (bal) {
      await supabase.from('staff_leave_balances').update({
        taken_days: (Number(bal.taken_days) || 0) + (Number(leave.days_taken) || 0),
      }).eq('id', String(bal.id))
    } else {
      await supabase.from('staff_leave_balances').insert({
        business_id: bid,
        staff_member_id: String(leave.staff_id),
        year,
        leave_type: String(leave.leave_type),
        opening_balance_days: 0,
        accrued_days: 20,
        taken_days: Number(leave.days_taken) || 0,
        adjusted_days: 0,
      })
    }
  }

  return NextResponse.json({ ok: true, status: newStatus })
}

export const PATCH = withErrorCapture('staff/leave/[id]', _PATCH)
