export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { calcRFM } from '@/lib/rfm'

type Params = { params: { id: string } }

async function _GET(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin
    .from('pos_customers')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sales with items
  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('id, created_at, total_amount, payment_method, status, pos_sale_items(product_name, quantity, line_total)')
    .eq('customer_id', params.id)
    .eq('business_id', customer.business_id)
    .neq('status', 'voided')
    .order('created_at', { ascending: false })
    .limit(50)

  // Store credit
  const { data: credit } = await supabaseAdmin
    .from('pos_store_credits')
    .select('balance, created_at')
    .eq('customer_id', params.id)
    .eq('business_id', customer.business_id)
    .maybeSingle()

  const spend = Number(customer.total_spent ?? customer.total_spend ?? 0)
  const visits = Number(customer.visit_count ?? 0)
  const lv = (customer.last_visit ?? customer.last_visit_at ?? null) as string | null
  const rfm = calcRFM(spend, visits, lv)
  const avgBasket = visits > 0 ? spend / visits : 0

  return NextResponse.json({ customer, sales: sales ?? [], rfm, avgBasket, storeCredit: credit ?? null })
}

async function _PATCH(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin.from('pos_customers').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['tags', 'notes', 'marketing_consent', 'birthday', 'phone', 'email', 'abn', 'name']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) update[k] = body[k]

  const { data, error } = await supabaseAdmin.from('pos_customers').update(update).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer: data })
}

export const GET  = withErrorCapture('customers/[id]', _GET)
export const PATCH = withErrorCapture('customers/[id]', _PATCH)
