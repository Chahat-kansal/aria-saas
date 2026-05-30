export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { put } from '@vercel/blob'

const BUNNY_API_KEY  = process.env.BUNNY_STREAM_API_KEY ?? ''
const BUNNY_LIB_ID  = process.env.BUNNY_STREAM_LIBRARY_ID ?? ''
const BUNNY_CDN     = process.env.BUNNY_STREAM_CDN_HOSTNAME ?? ''

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, business_id: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', userId).single()
  return !!data
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }

  const file  = formData.get('file') as File | null
  const type  = (formData.get('type') as string | null) ?? 'post'
  const bid   = formData.get('business_id') as string | null

  if (!file || !bid) return NextResponse.json({ error: 'file and business_id required' }, { status: 400 })
  if (!await verifyBiz(supabase, user.id, bid)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isVideo = type === 'reel' || file.type.startsWith('video/')

  if (isVideo) {
    if (!BUNNY_API_KEY || !BUNNY_LIB_ID || !BUNNY_CDN) {
      return NextResponse.json({ error: 'Bunny Stream not configured' }, { status: 503 })
    }

    // Step A — create video object in Bunny
    const createRes = await fetch('https://video.bunnycdn.com/library/' + BUNNY_LIB_ID + '/videos', {
      method: 'POST',
      headers: { AccessKey: BUNNY_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: bid + '-' + Date.now() }),
    })
    if (!createRes.ok) return NextResponse.json({ error: 'Bunny create failed' }, { status: 502 })
    const createData = await createRes.json() as { guid: string }
    const guid = createData.guid

    // Step B — upload video bytes
    const buffer = await file.arrayBuffer()
    const uploadRes = await fetch('https://video.bunnycdn.com/library/' + BUNNY_LIB_ID + '/videos/' + guid, {
      method: 'PUT',
      headers: { AccessKey: BUNNY_API_KEY, 'Content-Type': 'application/octet-stream' },
      body: buffer,
    })
    if (!uploadRes.ok) return NextResponse.json({ error: 'Bunny upload failed' }, { status: 502 })

    const cdnUrl       = 'https://' + BUNNY_CDN + '/' + guid + '/play_720p.mp4'
    const thumbnailUrl = 'https://' + BUNNY_CDN + '/' + guid + '/thumbnail.jpg'
    return NextResponse.json({ url: cdnUrl, thumbnail_url: thumbnailUrl, type: 'video', guid })
  }

  // Image → Vercel Blob
  const blob = await put('community/' + bid + '/' + Date.now() + '-' + file.name, file, { access: 'public' })
  return NextResponse.json({ url: blob.url, type: 'image' })
}
