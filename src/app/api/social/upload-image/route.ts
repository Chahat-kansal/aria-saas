export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { put } from '@vercel/blob'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const businessId = formData.get('business_id') as string | null

  if (!file || !businessId) return NextResponse.json({ error: 'file and business_id required' }, { status: 400 })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WEBP allowed' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Max file size 10MB' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase()
  const blob = await put(
    'social-uploads/' + businessId + '/' + Date.now() + '-' + safeName,
    await file.arrayBuffer(),
    { access: 'public', contentType: file.type }
  )

  try {
    await supabaseAdmin.from('social_asset_library').insert({
      business_id: businessId,
      name: file.name,
      url: blob.url,
      type: 'image',
      size_bytes: file.size,
    })
  } catch (e) { console.error('[silent-catch]', e) }

  return NextResponse.json({ url: blob.url, ok: true })
}

export const POST = withErrorCapture('social/upload-image', _POST)
