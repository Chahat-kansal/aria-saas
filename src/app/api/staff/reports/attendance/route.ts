export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { buildAttendanceReport } from '@/lib/staff/reports'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10)
  const fmt = url.searchParams.get('format') ?? 'json'

  const rows = await buildAttendanceReport(bid, from, to)

  if (fmt === 'csv') {
    const header = 'staff_name,position,shifts_scheduled,shifts_worked,attendance_rate,late_clockins,avg_variance_minutes,total_hours_worked,total_hours_rostered'
    const lines = rows.map(r =>
      [r.staff_name, r.position, r.shifts_scheduled, r.shifts_worked, r.attendance_rate, r.late_clockins, r.avg_variance_minutes, r.total_hours_worked, r.total_hours_rostered].join(',')
    )
    const csv = [header, ...lines].join('\n')
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="attendance-${from}-${to}.csv"` },
    })
  }

  return NextResponse.json({ from, to, rows })
}

export const GET = withErrorCapture('staff/reports/attendance', _GET)
