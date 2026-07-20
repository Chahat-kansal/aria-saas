export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ shifts: [] })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date().toISOString().slice(0, 10)
  const to = searchParams.get('to') ?? from

  const { data, error } = await supabaseAdmin
    .from('staff_shifts')
    .select('id, staff_member_id, staff_name, shift_date, start_time, end_time, role, status, notes, ai_generated, break_minutes')
    .eq('business_id', bid)
    .gte('shift_date', from)
    .lte('shift_date', to)
    .order('shift_date')
    .order('start_time')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shifts: data ?? [] })
}

function toTimestamp(date: string, time: string): string {
  if (!time) return `${date}T09:00:00`
  if (time.includes('T')) return time
  const t = time.length === 5 ? `${time}:00` : time
  return `${date}T${t}`
}

async function _POST(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json()
  const shifts = Array.isArray(body) ? body : [body]
  const rows = shifts.map((s: Record<string, unknown>) => ({
    business_id: bid,
    staff_member_id: s.staff_member_id ?? null,
    staff_name: s.staff_name ?? null,
    shift_date: s.shift_date,
    start_time: toTimestamp(s.shift_date as string, s.start_time as string),
    end_time: toTimestamp(s.shift_date as string, s.end_time as string),
    role: s.role ?? 'staff',
    status: s.status ?? 'scheduled',
    notes: s.notes ?? null,
    ai_generated: s.ai_generated ?? false,
    break_minutes: s.break_minutes ?? 0,
  }))

  const { data, error } = await supabaseAdmin.from('staff_shifts').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shifts: data })
}

async function _PATCH(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json()
  const { error } = await supabaseAdmin.from('staff_shifts').update(body).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function _DELETE(req: Request, _ctx: unknown, { businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin.from('staff_shifts').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/staff-shifts', _GET)
export const POST = withBusinessContext('pos/staff-shifts', _POST)
export const PATCH = withBusinessContext('pos/staff-shifts', _PATCH)
export const DELETE = withBusinessContext('pos/staff-shifts', _DELETE)
