export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getActiveBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string

  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getActiveBid(supabase, user.id)

  if (!bid) {
    return NextResponse.json({ business: null })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id,name,created_at,industry,plan,terminal_layout,booking_link_slug,bookings_enabled')
    .eq('id', bid)
    .maybeSingle()

  // BOOKINGS-OWNER-CONTROL-1 — the dashboard needs business_hours to derive sensible
  // availability defaults instead of a hardcoded Mon-Fri 9-5 fallback.
  const { data: hours } = await supabaseAdmin
    .from('business_hours')
    .select('day_of_week,open_time,close_time,is_closed')
    .eq('business_id', bid)
    .order('day_of_week')

  return NextResponse.json({ business: biz ?? null, business_hours: hours ?? [] })
}

async function _PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getActiveBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  let body: Record<string, unknown> = {}
  try { body = (await request.json()) ?? {} } catch (e) { console.warn('[non-fatal]', e) }

  const VALID_LAYOUTS = ['grid', 'shelf', 'carousel', 'masonry', 'search-first', null]
  const updatePayload: Record<string, unknown> = {}

  if ('terminal_layout' in body) {
    if (!VALID_LAYOUTS.includes(body.terminal_layout as string | null)) {
      return NextResponse.json({ error: 'invalid_layout' }, { status: 400 })
    }
    updatePayload.terminal_layout = body.terminal_layout
  }
  if ('business_type' in body && typeof body.business_type === 'string') {
    updatePayload.industry = body.business_type
  }
  if ('booking_link_slug' in body && typeof body.booking_link_slug === 'string') {
    updatePayload.booking_link_slug = body.booking_link_slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60) || null
  }
  let enablingBookings = false
  if ('bookings_enabled' in body && typeof body.bookings_enabled === 'boolean') {
    updatePayload.bookings_enabled = body.bookings_enabled
    enablingBookings = body.bookings_enabled === true
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(updatePayload)
    .eq('id', bid)
    .select('id,name,industry,plan,terminal_layout,bookings_enabled')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // BOOKINGS-OWNER-CONTROL-1 onboarding seed — the moment a business first turns bookings
  // on, give it one default service + a week of availability derived from business_hours so
  // it never stares at "no time slots available" on day one. Only seeds if genuinely empty —
  // never overwrites an owner's existing services/availability.
  if (enablingBookings) {
    const [{ count: svcCount }, { count: availCount }] = await Promise.all([
      supabaseAdmin.from('booking_services').select('id', { count: 'exact', head: true }).eq('business_id', bid),
      supabaseAdmin.from('booking_availability').select('id', { count: 'exact', head: true }).eq('business_id', bid),
    ])

    if (!svcCount) {
      await supabaseAdmin.from('booking_services').insert({
        business_id: bid, name: 'General booking', description: null,
        duration_minutes: 60, max_party_size: 20, color: '#7FB897',
      })
    }

    if (!availCount) {
      const { data: hours } = await supabaseAdmin
        .from('business_hours')
        .select('day_of_week,open_time,close_time,is_closed')
        .eq('business_id', bid)
      const byDay = new Map((hours ?? []).map(h => [h.day_of_week, h]))
      const rows = Array.from({ length: 7 }, (_, day_of_week) => {
        const h = byDay.get(day_of_week) as { open_time: string | null; close_time: string | null; is_closed: boolean } | undefined
        return {
          business_id: bid, day_of_week,
          start_time: h?.open_time ?? '09:00',
          end_time: h?.close_time ?? '17:00',
          is_available: h ? !h.is_closed : (day_of_week >= 1 && day_of_week <= 5),
          buffer_minutes: 15,
          max_bookings_per_day: null,
        }
      })
      await supabaseAdmin.from('booking_availability').upsert(rows, { onConflict: 'business_id,day_of_week' })
    }
  }

  return NextResponse.json({ business: data })
}

export const GET = withErrorCapture('pos/business', _GET)
export const PATCH = withErrorCapture('pos/business', _PATCH)
