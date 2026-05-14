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

  const { data: ticket } = await supabase.from('pos_kds_tickets').select('id, fired_at, status').eq('id', id).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const now = new Date()
  const prepSeconds = ticket.fired_at
    ? Math.round((now.getTime() - new Date(ticket.fired_at).getTime()) / 1000)
    : null

  await supabase.from('pos_kds_tickets').update({
    status: 'bumped',
    bumped_at: now.toISOString(),
    prep_time_seconds: prepSeconds,
    updated_at: now.toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, prep_time_seconds: prepSeconds })
}

export const POST = withErrorCapture('pos/kds/tickets/[id]/bump', _POST)