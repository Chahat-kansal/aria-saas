export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const VALID_TYPES = new Set(['update', 'offer', 'new_stock', 'event', 'story'])
const VALID_CHANNELS = new Set(['community', 'instagram', 'facebook', 'google_business'])
const VALID_STATUS = new Set(['proposed', 'approved', 'rejected', 'posted'])

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// PATCH — edit a single draft (title/body/hashtags/channels/timing) and/or change status
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    id?: string
    draft_title?: string | null
    draft_body?: string
    draft_hashtags?: string[]
    channels?: string[]
    suggested_for_at?: string | null
    post_type?: string
    status?: string
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.draft_title !== undefined) patch.draft_title = body.draft_title ? String(body.draft_title).slice(0, 200) : null
  if (body.draft_body !== undefined) patch.draft_body = String(body.draft_body).slice(0, 4000)
  if (Array.isArray(body.draft_hashtags)) patch.draft_hashtags = body.draft_hashtags.slice(0, 8)
  if (Array.isArray(body.channels)) {
    const c = body.channels.filter(c => VALID_CHANNELS.has(c))
    if (c.length === 0) return NextResponse.json({ error: 'Pick at least one channel.' }, { status: 400 })
    patch.channels = c
  }
  if (body.suggested_for_at !== undefined) patch.suggested_for_at = body.suggested_for_at
  if (body.post_type !== undefined && VALID_TYPES.has(body.post_type)) patch.post_type = body.post_type
  if (body.status !== undefined && VALID_STATUS.has(body.status)) patch.status = body.status

  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'No changes' }, { status: 400 })

  const { error } = await supabaseAdmin.from('aria_marketing_drafts').update(patch).eq('id', body.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove a draft
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('aria_marketing_drafts').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const PATCH  = withErrorCapture('community/owner/marketer/drafts', _PATCH)
export const DELETE = withErrorCapture('community/owner/marketer/drafts', _DELETE)
