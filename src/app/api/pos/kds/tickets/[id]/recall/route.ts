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
  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (_ab?.business_id as string) ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { data: _ticketCheck } = await supabase.from('pos_kds_tickets').select('id').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!_ticketCheck) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  await supabase.from('pos_kds_tickets').update({
    status: 'recalled',
    bumped_at: null,
    prep_time_seconds: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/kds/tickets/[id]/recall', _POST)