export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const streamId = searchParams.get('stream_id')
  if (!streamId) return NextResponse.json({ count: 0 })

  const { data } = await supabaseAdmin
    .from('community_live_streams')
    .select('viewer_count')
    .eq('id', streamId)
    .maybeSingle()

  return NextResponse.json({ count: (data as { viewer_count: number } | null)?.viewer_count ?? 0 })
}

// Called by presence sync to update DB count
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const streamId = searchParams.get('stream_id')
  if (!streamId) return NextResponse.json({ ok: false })

  const { count } = await req.json() as { count: number }
  await supabaseAdmin.from('community_live_streams')
    .update({ viewer_count: count, peak_viewers: count })
    .eq('id', streamId)
    .eq('status', 'active')

  return NextResponse.json({ ok: true })
}
