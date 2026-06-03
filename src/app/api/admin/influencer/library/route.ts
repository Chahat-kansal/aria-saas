export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminEmail } from '@/lib/admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await supabaseAdmin
    .from('aria_influencer_library')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
  return NextResponse.json({ influencers: data ?? [] })
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    name: string
    description?: string
    image_url: string
    higgsfield_job_id?: string
    higgsfield_model?: string
    industry_tags?: string[]
    style_tags?: string[]
    is_featured?: boolean
  }

  if (!body.name || !body.image_url) {
    return NextResponse.json({ error: 'name and image_url required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('aria_influencer_library')
    .insert({
      name: body.name,
      description: body.description ?? null,
      image_url: body.image_url,
      higgsfield_job_id: body.higgsfield_job_id ?? null,
      higgsfield_model: body.higgsfield_model ?? null,
      industry_tags: body.industry_tags ?? [],
      style_tags: body.style_tags ?? [],
      is_featured: body.is_featured ?? false,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ influencer: data, ok: true })
}

async function _PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, is_active, is_featured } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (is_active !== undefined) updates.is_active = is_active
  if (is_featured !== undefined) updates.is_featured = is_featured
  await supabaseAdmin.from('aria_influencer_library').update(updates).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('admin/influencer/library', _GET)
export const POST = withErrorCapture('admin/influencer/library', _POST)
export const PATCH = withErrorCapture('admin/influencer/library', _PATCH)
