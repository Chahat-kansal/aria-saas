export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sm } = await supabase.from('staff_members')
    .select('id,business_id').eq('user_id', user.id).maybeSingle()
  if (!sm) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    swap_with_staff_id?: string; shift_date?: string; notes?: string
  }
  const shiftDate = body.shift_date ? String(body.shift_date) : null
  if (!shiftDate) return NextResponse.json({ error: 'shift_date required' }, { status: 400 })

  const { data, error } = await supabase.from('staff_leave').insert({
    business_id: String(sm.business_id),
    staff_id: String(sm.id),
    leave_type: 'swap',
    start_date: shiftDate,
    end_date: shiftDate,
    days_taken: 0,
    swap_with_staff_id: body.swap_with_staff_id ? String(body.swap_with_staff_id) : null,
    swap_shift_date: shiftDate,
    swap_type: 'swap',
    status: 'pending',
    notes: body.notes ? String(body.notes) : null,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 201 })
}

export const POST = withErrorCapture('staff/swap', _POST)
