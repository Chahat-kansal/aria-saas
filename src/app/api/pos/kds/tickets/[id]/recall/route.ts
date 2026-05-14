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

  await supabase.from('pos_kds_tickets').update({
    status: 'recalled',
    bumped_at: null,
    prep_time_seconds: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/kds/tickets/[id]/recall', _POST)