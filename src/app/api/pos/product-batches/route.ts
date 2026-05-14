export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ batches: [] })

  const { searchParams } = new URL(req.url)
  const product_id = searchParams.get('product_id')
  const business_id = searchParams.get('business_id')
  if (!product_id || !business_id) return NextResponse.json({ batches: [] })

  const { data } = await supabase
    .from('pos_product_batches')
    .select('id, expiry_date, quantity_remaining, expiry_tracked')
    .eq('product_id', product_id)
    .eq('business_id', business_id)
    .eq('expiry_tracked', true)
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true })

  return NextResponse.json({ batches: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase.from('pos_product_batches').insert({
    business_id: body.business_id,
    product_id: body.product_id,
    expiry_date: body.expiry_date,
    quantity_received: body.quantity_received ?? 0,
    quantity_remaining: body.quantity_remaining ?? 0,
    expiry_tracked: true,
    source: body.source ?? 'pos_sale',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}