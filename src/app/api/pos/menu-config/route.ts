export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(userId: string): Promise<string | null> {
  const s = createServerSupabaseClient()
  const { data: active } = await s
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await s
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.id as string | null) ?? null
}

const DEFAULT_CONFIG = {
  template_id: 'editorial',
  brand_kit: {},
  section_order: [],
  item_overrides: {},
  background_id: 'none',
  is_published: false,
}

async function _GET(_req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: config } = await supabaseAdmin
    .from('menu_configs')
    .select('*')
    .eq('business_id', bid)
    .maybeSingle()

  if (!config) {
    const { data: seeded } = await supabaseAdmin
      .from('menu_configs')
      .insert({ business_id: bid, ...DEFAULT_CONFIG })
      .select()
      .maybeSingle()
    return NextResponse.json({ config: seeded ?? { ...DEFAULT_CONFIG, business_id: bid } })
  }
  return NextResponse.json({ config })
}

async function _PUT(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const ALLOWED = ['template_id', 'brand_kit', 'section_order', 'item_overrides', 'background_id', 'is_published']
  for (const k of ALLOWED) {
    if (k in body) payload[k] = body[k]
  }

  const { data: existing } = await supabaseAdmin
    .from('menu_configs')
    .select('id')
    .eq('business_id', bid)
    .maybeSingle()

  let config: Record<string, unknown> | null = null
  let error: { message: string } | null = null

  if (existing?.id) {
    const res = await supabaseAdmin
      .from('menu_configs')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    config = res.data as Record<string, unknown> | null
    error = res.error
  } else {
    const res = await supabaseAdmin
      .from('menu_configs')
      .insert({ business_id: bid, ...DEFAULT_CONFIG, ...payload })
      .select()
      .single()
    config = res.data as Record<string, unknown> | null
    error = res.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config })
}

export const GET = withErrorCapture('pos/menu-config', _GET)
export const PUT = withErrorCapture('pos/menu-config', _PUT)
