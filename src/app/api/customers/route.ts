export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const PAGE_SIZE = 50

const SELECT = 'id, business_id, name, email, phone, company, address, city, postcode, tags, notes, source, customer_segment, churn_risk, visit_count, total_spent, total_spend, last_visit, ai_summary, ai_summary_at, archived, rfm_score_numeric, created_at, updated_at'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const q = searchParams.get('q') ?? ''
  const archived = searchParams.get('archived') === 'true'
  const segment = searchParams.get('segment') ?? ''
  const churn_risk = searchParams.get('churn_risk') ?? ''
  const sort_by = searchParams.get('sort_by') ?? 'created_at'
  const sort_dir = searchParams.get('sort_dir') === 'asc'
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0'))

  const allowed_sorts = ['created_at', 'name', 'total_spent', 'total_spend', 'visit_count', 'last_visit', 'rfm_score_numeric']
  const safe_sort = allowed_sorts.includes(sort_by) ? sort_by : 'created_at'

  let query = supabaseAdmin
    .from('customers')
    .select(SELECT)
    .eq('business_id', business_id)
    .eq('archived', archived)

  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
  if (segment) query = query.eq('customer_segment', segment)
  if (churn_risk) query = query.eq('churn_risk', churn_risk)
  query = query.order(safe_sort, { ascending: sort_dir }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const customers = data ?? []

  // Merge pos_customers loyalty data by email/phone
  const emails = customers.filter(c => c.email).map(c => c.email as string)
  const phones = customers.filter(c => c.phone).map(c => c.phone as string)
  const posMap = new Map<string, { loyalty_points: number | null; total_spent: number | null; visit_count: number | null; last_visit_at: string | null }>()

  if (emails.length > 0) {
    const { data: byEmail } = await supabaseAdmin
      .from('pos_customers')
      .select('email, loyalty_points, total_spent, visit_count, last_visit_at')
      .eq('business_id', business_id)
      .in('email', emails)
    for (const p of byEmail ?? []) { if (p.email) posMap.set(p.email, p) }
  }
  if (phones.length > 0) {
    const { data: byPhone } = await supabaseAdmin
      .from('pos_customers')
      .select('phone, loyalty_points, total_spent, visit_count, last_visit_at')
      .eq('business_id', business_id)
      .in('phone', phones)
    for (const p of byPhone ?? []) {
      if (p.phone && !posMap.has(p.phone)) posMap.set(p.phone, p)
    }
  }

  const merged = customers.map(c => {
    const pos = posMap.get(c.email ?? '') ?? posMap.get(c.phone ?? '') ?? null
    return {
      ...c,
      loyalty_points: pos?.loyalty_points ?? null,
      total_spent: c.total_spent ?? c.total_spend ?? pos?.total_spent ?? 0,
      visit_count: c.visit_count ?? pos?.visit_count ?? 0,
      last_visit: c.last_visit ?? pos?.last_visit_at ?? null,
    }
  })

  return NextResponse.json({ customers: merged, page, page_size: PAGE_SIZE })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, name, email, phone, company, address, city, postcode, tags, notes } = body
  if (!business_id || !name?.trim()) return NextResponse.json({ error: 'business_id and name required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin.from('customers').insert({
    business_id,
    name: name.trim(),
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    company: company?.trim() || null,
    address: address?.trim() || null,
    city: city?.trim() || null,
    postcode: postcode?.trim() || null,
    tags: Array.isArray(tags) ? tags : [],
    notes: notes?.trim() || null,
    source: 'manual',
    archived: false,
  }).select(SELECT).single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer: data }, { status: 201 })
}

export const GET  = withErrorCapture('customers', _GET)
export const POST = withErrorCapture('customers', _POST)
