export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// AU Fair Work penalty multipliers (General Retail Industry Award + Hospitality Award)
const AU_AWARD_RATES = {
  retail: {
    name: 'General Retail Industry Award 2020',
    levels: [
      { level: 'Level 1', base_hourly: 23.23 },
      { level: 'Level 2', base_hourly: 24.45 },
      { level: 'Level 3', base_hourly: 25.80 },
      { level: 'Level 4', base_hourly: 27.32 },
    ],
    multipliers: { weekday: 1.0, saturday: 1.25, sunday: 1.50, public_holiday: 2.25, overtime_1: 1.50, overtime_2: 2.0 },
  },
  hospitality: {
    name: 'Hospitality Industry (General) Award 2020',
    levels: [
      { level: 'Food & Bev Grade 1', base_hourly: 23.23 },
      { level: 'Food & Bev Grade 2', base_hourly: 24.45 },
      { level: 'Cook Grade 1', base_hourly: 25.80 },
      { level: 'Cook Grade 2', base_hourly: 27.32 },
    ],
    multipliers: { weekday: 1.0, saturday: 1.25, sunday: 1.75, public_holiday: 2.25, overtime_1: 1.50, overtime_2: 2.0 },
  },
}

// AU public holidays 2025-2026 (national + VIC)
const PUBLIC_HOLIDAYS = [
  '2025-12-25','2025-12-26','2026-01-01','2026-01-26','2026-03-09',
  '2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-25',
  '2026-06-01','2026-11-03','2026-12-25','2026-12-26',
]

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    shifts: Array<{ date: string; start_time: string; end_time: string; break_minutes?: number }>
    base_hourly: number
    award_type?: 'retail' | 'hospitality'
  }

  const award = AU_AWARD_RATES[body.award_type ?? 'retail']
  const results = body.shifts.map(shift => {
    const date = new Date(shift.date)
    const dow = date.getDay() // 0=Sun, 6=Sat
    const isPublicHoliday = PUBLIC_HOLIDAYS.includes(shift.date)
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [eh, em] = shift.end_time.split(':').map(Number)
    const totalMins = (eh * 60 + em) - (sh * 60 + sm) - (shift.break_minutes ?? 0)
    const hours = Math.max(0, totalMins / 60)

    let multiplier = award.multipliers.weekday
    let dayType = 'Weekday'
    if (isPublicHoliday) { multiplier = award.multipliers.public_holiday; dayType = 'Public holiday' }
    else if (dow === 0) { multiplier = award.multipliers.sunday; dayType = 'Sunday' }
    else if (dow === 6) { multiplier = award.multipliers.saturday; dayType = 'Saturday' }

    // Overtime: first 2h at 1.5x, then 2x (simplified — weekdays only)
    let base = body.base_hourly
    let regularHours = hours
    let overtimeCost = 0
    if (!isPublicHoliday && dow >= 1 && dow <= 5 && hours > 8) {
      const ot1 = Math.min(hours - 8, 2)
      const ot2 = Math.max(hours - 10, 0)
      regularHours = 8
      overtimeCost = (ot1 * base * award.multipliers.overtime_1) + (ot2 * base * award.multipliers.overtime_2)
    }

    const gross = (regularHours * base * multiplier) + overtimeCost
    const super_ = gross * 0.115 // 11.5% AU super
    const tax = gross * 0.19 // simplified PAYG estimate

    return {
      date: shift.date,
      day_type: dayType,
      hours: Math.round(hours * 100) / 100,
      multiplier,
      base_hourly: base,
      gross: Math.round(gross * 100) / 100,
      super: Math.round(super_ * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      net: Math.round((gross - tax) * 100) / 100,
    }
  })

  const totals = results.reduce((acc, r) => ({
    hours: acc.hours + r.hours,
    gross: acc.gross + r.gross,
    super: acc.super + r.super,
    tax: acc.tax + r.tax,
    net: acc.net + r.net,
  }), { hours:0, gross:0, super:0, tax:0, net:0 })

  return NextResponse.json({ shifts: results, totals, award: award.name })
}

export async function GET(_req: Request) {
  return NextResponse.json({ awards: AU_AWARD_RATES })
}

export const POST = withErrorCapture('staff/award-rates', _POST)
