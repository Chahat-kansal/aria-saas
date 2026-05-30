export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const bid = searchParams.get('business_id') ?? await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ availability: [] })

  const { data } = await supabaseAdmin
    .from('booking_availability')
    .select('id,day_of_week,start_time,end_time,is_available,buffer_minutes,max_bookings_per_day')
    .eq('business_id', bid)
    .order('day_of_week')

  return NextResponse.json({ availability: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json() as { day_of_week: number; start_time: string; end_time: string; is_available: boolean; buffer_minutes?: number; max_bookings_per_day?: number }
  const { day_of_week, start_time, end_time, is_available, buffer_minutes, max_bookings_per_day } = body

  if (day_of_week === undefined) return NextResponse.json({ error: 'day_of_week required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('booking_availability')
    .upsert({
      business_id: bid, day_of_week,
      start_time: start_time ?? '09:00',
      end_time: end_time ?? '17:00',
      is_available: is_available ?? true,
      buffer_minutes: buffer_minutes ?? 15,
      max_bookings_per_day: max_bookings_per_day ?? null,
    }, { onConflict: 'business_id,day_of_week' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ availability: data })
}

export const GET  = withErrorCapture('bookings/availability-settings', _GET)
export const POST = withErrorCapture('bookings/availability-settings', _POST)
