export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const VALID_CHANNELS = new Set(['community', 'instagram', 'facebook', 'google_business'])
const VALID_TYPES = new Set(['update', 'offer', 'new_stock', 'event', 'story'])

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data } = await supabaseAdmin.from('aria_marketing_autopost_rules').select('*').eq('business_id', bid).maybeSingle()
  return NextResponse.json({
    rules: data ?? {
      enabled: false,
      channels: ['community'],
      max_per_week: 3,
      allowed_post_types: ['update', 'offer', 'new_stock', 'event'],
      earliest_hour: 9,
      latest_hour: 18,
    },
  })
}

async function _PUT(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    enabled?: boolean
    channels?: string[]
    max_per_week?: number
    allowed_post_types?: string[]
    earliest_hour?: number
    latest_hour?: number
  }

  const patch: Record<string, unknown> = { business_id: bid, updated_at: new Date().toISOString() }
  if (body.enabled !== undefined) patch.enabled = !!body.enabled
  if (Array.isArray(body.channels)) {
    const c = body.channels.filter(x => VALID_CHANNELS.has(x))
    patch.channels = c.length > 0 ? c : ['community']
  }
  if (body.max_per_week !== undefined) patch.max_per_week = Math.max(0, Math.min(14, Number(body.max_per_week) || 0))
  if (Array.isArray(body.allowed_post_types)) patch.allowed_post_types = body.allowed_post_types.filter(t => VALID_TYPES.has(t))
  if (body.earliest_hour !== undefined) patch.earliest_hour = Math.max(0, Math.min(23, Number(body.earliest_hour) || 0))
  if (body.latest_hour !== undefined) patch.latest_hour = Math.max(0, Math.min(23, Number(body.latest_hour) || 0))

  await supabaseAdmin.from('aria_marketing_autopost_rules').upsert(patch, { onConflict: 'business_id' })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('community/owner/marketer/rules', _GET)
export const PUT = withErrorCapture('community/owner/marketer/rules', _PUT)
