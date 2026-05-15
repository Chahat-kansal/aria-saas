export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Daily cleanup: mark collected orders older than 24h as archived
// The actual SMS notification happens when KDS expo is bumped (pos/kds/[id] PATCH)

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = adminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Archive old collected/cancelled orders
  const { data: archivedRows } = await sb
    .from('pos_online_orders')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .in('status', ['collected', 'cancelled'])
    .lt('updated_at', cutoff)
    .select('id')

  return NextResponse.json({ ok: true, archived: archivedRows?.length ?? 0 })
}
