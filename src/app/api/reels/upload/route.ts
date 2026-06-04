export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  const business_id = form.get('business_id') as string | null
  if (!file || !business_id) return NextResponse.json({ error: 'file and business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ext = (file.name.split('.').pop() ?? 'mp4').toLowerCase()
  const path = business_id + '/uploads/' + Date.now() + '.' + ext
  const buf = await file.arrayBuffer()

  const { error: upErr } = await supabaseAdmin.storage
    .from('reel-scenes')
    .upload(path, buf, { contentType: file.type || 'video/mp4', upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from('reel-scenes').getPublicUrl(path)

  const { data: sess, error: sessErr } = await supabaseAdmin
    .from('reel_studio_sessions')
    .insert({
      business_id,
      prompt: 'Uploaded video',
      style: 'lifestyle',
      duration_seconds: 0,
      status: 'completed',
      video_url: publicUrl,
      cost_aud: 0,
      credits_used: 0,
    })
    .select('id')
    .single()
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 })

  return NextResponse.json({ url: publicUrl, session_id: sess.id })
}

export const POST = withErrorCapture('reels/upload', _POST)
