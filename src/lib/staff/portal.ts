import { createServerSupabaseClient } from '@/lib/supabase-server'

export interface PortalIdentity {
  staff_member_id: string
  business_id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  position: string
  employment_type: string
  color: string
  pay_type: string
  portal_enabled: boolean
}

export async function resolvePortalIdentity(): Promise<PortalIdentity | null> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: sm } = await supabase.from('staff_members')
    .select('id,business_id,first_name,last_name,preferred_name,position,employment_type,color,pay_type,portal_enabled')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!sm || !sm.portal_enabled) return null

  return {
    staff_member_id: String(sm.id),
    business_id: String(sm.business_id),
    first_name: String(sm.first_name),
    last_name: String(sm.last_name),
    preferred_name: sm.preferred_name ? String(sm.preferred_name) : null,
    position: String(sm.position ?? ''),
    employment_type: String(sm.employment_type ?? 'casual'),
    color: String(sm.color ?? '#6366f1'),
    pay_type: String((sm as Record<string,unknown>).pay_type ?? 'hourly'),
    portal_enabled: Boolean(sm.portal_enabled),
  }
}

export async function getOwnShifts(
  staffMemberId: string,
  businessId: string,
  weeksAhead = 4,
): Promise<Array<{
  week_start: string
  start_time: string
  end_time: string
  hours: number
  role: string | null
  area_name: string | null
  confirmed_by_staff: boolean
  shift_id: string
}>> {
  const supabase = createServerSupabaseClient()
  const today = new Date().toISOString().slice(0, 10)
  const futureEnd = new Date(Date.now() + weeksAhead * 7 * 86400_000).toISOString().slice(0, 10)

  const { data: rosters } = await supabase.from('pos_rosters')
    .select('week_start,shifts')
    .eq('business_id', businessId)
    .eq('published', true)
    .gte('week_start', today)
    .lte('week_start', futureEnd)
    .order('week_start')

  const myShifts: Array<{
    week_start: string; start_time: string; end_time: string; hours: number
    role: string | null; area_name: string | null; confirmed_by_staff: boolean; shift_id: string
  }> = []

  for (const roster of rosters ?? []) {
    const shifts = Array.isArray(roster.shifts) ? roster.shifts : []
    for (const s of shifts as Array<Record<string, unknown>>) {
      if (String(s.staff_member_id) === staffMemberId) {
        myShifts.push({
          week_start: String(roster.week_start),
          start_time: String(s.start_time),
          end_time: String(s.end_time),
          hours: Number(s.hours) || 0,
          role: s.role ? String(s.role) : null,
          area_name: s.area_name ? String(s.area_name) : null,
          confirmed_by_staff: Boolean(s.confirmed_by_staff),
          shift_id: String(s.id),
        })
      }
    }
  }

  return myShifts.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
}

export async function getOwnLeaveBalances(staffMemberId: string): Promise<Array<{
  leave_type: string; accrued_days: number; taken_days: number; remaining_days: number
}>> {
  const supabase = createServerSupabaseClient()
  const year = new Date().getFullYear()

  const { data } = await supabase.from('staff_leave_balances')
    .select('leave_type,opening_balance_days,accrued_days,taken_days,adjusted_days')
    .eq('staff_member_id', staffMemberId)
    .eq('year', year)

  return (data ?? []).map((b: Record<string, unknown>) => {
    const accrued = (Number(b.opening_balance_days) || 0) + (Number(b.accrued_days) || 0) + (Number(b.adjusted_days) || 0)
    const taken = Number(b.taken_days) || 0
    return {
      leave_type: String(b.leave_type),
      accrued_days: +accrued.toFixed(1),
      taken_days: +taken.toFixed(1),
      remaining_days: +Math.max(0, accrued - taken).toFixed(1),
    }
  })
}
