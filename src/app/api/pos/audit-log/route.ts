export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const url = new URL(req.url)
  const limit  = Math.min(Number(url.searchParams.get('limit'))  || 200, 500)
  const offset = Number(url.searchParams.get('offset')) || 0

  const { data: entries, error: e } = await supabase
    .from('activity_log')
    .select('id, action_type, description, metadata, created_at')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ entries: entries ?? [] })
}

export const GET = withErrorCapture('pos/audit-log', _GET)