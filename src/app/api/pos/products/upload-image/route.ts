export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import sharp from 'sharp'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const BUCKET = 'pos-images'
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function normalizeImage(buffer: Buffer): Promise<{ main: Buffer; thumb: Buffer }> {
  let quality = 85
  let mainBuf = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
  while (mainBuf.byteLength > 153600 && quality > 30) {
    quality -= 10
    mainBuf = await sharp(buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  }
  const thumbBuf = await sharp(buffer)
    .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer()
  return { main: mainBuf, thumb: thumbBuf }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const productId = (formData.get('productId') as string | null) ?? null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'File must be JPEG, PNG, or WebP' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be ≤5MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { main, thumb } = await normalizeImage(buffer)

  const sb = adminClient()
  const ts = Date.now()
  const basePath = productId
    ? 'owner-products/' + productId + '-' + ts
    : 'owner-products/pending-' + ts

  const mainPath = basePath + '.webp'
  const thumbPath = basePath + '-thumb.webp'

  const [mainUpload, thumbUpload] = await Promise.all([
    sb.storage.from(BUCKET).upload(mainPath, main, { contentType: 'image/webp', upsert: true }),
    sb.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: 'image/webp', upsert: true }),
  ])
  if (mainUpload.error) return NextResponse.json({ error: mainUpload.error.message }, { status: 500 })
  if (thumbUpload.error) return NextResponse.json({ error: thumbUpload.error.message }, { status: 500 })

  const image_url = sb.storage.from(BUCKET).getPublicUrl(mainPath).data.publicUrl
  const image_thumb_url = sb.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl

  return NextResponse.json({ image_url, image_thumb_url })
}

export const POST = withErrorCapture('pos/products/upload-image', _POST)
