export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { summariseRoster, hydrateShiftCosts } from '@/lib/staff/roster'
import type { ShiftEntry } from '@/lib/staff/roster'

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
  if (!bid) return NextResponse.json({ roster: null, shifts: [], summary: { total_hours: 0, total_cost_cents: 0, by_day: {}, by_staff: {}, conflicts: [] } })

  const url = new URL(req.url)
  const weekStart = url.searchParams.get('week_start')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const { data: roster } = await supabase.from('pos_rosters')
    .select('*').eq('business_id', bid).eq('week_start', weekStart).maybeSingle()

  if (!roster) {
    return NextResponse.json({ roster: null, shifts: [], summary: { total_hours: 0, total_cost_cents: 0, by_day: {}, by_staff: {}, conflicts: [] } })
  }

  const shifts = Array.isArray(roster.shifts) ? roster.shifts as ShiftEntry[] : []
  return NextResponse.json({ roster, shifts, summary: summariseRoster(shifts) })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { week_start?: string; outlet_id?: string; shifts?: unknown[]; status?: string }
  const weekStart = String(body.week_start ?? '')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const rawShifts = Array.isArray(body.shifts) ? body.shifts as Omit<ShiftEntry, 'cost_cents'>[] : []
  const status = String(body.status ?? 'draft')
  const shifts = await hydrateShiftCosts(rawShifts, bid)
  const summary = summariseRoster(shifts)

  const upsertData = {
    business_id: bid,
    outlet_id: body.outlet_id ? String(body.outlet_id) : null,
    week_start: weekStart,
    shifts,
    total_hours: summary.total_hours,
    total_cost_cents: summary.total_cost_cents,
    published: status === 'published',
    published_at: status === 'published' ? new Date().toISOString() : null,
    status,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase.from('pos_rosters').select('id').eq('business_id', bid).eq('week_start', weekStart).maybeSingle()
  let roster
  if (existing) {
    const { data } = await supabase.from('pos_rosters').update(upsertData).eq('id', String(existing.id)).select('*').single()
    roster = data
  } else {
    const { data } = await supabase.from('pos_rosters').insert(upsertData).select('*').single()
    roster = data
  }
  return NextResponse.json({ roster, shifts, summary })
}

export const GET = withErrorCapture('staff/roster', _GET)
export const POST = withErrorCapture('staff/roster', _POST)
