export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getActiveBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string

  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getActiveBid(supabase, user.id)

  if (!bid) {
    return NextResponse.json({ business: null })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id,name,created_at,industry,plan,terminal_layout,booking_link_slug')
    .eq('id', bid)
    .maybeSingle()

  return NextResponse.json({ business: biz ?? null })
}

async function _PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getActiveBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  let body: Record<string, unknown> = {}
  try { body = (await request.json()) ?? {} } catch (e) { console.warn('[non-fatal]', e) }

  const VALID_LAYOUTS = ['grid', 'shelf', 'carousel', 'masonry', 'search-first', null]
  const updatePayload: Record<string, unknown> = {}

  if ('terminal_layout' in body) {
    if (!VALID_LAYOUTS.includes(body.terminal_layout as string | null)) {
      return NextResponse.json({ error: 'invalid_layout' }, { status: 400 })
    }
    updatePayload.terminal_layout = body.terminal_layout
  }
  if ('business_type' in body && typeof body.business_type === 'string') {
    updatePayload.industry = body.business_type
  }
  if ('booking_link_slug' in body && typeof body.booking_link_slug === 'string') {
    updatePayload.booking_link_slug = body.booking_link_slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60) || null
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(updatePayload)
    .eq('id', bid)
    .select('id,name,industry,plan,terminal_layout')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ business: data })
}

export const GET = withErrorCapture('pos/business', _GET)
export const PATCH = withErrorCapture('pos/business', _PATCH)
