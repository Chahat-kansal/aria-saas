export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSession } from '@/lib/cx/get-cx-session'

type FavBody = { customer_id?: string; product_id?: string; custom_build?: Record<string, unknown>; nickname?: string }

async function resolveCustomerId(bid: string, identityId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('pos_customers')
    .select('id')
    .eq('business_id', bid)
    .eq('loyalty_identity_id', identityId)
    .is('deleted_at', null)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// GET — session-gated; ?customer_id= is a dead param, IGNORED for identity.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ favourites: [] }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = await resolveCustomerId(bid, session.identity_id)
  if (!customerId) return NextResponse.json({ favourites: [] })

  const { data, error } = await supabaseAdmin
    .from('cx_favourites')
    .select('id, product_id, custom_build, nickname, created_at')
    .eq('business_id', bid)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ favourites: [] })
  return NextResponse.json({ favourites: data ?? [] })
}

// POST — session-gated; body.customer_id is a dead param, IGNORED for identity.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ ok: false }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: FavBody = {}
  try { body = await req.json() } catch { /* empty */ }

  const { product_id, custom_build = {}, nickname } = body
  if (!product_id) return NextResponse.json({ ok: false, error: 'product_id required' }, { status: 400 })

  const customerId = await resolveCustomerId(bid, session.identity_id)
  if (!customerId) return NextResponse.json({ ok: false, error: 'Customer not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('cx_favourites')
    .upsert(
      { business_id: bid, customer_id: customerId, product_id, custom_build, nickname: nickname ?? null },
      { onConflict: 'customer_id,product_id' },
    )

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — session-gated; ?customer_id= is a dead param, IGNORED for identity.
export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ ok: false }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const productId = url.searchParams.get('product_id') ?? ''
  if (!productId) return NextResponse.json({ ok: false }, { status: 400 })

  const customerId = await resolveCustomerId(bid, session.identity_id)
  if (!customerId) return NextResponse.json({ ok: false, error: 'Customer not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('cx_favourites')
    .delete()
    .eq('business_id', bid)
    .eq('customer_id', customerId)
    .eq('product_id', productId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}