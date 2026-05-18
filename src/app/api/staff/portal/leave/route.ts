export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity, getOwnLeaveBalances } from '@/lib/staff/portal'

async function _GET(_req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const [leaveQ, balances] = await Promise.all([
    supabase.from('staff_leave')
      .select('id,leave_type,start_date,end_date,days_taken,status,notes,created_at')
      .eq('staff_id', identity.staff_member_id)
      .order('created_at', { ascending: false }).limit(50),
    getOwnLeaveBalances(identity.staff_member_id),
  ])

  return NextResponse.json({ leave: leaveQ.data ?? [], balances })
}

async function _POST(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    leave_type?: string; start_date?: string; end_date?: string; notes?: string
  }
  const startDate = String(body.start_date ?? '')
  const endDate = String(body.end_date ?? '')
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'start_date and end_date required' }, { status: 400 })
  }

  const leaveType = String(body.leave_type ?? 'annual')
  const notes = body.notes ? String(body.notes).slice(0, 500) : null
  const daysTaken = Math.max(1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400_000) + 1
  )

  // Check balance
  const balances = await getOwnLeaveBalances(identity.staff_member_id)
  const balance = balances.find(b => b.leave_type === leaveType)
  if (balance && balance.remaining_days < daysTaken) {
    return NextResponse.json({
      error: `Insufficient ${leaveType} leave. Available: ${balance.remaining_days}d, requested: ${daysTaken}d.`
    }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.from('staff_leave').insert({
    business_id: identity.business_id,
    staff_id: identity.staff_member_id,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    days_taken: daysTaken,
    status: 'pending',
    notes,
  }).select('id,leave_type,start_date,end_date,days_taken,status').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leave: data }, { status: 201 })
}

export const GET = withErrorCapture('staff/portal/leave', _GET)
export const POST = withErrorCapture('staff/portal/leave', _POST)
