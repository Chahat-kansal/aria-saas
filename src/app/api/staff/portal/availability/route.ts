export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity } from '@/lib/staff/portal'

async function _GET(_req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data } = await supabase.from('staff_availability')
    .select('*').eq('staff_member_id', identity.staff_member_id)
    .order('day_of_week', { ascending: true })
  return NextResponse.json({ availability: data ?? [] })
}

async function _POST(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    replace_recurring?: boolean; recurring?: Array<Record<string, unknown>>; specific_date?: string
    unavailable_from?: string; unavailable_until?: string; reason?: string
  }
  const supabase = createServerSupabaseClient()

  if (body.replace_recurring === true && Array.isArray(body.recurring)) {
    await supabase.from('staff_availability')
      .delete().eq('staff_member_id', identity.staff_member_id).eq('is_recurring', true)

    if (body.recurring.length > 0) {
      await supabase.from('staff_availability').insert(
        body.recurring.map((r: Record<string, unknown>) => ({
          business_id: identity.business_id,
          staff_member_id: identity.staff_member_id,
          day_of_week: r.day_of_week != null ? Number(r.day_of_week) : null,
          unavailable_from: r.unavailable_from ?? null,
          unavailable_until: r.unavailable_until ?? null,
          reason: r.reason ? String(r.reason) : null,
          is_recurring: true,
        }))
      )
    }
    return NextResponse.json({ ok: true })
  }

  const specificDate = body.specific_date ? String(body.specific_date) : null
  if (!specificDate) return NextResponse.json({ error: 'specific_date required for one-off' }, { status: 400 })

  const { data, error } = await supabase.from('staff_availability').insert({
    business_id: identity.business_id,
    staff_member_id: identity.staff_member_id,
    specific_date: specificDate,
    unavailable_from: body.unavailable_from ?? null,
    unavailable_until: body.unavailable_until ?? null,
    reason: body.reason ? String(body.reason) : null,
    is_recurring: false,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 201 })
}

export const GET = withErrorCapture('staff/portal/availability', _GET)
export const POST = withErrorCapture('staff/portal/availability', _POST)
