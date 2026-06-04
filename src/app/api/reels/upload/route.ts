export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const business_id = formData.get('business_id') as string | null

  if (!file || !business_id) return NextResponse.json({ error: 'file and business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const ext = file.name.split('.').pop() ?? 'mp4'
  const path = `${business_id}/${Date.now()}.${ext}`

  const bytes = await file.arrayBuffer()
  const { error } = await supabaseAdmin.storage
    .from('reel-uploads')
    .upload(path, bytes, { contentType: file.type || 'video/mp4', upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from('reel-uploads').getPublicUrl(path)

  // Save as completed session so it appears in history
  const { data: session } = await supabaseAdmin.from('reel_studio_sessions').insert({
    business_id,
    prompt: 'User uploaded video',
    style: 'upload',
    duration_seconds: 0,
    status: 'completed',
    cost_aud: 0,
    credits_used: 0,
    video_url: publicUrl,
    completed_at: new Date().toISOString(),
  }).select().single()

  return NextResponse.json({ video_url: publicUrl, session_id: session?.id })
}
