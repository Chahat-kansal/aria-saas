export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const streamId = params.id
  if (!streamId) return NextResponse.json({ error: 'stream_id required' }, { status: 400 })

  const body = await req.json() as { sender_name?: string; message?: string; business_id?: string }
  const { sender_name, message, business_id } = body

  if (!sender_name || !message?.trim()) {
    return NextResponse.json({ error: 'sender_name and message required' }, { status: 400 })
  }

  // Verify stream exists and is active
  const { data: stream } = await supabaseAdmin
    .from('community_live_streams')
    .select('id,status')
    .eq('id', streamId)
    .eq('status', 'active')
    .maybeSingle()
  if (!stream) return NextResponse.json({ error: 'Stream not active' }, { status: 404 })

  const { data, error } = await supabaseAdmin.from('community_live_chat').insert({
    stream_id: streamId,
    sender_name: sender_name.slice(0, 60),
    message: message.trim().slice(0, 200),
    business_id: business_id ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data }, { status: 201 })
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const streamId = params.id
  const { searchParams } = new URL(req.url)
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))

  const { data } = await supabaseAdmin
    .from('community_live_chat')
    .select('id,sender_name,message,created_at')
    .eq('stream_id', streamId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return NextResponse.json({ messages: (data ?? []).reverse() })
}
