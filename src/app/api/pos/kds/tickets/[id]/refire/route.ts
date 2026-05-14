export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: original } = await supabase.from('pos_kds_tickets')
    .select('business_id, outlet_id, sale_id, sale_item_id, station, course, seat_number')
    .eq('id', id).maybeSingle()
  if (!original) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  // Mark original as refired; create a fresh clone
  const now = new Date().toISOString()
  await supabase.from('pos_kds_tickets').update({ status: 'refired', updated_at: now }).eq('id', id)

  const { data: newTicket } = await supabase.from('pos_kds_tickets').insert({
    business_id: original.business_id,
    outlet_id: original.outlet_id,
    sale_id: original.sale_id,
    sale_item_id: original.sale_item_id,
    station: original.station,
    course: original.course,
    seat_number: original.seat_number,
    status: 'fired',
    fired_at: now,
    created_at: now,
    updated_at: now,
  }).select('id').single()

  return NextResponse.json({ ok: true, new_ticket_id: newTicket?.id })
}

export const POST = withErrorCapture('pos/kds/tickets/[id]/refire', _POST)