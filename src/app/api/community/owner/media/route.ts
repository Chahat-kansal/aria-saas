export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Max sizes — images small, video larger for reels
const MAX_IMAGE_MB = 8
const MAX_VIDEO_MB = 64

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm']

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Media storage is not configured. Set BLOB_READ_WRITE_TOKEN in env.' }, { status: 503 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const kind = String(form.get('kind') ?? 'image') // image | video | reel
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Validate mime + size based on kind
  if (kind === 'image') {
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported image type. Use JPEG, PNG, WebP, or HEIC.' }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `Image too large — max ${MAX_IMAGE_MB} MB.` }, { status: 400 })
    }
  } else if (kind === 'video' || kind === 'reel') {
    if (!ALLOWED_VIDEO_MIME.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported video type. Use MP4, MOV, or WebM.' }, { status: 400 })
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      return NextResponse.json({ error: `Video too large — max ${MAX_VIDEO_MB} MB.` }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'Invalid kind. Use image, video, or reel.' }, { status: 400 })
  }

  // Safe filename — strip directory traversal
  const safeName = (file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const key = `community/${bid}/${kind}/${Date.now()}-${safeName}`

  const { put } = await import('@vercel/blob')
  const blob = await put(key, file, { access: 'public', contentType: file.type })

  return NextResponse.json({
    ok: true,
    url: blob.url,
    kind,
    content_type: file.type,
    size: file.size,
  })
}

export const POST = withErrorCapture('community/owner/media', _POST)
