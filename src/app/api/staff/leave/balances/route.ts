export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = new URL(req.url).searchParams.get('business_id')
  if (!bid) return NextResponse.json({ balances: [] })

  const year = new Date().getFullYear()

  // Auto-create balances for staff who don't have them yet
  const { data: members } = await supabaseAdmin
    .from('staff_members')
    .select('id, first_name, last_name, employment_type')
    .eq('business_id', bid)
    .eq('status', 'active')

  const { data: existing } = await supabaseAdmin
    .from('staff_leave_balances')
    .select('staff_member_id, leave_type')
    .eq('business_id', bid)
    .eq('year', year)

  const existingKeys = new Set(
    (existing ?? []).map((b: Record<string, unknown>) => `${b.staff_member_id}:${b.leave_type}`)
  )

  const toCreate: Record<string, unknown>[] = []
  for (const m of (members ?? [])) {
    if (m.employment_type === 'casual') continue
    for (const lt of ['annual', 'sick']) {
      if (!existingKeys.has(`${m.id}:${lt}`)) {
        toCreate.push({
          business_id: bid,
          staff_member_id: m.id,
          year,
          leave_type: lt,
          opening_balance_days: lt === 'annual' ? 20 : 10,
          accrued_days: 0,
          taken_days: 0,
          adjusted_days: 0,
        })
      }
    }
  }

  if (toCreate.length > 0) {
    await supabaseAdmin.from('staff_leave_balances').insert(toCreate).catch(() => {})
  }

  const { data: balances } = await supabaseAdmin
    .from('staff_leave_balances')
    .select('*, staff_members(first_name, last_name)')
    .eq('business_id', bid)
    .eq('year', year)
    .order('leave_type')

  const result = (balances ?? []).map((b: Record<string, unknown>) => {
    const sm = b.staff_members as { first_name: string; last_name: string } | null
    return {
      ...b,
      staff_name: sm ? `${sm.first_name} ${sm.last_name}` : null,
      staff_members: undefined,
    }
  })

  return NextResponse.json({ balances: result })
}

export const GET = withErrorCapture('staff/leave/balances', _GET)
