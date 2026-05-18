export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await supabase.from('staff_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', params.id).is('read_at', null)
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('staff/messages/[id]', _PATCH)
