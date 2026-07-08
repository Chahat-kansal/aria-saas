export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_CODE_RE = /^\d{10}$/

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// POST { code: string }
// Accepts: 10-digit numeric short_code (wallet barcode) OR identity UUID (legacy passes).
// Returns the customer record at the cashier's business, scoped by session ownership.
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found for this account' }, { status: 400 })

  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const code = (body.code ?? '').trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const isShortCode = SHORT_CODE_RE.test(code)
  const isUUID = UUID_RE.test(code)

  if (!isShortCode && !isUUID) {
    return NextResponse.json({ error: 'code must be a 10-digit numeric string or a UUID' }, { status: 400 })
  }

  // Resolve to a loyalty_identity row
  let identityId: string | null = null
  if (isShortCode) {
    const { data: ident } = await supabaseAdmin
      .from('loyalty_identity')
      .select('id')
      .eq('short_code', code)
      .maybeSingle()
    identityId = (ident as { id?: string } | null)?.id ?? null
  } else {
    // UUID — legacy passes that still embed the identity UUID as barcode
    const { data: ident } = await supabaseAdmin
      .from('loyalty_identity')
      .select('id')
      .eq('id', code)
      .maybeSingle()
    identityId = (ident as { id?: string } | null)?.id ?? null
  }

  if (!identityId) {
    return NextResponse.json({ found: false, reason: 'identity_not_found' }, { status: 404 })
  }

  // Find this identity's customer at the cashier's business (highest points = canonical row)
  const { data: customer } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, points_balance, loyalty_tier, visit_count, total_spent')
    .eq('loyalty_identity_id', identityId)
    .eq('business_id', bid)
    .is('deleted_at', null)
    .order('points_balance', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!customer) {
    return NextResponse.json({ found: false, identity_found: true, reason: 'not_a_customer_here' }, { status: 200 })
  }

  const cust = customer as {
    id: string
    name: string | null
    points_balance: number | null
    loyalty_tier: string | null
    visit_count: number | null
    total_spent: string | null
  }

  return NextResponse.json({
    found: true,
    customer_id: cust.id,
    name: cust.name,
    points_balance: Number(cust.points_balance ?? 0),
    loyalty_tier: cust.loyalty_tier,
    visit_count: Number(cust.visit_count ?? 0),
    total_spent: Number(cust.total_spent ?? 0),
  })
}