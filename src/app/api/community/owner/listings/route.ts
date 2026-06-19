export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveOwnerBusinessId as getBid } from '@/lib/community/resolveOwnerBusinessId'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const VALID_STATUS = new Set(['active', 'sold', 'hidden'])


// GET — list this business's marketplace listings
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  let q = supabaseAdmin.from('marketplace_listings')
    .select('id, product_id, title, description, price, media_urls, category, status, created_at, updated_at')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && VALID_STATUS.has(status)) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ listings: data ?? [] })
}

// POST — create new listing. If product_id is supplied, prefill from pos_products.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    title?: string
    description?: string
    price?: number | string | null
    media_urls?: string[]
    category?: string
    product_id?: string | null
  }

  let title = body.title?.trim() ?? ''
  let description = body.description?.trim() ?? ''
  let price: number | null = body.price !== undefined && body.price !== null && body.price !== '' ? Number(body.price) : null
  let media_urls = Array.isArray(body.media_urls) ? body.media_urls.slice(0, 8) : []

  // Optional prefill from POS product — only if product belongs to this business
  if (body.product_id) {
    const { data: prod } = await supabaseAdmin.from('pos_products')
      .select('id, name, description, price, image_url')
      .eq('id', body.product_id).eq('business_id', bid).maybeSingle()
    if (prod) {
      if (!title) title = String(prod.name ?? '').slice(0, 200)
      if (!description) description = String(prod.description ?? '').slice(0, 2000)
      if (price === null && prod.price !== null) price = Number(prod.price)
      if (media_urls.length === 0 && prod.image_url) media_urls = [String(prod.image_url)]
    }
  }

  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
  if (price !== null && (isNaN(price) || price < 0)) return NextResponse.json({ error: 'Price must be a positive number.' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('marketplace_listings').insert({
    business_id: bid,
    product_id: body.product_id ?? null,
    title: title.slice(0, 200),
    description: description.slice(0, 2000),
    price,
    media_urls,
    category: body.category?.toString().slice(0, 60) ?? null,
    status: 'active',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ listing: data })
}

// PATCH — edit listing, change status
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    id?: string
    title?: string
    description?: string
    price?: number | string | null
    media_urls?: string[]
    category?: string
    status?: string
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) patch.title = body.title.trim().slice(0, 200)
  if (body.description !== undefined) patch.description = body.description.trim().slice(0, 2000)
  if (body.price !== undefined) patch.price = body.price === null || body.price === '' ? null : Number(body.price)
  if (body.media_urls !== undefined) patch.media_urls = Array.isArray(body.media_urls) ? body.media_urls.slice(0, 8) : []
  if (body.category !== undefined) patch.category = body.category?.toString().slice(0, 60) || null
  if (body.status !== undefined && VALID_STATUS.has(body.status)) patch.status = body.status

  const { error } = await supabaseAdmin.from('marketplace_listings')
    .update(patch).eq('id', body.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove listing
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin.from('marketplace_listings').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('community/owner/listings', _GET)
export const POST   = withErrorCapture('community/owner/listings', _POST)
export const PATCH  = withErrorCapture('community/owner/listings', _PATCH)
export const DELETE = withErrorCapture('community/owner/listings', _DELETE)
