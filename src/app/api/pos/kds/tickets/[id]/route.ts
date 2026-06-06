export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: ticket } = await supabaseAdmin.from('pos_kds_tickets')
    .select('id, business_id, status, fired_at, bumped_at, prep_time_seconds, station')
    .eq('id', params.id).eq('business_id', bid).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '').toLowerCase()
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: now }
  let aria_event: string | null = null

  switch (action) {
    case 'bump':
      if (ticket.status !== 'fired' && ticket.status !== 'in_progress') {
        return NextResponse.json({ error: `Cannot bump ticket in status '${ticket.status}'` }, { status: 400 })
      }
      update.status = 'ready'
      update.bumped_at = now
      if (ticket.prep_time_seconds && ticket.fired_at) {
        const elapsed = (Date.parse(now) - Date.parse(ticket.fired_at)) / 1000
        if (elapsed > 2 * Number(ticket.prep_time_seconds)) aria_event = 'slow_ticket_bumped'
      }
      break
    case 'start':
    case 'unfire':
      if (ticket.status !== 'fired') return NextResponse.json({ error: `Cannot start in status '${ticket.status}'` }, { status: 400 })
      update.status = 'in_progress'
      break
    case 'recall':
      if (ticket.status !== 'bumped') return NextResponse.json({ error: 'Only bumped tickets can be recalled' }, { status: 400 })
      if (ticket.bumped_at) {
        const sinceBump = (Date.parse(now) - Date.parse(ticket.bumped_at)) / 1000
        if (sinceBump > 60) return NextResponse.json({ error: 'Recall window expired (60s)' }, { status: 400 })
      }
      update.status = 'fired'
      update.recalled_at = now
      update.recalled_by = user.id
      update.bumped_at = null
      aria_event = 'ticket_recalled'
      break
    case 'expedite':
      update.expedited = true
      break
    case 'void':
      update.status = 'voided'
      break
    default:
      return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('pos_kds_tickets').update(update).eq('id', params.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (aria_event) {
    try {
      await supabase.from('aria_actions').insert({
        business_id: bid,
        category: 'sales',
        title: aria_event === 'slow_ticket_bumped' ? `Slow ticket: ${ticket.station}` : `Recall: ${ticket.station}`,
        recommendation: aria_event === 'slow_ticket_bumped'
          ? `Ticket at ${ticket.station} took 2× target prep time. Investigate station throughput.`
          : `Ticket recalled at ${ticket.station} — was bumped too early.`,
        reason: null,
        expected_impact: '0.00',
        confidence: 'medium',
        status: 'pending',
        source: `kds:${aria_event}`,
        payload: { ticket_id: ticket.id, station: ticket.station, prep_time_seconds: ticket.prep_time_seconds },
        priority: 'low',
      })
    } catch (e) { console.error('[silent-catch]', e) }
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/kds/tickets/[id]', _PATCH)
