export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const folder = String(formData.get('folder') ?? 'uploads')
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })

  const { put } = await import('@vercel/blob')
  const blob = await put('aria-studio/' + bid + '/' + Date.now() + '-' + file.name, file, { access: 'public' })

  const { data: asset, error } = await supabaseAdmin.from('aria_studio_assets').insert({
    business_id: bid, prompt: null, enhanced_prompt: null,
    style: 'upload', format: 'original', provider: 'user_upload',
    image_url: blob.url, folder, tags: [], status: 'ready',
    name: file.name,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset, url: blob.url, ok: true })
}

export const POST = withBusinessContext('aria/studio/upload', _POST)
