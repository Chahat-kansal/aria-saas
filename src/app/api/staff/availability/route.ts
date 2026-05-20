export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ availability: [] })
  const { data } = await supabaseAdmin.from('staff_availability')
    .select('*, staff_members(first_name, last_name)')
    .eq('business_id', bid)
    .order('day_of_week')
  const result = (data ?? []).map((a: any) => ({
    ...a, staff_name: a.staff_members ? `${a.staff_members.first_name} ${a.staff_members.last_name}` : null, staff_members: undefined,
  }))
  return NextResponse.json({ availability: result })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const { staff_member_id, day_of_week, available, start_time, end_time, notes } = body
  const { data, error } = await supabaseAdmin.from('staff_availability').upsert(
    { business_id: bid, staff_member_id, day_of_week, available: available ?? true, start_time: start_time || null, end_time: end_time || null, notes: notes || null },
    { onConflict: 'staff_member_id,day_of_week' }
  ).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ availability: data })
}

export const GET = withErrorCapture('staff/availability', _GET)
export const POST = withErrorCapture('staff/availability', _POST)
