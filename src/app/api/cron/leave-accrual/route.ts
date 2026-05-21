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

// AU leave accrual rates (days per year)
const ANNUAL_LEAVE_DAYS_PER_YEAR: Record<string, number> = {
  full_time:   20,
  part_time:   20, // pro-rated by hours fraction
  casual:       0, // casuals get 25% loading instead
  contractor:   0,
  volunteer:    0,
}
const PERSONAL_LEAVE_DAYS_PER_YEAR: Record<string, number> = {
  full_time:   10,
  part_time:   10,
  casual:       0,
  contractor:   0,
  volunteer:    0,
}
// Daily accrual = annual / 365
function dailyAccrual(annualDays: number): number {
  return annualDays / 365
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = adminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Get all active businesses
  const { data: businesses } = await sb
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  if (!businesses?.length) return NextResponse.json({ ok: true, processed: 0 })

  let totalAccrued = 0

  for (const biz of businesses) {
    // Get active staff members
    const { data: staff } = await sb
      .from('staff_members')
      .select('id, employment_type, start_date')
      .eq('business_id', biz.id)
      .eq('status', 'active')
      .not('start_date', 'is', null)

    if (!staff?.length) continue

    for (const member of staff) {
      const empType = String(member.employment_type ?? 'casual')
      const annualAccrual = ANNUAL_LEAVE_DAYS_PER_YEAR[empType] ?? 0
      const personalAccrual = PERSONAL_LEAVE_DAYS_PER_YEAR[empType] ?? 0
      if (annualAccrual === 0 && personalAccrual === 0) continue

      // Check if we already accrued today for this staff member
      const { data: existing } = await sb
        .from('staff_leave')
        .select('id')
        .eq('business_id', biz.id)
        .eq('staff_id', member.id)
        .eq('leave_type', 'accrual')
        .eq('start_date', today)
        .maybeSingle()

      if (existing) continue // Already ran today

      // Insert daily accrual record
      const todayAccrual = dailyAccrual(annualAccrual)
      if (todayAccrual > 0) {
        await sb.from('staff_leave').insert({
          business_id: biz.id,
          staff_id: member.id,
          leave_type: 'accrual',
          start_date: today,
          end_date: today,
          days_taken: -todayAccrual, // negative = credit/accrual
          status: 'approved',
          notes: `Auto-accrual: ${annualAccrual} days/yr (${empType})`,
        })
        totalAccrued++
      }
    }
  }

  return NextResponse.json({ ok: true, date: today, accruals_created: totalAccrued })
}
