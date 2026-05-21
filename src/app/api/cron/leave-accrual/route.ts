export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const ANNUAL_DAYS_PER_YEAR: Record<string, number> = {
  full_time: 20, part_time: 20, casual: 0, contractor: 0, volunteer: 0,
}
const PERSONAL_DAYS_PER_YEAR: Record<string, number> = {
  full_time: 10, part_time: 10, casual: 0, contractor: 0, volunteer: 0,
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== 'Bearer ' + CRON_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = adminClient()
  const today = new Date().toISOString().slice(0, 10)
  let totalUpdated = 0

  const { data: businesses } = await sb.from('businesses').select('id').eq('is_active', true)
  if (!businesses?.length) return NextResponse.json({ ok: true, updated: 0 })

  for (const biz of businesses) {
    const { data: staff } = await sb.from('staff_members')
      .select('id, employment_type')
      .eq('business_id', biz.id).eq('status', 'active')

    if (!staff?.length) continue

    for (const member of staff) {
      const empType = String(member.employment_type ?? 'casual')
      const annualDays = ANNUAL_DAYS_PER_YEAR[empType] ?? 0
      const personalDays = PERSONAL_DAYS_PER_YEAR[empType] ?? 0
      if (annualDays === 0) continue

      // Check already ran today
      const { data: existing } = await sb.from('staff_leave')
        .select('id').eq('business_id', biz.id).eq('staff_id', member.id)
        .eq('leave_type', 'annual').eq('start_date', today).eq('notes', 'auto-accrual')
        .maybeSingle()
      if (existing) continue

      const dailyAnnual = +(annualDays / 365).toFixed(6)
      const dailyPersonal = +(personalDays / 365).toFixed(6)

      // Insert annual leave accrual (leave_type='annual' is valid in DB constraint)
      await sb.from('staff_leave').insert({
        business_id: biz.id, staff_id: member.id,
        leave_type: 'annual', start_date: today, end_date: today,
        days_taken: -dailyAnnual, // negative = accrual credit
        status: 'approved', notes: 'auto-accrual',
      })

      // Update balance directly on staff_members
      const { data: current } = await sb.from('staff_members')
        .select('leave_balance_days, personal_leave_balance_days')
        .eq('id', member.id).maybeSingle()

      await sb.from('staff_members').update({
        leave_balance_days: (Number(current?.leave_balance_days) || 0) + dailyAnnual,
        personal_leave_balance_days: (Number(current?.personal_leave_balance_days) || 0) + dailyPersonal,
      }).eq('id', member.id)

      totalUpdated++
    }
  }

  return NextResponse.json({ ok: true, date: today, staff_updated: totalUpdated })
}
