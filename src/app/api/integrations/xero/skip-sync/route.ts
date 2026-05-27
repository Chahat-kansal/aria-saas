export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: queue } = await supabaseAdmin
    .from('xero_sync_queue')
    .select('business_id')
    .eq('id', id)
    .single()
  if (!queue) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', queue.business_id)
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('xero_sync_queue').update({ status: 'skipped' }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('integrations/xero/skip-sync', _POST)
