export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function resolveToken(req: Request): Promise<{ staff_member_id: string; business_id: string } | null> {
  const token = req.headers.get('x-portal-token')?.trim()
  if (!token) return null
  const { data } = await supabaseAdmin.from('staff_members')
    .select('id, business_id, portal_token_expires_at')
    .eq('portal_token', token).eq('status', 'active').maybeSingle()
  if (!data) return null
  if (data.portal_token_expires_at && new Date(data.portal_token_expires_at as string) < new Date()) return null
  return { staff_member_id: String(data.id), business_id: String(data.business_id) }
}

async function _GET(req: Request) {
  const identity = await resolveToken(req)
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)
  const inFourWeeks = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10)

  const { data: shifts } = await supabaseAdmin
    .from('staff_shifts')
    .select('id, shift_date, start_time, end_time, role, status, notes, break_minutes')
    .eq('business_id', identity.business_id)
    .eq('staff_member_id', identity.staff_member_id)
    .gte('shift_date', today)
    .lte('shift_date', inFourWeeks)
    .order('shift_date')
    .order('start_time')

  return NextResponse.json({ shifts: shifts ?? [] })
}

export const GET = withErrorCapture('staff-portal/shifts', _GET)
