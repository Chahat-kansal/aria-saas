export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const streamId = searchParams.get('stream_id')
  if (!streamId) return NextResponse.json({ error: 'stream_id required' }, { status: 400 })

  const { data } = await supabaseAdmin
    .from('community_live_streams')
    .select('id,title,status,cf_playback_hls,started_at,businesses(name,logo_url)')
    .eq('id', streamId)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ stream: data })
}
