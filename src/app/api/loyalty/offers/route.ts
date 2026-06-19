export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// LOY-OFFERS (owner side) — owner CRUD for the loyalty offers shown on customers' dashboards.
// Owner-authed via getBid; every read/write is scoped to the owner's OWN business. Field whitelist
// blocks mass-assignment. (Customer-facing read is the separate /api/loyalty/offers-feed route.)

const OFFER_TYPES = ['info', 'points_reward', 'bonus'] as const

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function requireOwner(): Promise<{ bid: string } | { error: NextResponse }> {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const bid = await getBid(supabase, user.id)
  if (!bid) return { error: NextResponse.json({ error: 'No business' }, { status: 400 }) }
  return { bid }
}

// Build a whitelisted offer patch from a request body. Returns { patch } or { error }.
function buildPatch(body: Record<string, unknown>, requireTitle: boolean): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {}
  if ('title' in body || requireTitle) {
    const title = String(body.title ?? '').trim()
    if (!title) return { error: 'Title is required.' }
    patch.title = title.slice(0, 120)
  }
  if ('description' in body) patch.description = body.description ? String(body.description).slice(0, 600) : null
  if ('image_url' in body) {
    const u = body.image_url ? String(body.image_url).trim() : ''
    if (u && !/^https:\/\//i.test(u)) return { error: 'Image URL must start with https://' }
    patch.image_url = u || null
  }
  if ('offer_type' in body) {
    const t = String(body.offer_type ?? 'info')
    if (!OFFER_TYPES.includes(t as typeof OFFER_TYPES[number])) return { error: 'Invalid offer type.' }
    patch.offer_type = t
  }
  if ('point_cost' in body) {
    if (body.point_cost === null || body.point_cost === '') patch.point_cost = null
    else {
      const n = Math.floor(Number(body.point_cost))
      if (!Number.isFinite(n) || n < 0) return { error: 'Point cost must be a positive number.' }
      patch.point_cost = n
    }
  }
  if ('active' in body) patch.active = !!body.active
  if ('starts_at' in body) patch.starts_at = body.starts_at ? new Date(String(body.starts_at)).toISOString() : null
  if ('ends_at' in body) patch.ends_at = body.ends_at ? new Date(String(body.ends_at)).toISOString() : null
  return { patch }
}

async function _GET() {
  const r = await requireOwner()
  if ('error' in r) return r.error
  const { data } = await supabaseAdmin.from('loyalty_offers')
    .select('id, title, description, image_url, offer_type, point_cost, active, starts_at, ends_at, created_at')
    .eq('business_id', r.bid).order('created_at', { ascending: false })
  return NextResponse.json({ offers: data ?? [] })
}

async function _POST(req: Request) {
  const r = await requireOwner()
  if ('error' in r) return r.error
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const built = buildPatch(body, true)
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('loyalty_offers')
    .insert({ ...built.patch, business_id: r.bid })
    .select('id, title, description, image_url, offer_type, point_cost, active, starts_at, ends_at, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ offer: data }, { status: 201 })
}

async function _PATCH(req: Request) {
  const r = await requireOwner()
  if ('error' in r) return r.error
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const built = buildPatch(body, false)
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: 400 })
  if (Object.keys(built.patch).length === 0) return NextResponse.json({ error: 'No changes' }, { status: 400 })
  // Scoped to the owner's business — cannot touch another business's offer.
  const { data, error } = await supabaseAdmin.from('loyalty_offers')
    .update({ ...built.patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('business_id', r.bid)
    .select('id, title, description, image_url, offer_type, point_cost, active, starts_at, ends_at, created_at').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  return NextResponse.json({ offer: data })
}

async function _DELETE(req: Request) {
  const r = await requireOwner()
  if ('error' in r) return r.error
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('loyalty_offers').delete().eq('id', id).eq('business_id', r.bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('loyalty/offers:get', _GET)
export const POST = withErrorCapture('loyalty/offers:post', _POST)
export const PATCH = withErrorCapture('loyalty/offers:patch', _PATCH)
export const DELETE = withErrorCapture('loyalty/offers:delete', _DELETE)
