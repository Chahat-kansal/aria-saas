export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { validateBody } from '@/lib/api/validate'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const status = searchParams.get('status') ?? ''
  const customer_id = searchParams.get('customer_id') ?? ''
  const date_from = searchParams.get('date_from') ?? ''
  const date_to = searchParams.get('date_to') ?? ''
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit

  let query = supabaseAdmin
    .from('wholesale_orders')
    .select(`
      id, order_number, status, source, po_ref, delivery_date, payment_terms,
      subtotal, discount_total, freight, gst_total, total, notes,
      invoice_id, created_at, confirmed_at, sent_at, cancelled_at,
      customer_id,
      customers!wholesale_orders_customer_id_fkey(id, name, email, business_name)
    `, { count: 'exact' })
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('status', status)
  if (customer_id) query = query.eq('customer_id', customer_id)
  if (date_from) query = query.gte('created_at', date_from)
  if (date_to) query = query.lte('created_at', date_to + 'T23:59:59Z')
  if (search) query = query.ilike('order_number', '%' + search + '%')

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ orders: data ?? [], total: count ?? 0, page })
}

const CreateOrderSchema = z.object({
  business_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
})

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await validateBody(req, CreateOrderSchema)
  if ('error' in parsed) return parsed.error
  const { business_id, customer_id } = parsed.data

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Generate order number via Postgres function
  const { data: numData, error: numErr } = await supabaseAdmin.rpc('generate_wholesale_order_number')
  if (numErr) return NextResponse.json({ error: numErr.message }, { status: 500 })
  const order_number = numData as string

  // Fetch customer payment terms default if available
  let payment_terms = 'Net 14'
  if (customer_id) {
    const { data: cust } = await supabaseAdmin.from('customers').select('payment_terms_default').eq('id', customer_id).maybeSingle()
    if (cust?.payment_terms_default) payment_terms = cust.payment_terms_default
  }

  const { data: order, error: orderErr } = await supabaseAdmin.from('wholesale_orders').insert({
    business_id,
    customer_id: customer_id ?? null,
    order_number,
    status: 'draft',
    source: 'inventory_pick',
    payment_terms,
    subtotal: 0,
    discount_total: 0,
    freight: 0,
    gst_total: 0,
    total: 0,
    created_by: user.id,
  }).select('*').single()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

  return NextResponse.json({ order }, { status: 201 })
}

export const GET  = withErrorCapture('wholesale/orders', _GET)
export const POST = withErrorCapture('wholesale/orders', _POST)
