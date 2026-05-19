export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { primary_id, secondary_id, business_id } = body
  if (!primary_id || !secondary_id || !business_id) {
    return NextResponse.json({ error: 'primary_id, secondary_id, business_id required' }, { status: 400 })
  }
  if (primary_id === secondary_id) return NextResponse.json({ error: 'Cannot merge a customer with itself' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: primary }, { data: secondary }] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('*').eq('id', primary_id).eq('business_id', business_id).maybeSingle(),
    supabaseAdmin.from('pos_customers').select('*').eq('id', secondary_id).eq('business_id', business_id).maybeSingle(),
  ])
  if (!primary || !secondary) return NextResponse.json({ error: 'One or both customers not found' }, { status: 404 })

  // Merge spend and visits — take the maximum
  const mergedSpend = Math.max(Number(primary.total_spent ?? primary.total_spend ?? 0), Number(secondary.total_spent ?? secondary.total_spend ?? 0))
  const mergedVisits = Math.max(Number(primary.visit_count ?? 0), Number(secondary.visit_count ?? 0))
  const mergedPoints = Math.max(Number(primary.loyalty_points ?? primary.points_balance ?? 0), Number(secondary.loyalty_points ?? secondary.points_balance ?? 0))
  const lastVisit = [primary.last_visit, primary.last_visit_at, secondary.last_visit, secondary.last_visit_at]
    .filter(Boolean).sort().reverse()[0] ?? null

  // Move secondary's sales to primary
  await supabaseAdmin.from('pos_sales').update({ customer_id: primary_id }).eq('customer_id', secondary_id).eq('business_id', business_id)
  await supabaseAdmin.from('campaigns').update({ customer_id: primary_id }).eq('customer_id', secondary_id).eq('business_id', business_id)

  // Update primary with merged data
  await supabaseAdmin.from('pos_customers').update({
    total_spent: mergedSpend,
    total_spend: mergedSpend,
    visit_count: mergedVisits,
    loyalty_points: mergedPoints,
    points_balance: mergedPoints,
    last_visit: lastVisit,
    last_visit_at: lastVisit,
    // Fill nulls from secondary
    email: primary.email ?? secondary.email ?? null,
    phone: primary.phone ?? secondary.phone ?? null,
    birthday: primary.birthday ?? secondary.birthday ?? null,
    notes: [primary.notes, secondary.notes].filter(Boolean).join('\n') || null,
    tags: [...new Set([...(primary.tags ?? []), ...(secondary.tags ?? [])])],
    square_customer_id: primary.square_customer_id ?? secondary.square_customer_id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', primary_id)

  // Delete secondary
  await supabaseAdmin.from('pos_customers').delete().eq('id', secondary_id).eq('business_id', business_id)

  const { data: merged } = await supabaseAdmin.from('pos_customers').select('*').eq('id', primary_id).single()
  return NextResponse.json({ merged })
}

export const POST = withErrorCapture('customers/merge', _POST)
