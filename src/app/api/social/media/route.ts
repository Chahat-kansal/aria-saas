export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// GET — list media library
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = new URL(req.url).searchParams.get('business_id') ?? await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ media: [] })

  const { data } = await supabaseAdmin
    .from('business_media')
    .select('*')
    .eq('business_id', bid)
    .order('uploaded_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ media: data ?? [] })
}

// POST — upload image to media library
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const business_id = formData.get('business_id') as string | null
  const tags = (formData.get('tags') as string | null)?.split(',').map(t => t.trim()).filter(Boolean) ?? []

  if (!file || !business_id) return NextResponse.json({ error: 'file and business_id required' }, { status: 400 })

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Upload to Supabase storage
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `media/${business_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(path, buf, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const publicUrl = supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl

  // Use Claude Haiku to describe the image for better AI captions
  let ariaDescription = ''
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const b64 = buf.toString('base64')
    const mediaType = (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp') || 'image/jpeg'
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: `Describe this ${biz.industry ?? 'business'} photo in 1-2 sentences for social media context. Be specific about what's shown — food items, drinks, atmosphere, people. No marketing language.` }
        ]
      }]
    })
    ariaDescription = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  } catch { /* non-fatal */ }

  // Save to media library
  const { data: media, error: dbError } = await supabaseAdmin.from('business_media').insert({
    business_id,
    url: publicUrl,
    filename: file.name,
    media_type: file.type.startsWith('video/') ? 'video' : 'image',
    file_size_bytes: file.size,
    tags,
    aria_description: ariaDescription || null,
  }).select().single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ media }, { status: 201 })
}

// DELETE — remove from library
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('business_media').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('social/media', _GET)
export const POST = withErrorCapture('social/media', _POST)
export const DELETE = withErrorCapture('social/media', _DELETE)
