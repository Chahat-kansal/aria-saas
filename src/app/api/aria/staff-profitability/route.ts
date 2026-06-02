export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

interface ShiftRow {
  date: string; staff: string; hours: number
  labour_cost: number; revenue: number; efficiency: number
  status: 'profitable' | 'breakeven' | 'loss'
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const days = Math.min(parseInt(searchParams.get('days') ?? '14', 10), 30)
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const biz = await supabaseAdmin.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const since = new Date(Date.now() - days * 86400000).toISOString()

  let timesheets: Array<{ clock_in: string; clock_out: string; hours_worked: number | null; staff_member_id: string }> = []
  let sales: Array<{ total_amount: number; created_at: string }> = []

  try {
    const [timesheetsRes, salesRes] = await Promise.all([
      supabaseAdmin.from('pos_timesheets').select('clock_in, clock_out, hours_worked, staff_member_id').eq('business_id', business_id).gte('clock_in', since).not('clock_out', 'is', null).limit(100),
      supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', business_id).gte('created_at', since).neq('status', 'voided'),
    ])
    timesheets = (timesheetsRes.data ?? []) as Array<{ clock_in: string; clock_out: string; hours_worked: number | null; staff_member_id: string }>
    sales = (salesRes.data ?? []) as Array<{ total_amount: number; created_at: string }>
  } catch {
    return NextResponse.json({ shifts: [] })
  }

  const staffIds = [...new Set(timesheets.map(t => t.staff_member_id).filter(Boolean))]
  const staffMap: Record<string, { name: string; pay_rate_cents: number }> = {}
  if (staffIds.length > 0) {
    try {
      const { data: sm } = await supabaseAdmin.from('staff_members').select('id, first_name, last_name, pay_rate_cents').in('id', staffIds)
      for (const s of (sm ?? []) as Array<{ id: string; first_name: string; last_name: string; pay_rate_cents: number }>) {
        staffMap[s.id] = { name: s.first_name + ' ' + s.last_name, pay_rate_cents: s.pay_rate_cents ?? 0 }
      }
    } catch { /* ignore */ }
  }

  const rows: ShiftRow[] = []
  for (const t of timesheets) {
    const staff = staffMap[t.staff_member_id]
    if (!staff) continue
    const hours = t.hours_worked ?? ((new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 3600000)
    const labour_cost = (hours * staff.pay_rate_cents) / 100
    const shiftStart = new Date(t.clock_in).getTime()
    const shiftEnd = new Date(t.clock_out).getTime()
    const revenue = sales.filter(s => {
      const ts = new Date(s.created_at).getTime()
      return ts >= shiftStart && ts <= shiftEnd
    }).reduce((sum, s) => sum + (s.total_amount ?? 0), 0)
    const efficiency = labour_cost > 0 ? revenue / labour_cost : 0
    rows.push({
      date: new Date(t.clock_in).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
      staff: staff.name,
      hours: Math.round(hours * 10) / 10,
      labour_cost: Math.round(labour_cost * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      efficiency: Math.round(efficiency * 10) / 10,
      status: efficiency >= 3 ? 'profitable' : efficiency >= 1.5 ? 'breakeven' : 'loss',
    })
  }
  rows.sort((a, b) => a.efficiency - b.efficiency)

  return NextResponse.json({ shifts: rows })
}

export const GET = withErrorCapture('aria/staff-profitability', _GET)
