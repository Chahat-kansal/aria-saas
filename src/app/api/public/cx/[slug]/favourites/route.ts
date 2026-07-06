export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type FavBody = { customer_id?: string; product_id?: string; custom_build?: Record<string, unknown>; nickname?: string }

// GET  ?customer_id=...
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ favourites: [] }, { status: 404 })

  const url = new URL(req.url)
  const customerId = url.searchParams.get('customer_id') ?? ''
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

// POST  { customer_id, product_id, custom_build?, nickname? }
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ ok: false }, { status: 404 })

  let body: FavBody = {}
  try { body = await req.json() } catch { /* empty */ }

  const { customer_id, product_id, custom_build = {}, nickname } = body
  if (!customer_id || !product_id) return NextResponse.json({ ok: false, error: 'customer_id and product_id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('cx_favourites')
    .upsert({ business_id: bid, customer_id, product_id, custom_build, nickname: nickname ?? null },
      { onConflict: 'customer_id,product_id' })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?customer_id=...&product_id=...
export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ ok: false }, { status: 404 })

  const url = new URL(req.url)
  const customerId = url.searchParams.get('customer_id') ?? ''
  const productId = url.searchParams.get('product_id') ?? ''
  if (!customerId || !productId) return NextResponse.json({ ok: false }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('cx_favourites')
    .delete()
    .eq('business_id', bid)
    .eq('customer_id', customerId)
    .eq('product_id', productId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}