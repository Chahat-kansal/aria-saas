export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

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

export const POST = withErrorCapture('aria/studio/upload', _POST)
