import { resolveHourlyRateCents } from './pay-rates'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export interface ShiftEntry {
  id: string
  staff_member_id: string
  staff_name: string
  staff_color: string
  outlet_id: string | null
  area_id: string | null
  area_name: string | null
  role: string | null
  start_time: string
  end_time: string
  break_minutes: number
  hours: number
  cost_cents: number
  notes: string | null
  ai_generated: boolean
  confirmed_by_staff: boolean
  status: 'scheduled' | 'published'
}

export interface RosterSummary {
  total_hours: number
  total_cost_cents: number
  by_day: Record<string, { hours: number; cost_cents: number; shift_count: number }>
  by_staff: Record<string, { hours: number; cost_cents: number; name: string }>
  conflicts: Array<{ staff_name: string; shift1: string; shift2: string }>
}

export function computeShiftHours(startIso: string, endIso: string, breakMinutes: number): number {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime()
  const totalMinutes = diffMs / 60_000 - (Number(breakMinutes) || 0)
  return Math.max(0, +(totalMinutes / 60).toFixed(2))
}

export function summariseRoster(shifts: ShiftEntry[]): RosterSummary {
  const byDay: Record<string, { hours: number; cost_cents: number; shift_count: number }> = {}
  const byStaff: Record<string, { hours: number; cost_cents: number; name: string }> = {}
  const byStaffShifts: Record<string, ShiftEntry[]> = {}
  const conflicts: Array<{ staff_name: string; shift1: string; shift2: string }> = []

  for (const s of shifts) {
    const day = s.start_time.slice(0, 10)
    if (!byDay[day]) byDay[day] = { hours: 0, cost_cents: 0, shift_count: 0 }
    byDay[day].hours += s.hours
    byDay[day].cost_cents += s.cost_cents
    byDay[day].shift_count++
    if (!byStaff[s.staff_member_id]) byStaff[s.staff_member_id] = { hours: 0, cost_cents: 0, name: s.staff_name }
    byStaff[s.staff_member_id].hours += s.hours
    byStaff[s.staff_member_id].cost_cents += s.cost_cents
    if (!byStaffShifts[s.staff_member_id]) byStaffShifts[s.staff_member_id] = []
    byStaffShifts[s.staff_member_id].push(s)
  }

  for (const staffShifts of Object.values(byStaffShifts)) {
    const sorted = [...staffShifts].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1]
      if (new Date(a.end_time) > new Date(b.start_time)) {
        conflicts.push({
          staff_name: a.staff_name,
          shift1: `${a.start_time.slice(11, 16)}–${a.end_time.slice(11, 16)} ${a.start_time.slice(0, 10)}`,
          shift2: `${b.start_time.slice(11, 16)}–${b.end_time.slice(11, 16)} ${b.start_time.slice(0, 10)}`,
        })
      }
    }
  }

  return {
    total_hours: +shifts.reduce((s, x) => s + x.hours, 0).toFixed(2),
    total_cost_cents: shifts.reduce((s, x) => s + x.cost_cents, 0),
    by_day: byDay,
    by_staff: byStaff,
    conflicts,
  }
}

export async function hydrateShiftCosts(
  shifts: Omit<ShiftEntry, 'cost_cents'>[],
  businessId: string,
): Promise<ShiftEntry[]> {
  const result: ShiftEntry[] = []
  for (const s of shifts) {
    const hours = computeShiftHours(s.start_time, s.end_time, s.break_minutes)
    const startDate = new Date(s.start_time)
    const rateCents = await resolveHourlyRateCents(businessId, s.staff_member_id, startDate, s.start_time.slice(11, 16))
    result.push({ ...s, hours, cost_cents: Math.round(hours * rateCents) })
  }
  return result
}

export async function getActiveStaff(businessId: string) {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase.from('staff_members')
    .select('id,first_name,last_name,preferred_name,position,employment_type,status,color,pay_rate_cents,staff_member_skills(skill_id,staff_skills(name,color))')
    .eq('business_id', businessId).eq('status', 'active').order('first_name')
  return data ?? []
}
