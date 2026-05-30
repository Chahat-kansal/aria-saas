export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { markBriefingStale } from '@/lib/aria/briefing-invalidate'

type Params = { params: { id: string } }

async function ownerCheck(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, id: string) {
  const { data: customer } = await supabaseAdmin.from('customers').select('id, business_id, email, phone').eq('id', id).maybeSingle()
  if (!customer) return null
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', customer.business_id).eq('user_id', userId).single()
  return biz ? customer : null
}

async function _GET(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customer = await ownerCheck(supabase, user.id, params.id)
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: full } = await supabaseAdmin.from('customers').select('*').eq('id', params.id).maybeSingle()

  // Fetch last 10 sales by customer_id or email
  const salesQuery = supabaseAdmin
    .from('pos_sales')
    .select('id, total_amount, created_at, status, items_count')
    .neq('status', 'voided')
    .order('created_at', { ascending: false })
    .limit(10)

  const orParts = [`customer_id.eq.${params.id}`]
  if (customer.email) orParts.push('customer_email.eq.' + customer.email)
  const { data: sales } = await salesQuery.or(orParts.join(','))

  // Fetch pos_customers loyalty data
  let posCustomer: { loyalty_points: number | null; rfm_recency_score: number | null; rfm_frequency_score: number | null; rfm_monetary_score: number | null } | null = null
  if (customer.email || customer.phone) {
    const parts: string[] = []
    if (customer.email) parts.push('email.eq.' + customer.email)
    if (customer.phone) parts.push('phone.eq.' + customer.phone)
    const { data: pos } = await supabaseAdmin
      .from('pos_customers')
      .select('loyalty_points, rfm_recency_score, rfm_frequency_score, rfm_monetary_score')
      .eq('business_id', full?.business_id ?? '')
      .or(parts.join(','))
      .maybeSingle()
    posCustomer = pos ?? null
  }

  return NextResponse.json({
    customer: { ...full, loyalty_points: posCustomer?.loyalty_points ?? null, rfm_scores: posCustomer ? { r: posCustomer.rfm_recency_score, f: posCustomer.rfm_frequency_score, m: posCustomer.rfm_monetary_score } : null },
    sales: sales ?? [],
  })
}

async function _PATCH(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin.from('customers').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['name', 'email', 'phone', 'company', 'address', 'city', 'postcode', 'tags', 'notes', 'archived', 'customer_segment']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) update[k] = body[k]

  const { data, error } = await supabaseAdmin.from('customers').update(update).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  void markBriefingStale(customer.business_id)
  return NextResponse.json({ customer: data })
}

async function _DELETE(_req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin.from('customers').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('customers').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('customers/[id]', _GET)
export const PATCH  = withErrorCapture('customers/[id]', _PATCH)
export const DELETE = withErrorCapture('customers/[id]', _DELETE)
