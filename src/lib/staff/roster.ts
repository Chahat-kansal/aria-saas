import { resolveHourlyRateCents } from './pay-rates'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

// AU Fair Work penalty multipliers — General Retail + Hospitality Award 2020
const AU_PUBLIC_HOLIDAYS = new Set([
  '2025-12-25','2025-12-26','2026-01-01','2026-01-26','2026-03-09',
  '2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-25',
  '2026-06-01','2026-11-03','2026-12-25','2026-12-26',
])
const PENALTY_MULTIPLIERS: Record<string, number> = {
  weekday: 1.0,
  saturday: 1.25,
  sunday: 1.50,
  public_holiday: 2.25,
  overtime_1: 1.50, // first 2h overtime
  overtime_2: 2.00, // beyond 10h
}
function getPenaltyMultiplier(startIso: string): number {
  const date = startIso.slice(0, 10)
  if (AU_PUBLIC_HOLIDAYS.has(date)) return PENALTY_MULTIPLIERS.public_holiday
  const dow = new Date(startIso).getDay()
  if (dow === 0) return PENALTY_MULTIPLIERS.sunday
  if (dow === 6) return PENALTY_MULTIPLIERS.saturday
  return PENALTY_MULTIPLIERS.weekday
}
function applyOvertimePenalty(hours: number, baseRateCents: number, multiplier: number): number {
  // Overtime only applies on weekdays (AU Fair Work)
  if (multiplier !== 1.0 || hours <= 8) return Math.round(hours * baseRateCents * multiplier)
  const regularPay = 8 * baseRateCents
  const ot1Hours = Math.min(hours - 8, 2)
  const ot2Hours = Math.max(hours - 10, 0)
  return Math.round(regularPay + ot1Hours * baseRateCents * PENALTY_MULTIPLIERS.overtime_1 + ot2Hours * baseRateCents * PENALTY_MULTIPLIERS.overtime_2)
}

export async function hydrateShiftCosts(
  shifts: Omit<ShiftEntry, 'cost_cents'>[],
  businessId: string,
): Promise<ShiftEntry[]> {
  const result: ShiftEntry[] = []
  for (const s of shifts) {
    const hours = computeShiftHours(s.start_time, s.end_time, s.break_minutes)
    const startDate = new Date(s.start_time)
    const baseRateCents = await resolveHourlyRateCents(businessId, s.staff_member_id, startDate, s.start_time.slice(11, 16))
    const multiplier = getPenaltyMultiplier(s.start_time)
    const cost_cents = applyOvertimePenalty(hours, baseRateCents, multiplier)
    result.push({ ...s, hours, cost_cents })
  }
  return result
}

export async function getActiveStaff(businessId: string) {
  const { data } = await supabaseAdmin.from('staff_members')
    .select('id,first_name,last_name,preferred_name,position,employment_type,status,color,pay_rate_cents,staff_member_skills(skill_id,staff_skills(name,color))')
    .eq('business_id', businessId).eq('status', 'active').order('first_name')
  return data ?? []
}
