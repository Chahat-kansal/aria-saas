export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { status?: string }
  if (!['approved','declined'].includes(String(body.status ?? ''))) {
    return NextResponse.json({ error: 'status must be approved or declined' }, { status: 400 })
  }

  const { error } = await supabase.from('staff_leave')
    .update({ status: body.status }).eq('id', params.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('staff/swap/[id]', _PATCH)
