export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
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

// GET — return all menu configs for this business (default first)
async function _GET(_req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: rows } = await supabaseAdmin
    .from('menu_configs')
    .select('*')
    .eq('business_id', bid)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (!rows || rows.length === 0) {
    // Seed the first menu
    const { data: seeded } = await supabaseAdmin
      .from('menu_configs')
      .insert({
        business_id: bid,
        menu_key: 'main',
        menu_label: 'Main Menu',
        is_default: true,
        ...DEFAULT_CONFIG,
      })
      .select()
      .single()
    return NextResponse.json({ configs: seeded ? [seeded] : [] })
  }

  return NextResponse.json({ configs: rows })
}

// PUT — update a specific menu config
// Body: { menu_key: string, ...allowedFields } — matched by (business_id, menu_key)
// id is accepted but NOT used for matching (it was optional and caused silent 0-row updates)
// Special: setting is_default=true unsets all others for this business
async function _PUT(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = body

  // menu_key is the reliable match key — always non-optional in MenuCfg
  const menuKey = rest.menu_key as string | undefined
  if (!menuKey) return NextResponse.json({ error: 'Missing menu_key' }, { status: 400 })

  const ALLOWED = [
    'template_id', 'brand_kit', 'section_order', 'item_overrides',
    'background_id', 'is_published', 'menu_label', 'menu_key',
    'active_from', 'active_to', 'days_of_week', 'is_default',
  ]
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ALLOWED) {
    if (k in rest) payload[k] = rest[k]
  }

  // Enforce exactly-one-default: if setting this as default, clear others
  if (payload.is_default === true) {
    await supabaseAdmin
      .from('menu_configs')
      .update({ is_default: false })
      .eq('business_id', bid)
      .neq('menu_key', menuKey)
  }

  // Match by (business_id, menu_key) — ownership enforced by business_id = bid
  const { data: config, error } = await supabaseAdmin
    .from('menu_configs')
    .update(payload)
    .eq('business_id', bid)
    .eq('menu_key', menuKey)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Honest: if no row matched (config is null) the update was a no-op — never silently 200
  if (!config) return NextResponse.json({ error: 'Config not found — 0 rows updated' }, { status: 422 })

  // Bust the public menu page cache so it reflects this save immediately.
  // revalidatePath clears both the Next.js Data Cache and the Vercel CDN cache
  // for the public /menu/<slug> route — without this, force-dynamic still serves
  // stale data from CDN edge nodes that cached a previous response.
  try {
    const { data: bizRow } = await supabaseAdmin
      .from('businesses')
      .select('slug')
      .eq('id', bid)
      .maybeSingle()
    const slug = (bizRow?.slug as string | null) ?? null
    if (slug) revalidatePath('/menu/' + slug)
  } catch { /* non-fatal — page will self-correct on next request via force-dynamic */ }

  // If default changed, return the full refreshed list so client can sync
  if (payload.is_default === true) {
    const { data: all } = await supabaseAdmin
      .from('menu_configs')
      .select('*')
      .eq('business_id', bid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    return NextResponse.json({ config, configs: all ?? [] })
  }

  return NextResponse.json({ config })
}

// POST — create a new menu for this business
// Body: { menu_label: string, menu_key?: string }
async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json() as { menu_label?: string; menu_key?: string }
  const label = (body.menu_label ?? 'New Menu').trim()
  const rawKey = (body.menu_key ?? label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'menu'

  // Ensure key is unique within this business (append suffix if needed)
  const { data: existing } = await supabaseAdmin
    .from('menu_configs')
    .select('menu_key')
    .eq('business_id', bid)
  const usedKeys = new Set((existing ?? []).map((r: { menu_key: string }) => r.menu_key))
  let menuKey = rawKey
  let suffix = 2
  while (usedKeys.has(menuKey)) {
    menuKey = rawKey + '-' + suffix
    suffix++
  }

  const { data: config, error } = await supabaseAdmin
    .from('menu_configs')
    .insert({
      business_id: bid,
      menu_key: menuKey,
      menu_label: label,
      is_default: false,
      ...DEFAULT_CONFIG,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config })
}

// DELETE — remove a non-default menu
// Query: ?id=<uuid>
async function _DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('menu_configs')
    .select('id, business_id, is_default')
    .eq('id', id)
    .maybeSingle()

  if (!existing || existing.business_id !== bid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.is_default) {
    return NextResponse.json({ error: 'Cannot delete the default menu' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('menu_configs')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('pos/menu-config', _GET)
export const PUT    = withErrorCapture('pos/menu-config', _PUT)
export const POST   = withErrorCapture('pos/menu-config', _POST)
export const DELETE = withErrorCapture('pos/menu-config', _DELETE)
