export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const PAGE_SIZE = 50

const SELECT = 'id, business_id, name, email, phone, company, address, city, postcode, tags, notes, source, customer_segment, churn_risk, visit_count, total_spent, total_spend, last_visit, ai_summary, ai_summary_at, archived, created_at, updated_at'

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
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0'))

  let query = supabaseAdmin
    .from('customers')
    .select(SELECT)
    .eq('business_id', business_id)
    .eq('archived', archived)

  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
  if (segment) query = query.eq('customer_segment', segment)
  query = query.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data ?? [], page, page_size: PAGE_SIZE })
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
