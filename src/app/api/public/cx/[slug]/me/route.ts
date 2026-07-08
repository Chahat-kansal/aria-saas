export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSession } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'

// POST /api/public/cx/[slug]/me — session-gated customer profile lookup.
// body.phone is accepted as a dead param for backward compat but IGNORED for identity.
// Identity source: cx_session cookie only.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ found: false }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  type CustomerRow = {
    id: string; name: string; email: string | null; phone: string | null; created_at: string | null
    points_balance: number | null; loyalty_tier: string | null
    visit_count: number | null; stamps_count: number | null; total_spent: string | null
    last_visit_at: string | null; loyalty_identity_id: string | null
  }

  const COLS = 'id, name, email, phone, created_at, points_balance, loyalty_tier, visit_count, stamps_count, total_spent, last_visit_at, loyalty_identity_id'

  const customer = await resolveCxCustomer<CustomerRow>(session.identity_id, bid, COLS)

  if (!customer) return NextResponse.json({ found: false })

  const cx = customer as CustomerRow

  const [walletRes, challengesRes, txnsRes, usualRes, preloadRes] = await Promise.all([
    supabaseAdmin
      .from('loyalty_preload_accounts')
      .select('balance, currency')
      .eq('business_id', bid)
      .eq('customer_id', cx.id)
      .maybeSingle(),
    supabaseAdmin
      .from('loyalty_challenges')
      .select('id, title, description, target_count, progress, reward_points, status, expires_at')
      .eq('business_id', bid)
      .eq('customer_id', cx.id)
      .not('status', 'eq', 'expired')
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('pos_loyalty_transactions')
      .select('id, type, points_delta, reward_redeemed, created_at')
      .eq('business_id', bid)
      .eq('customer_id', cx.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('pos_online_orders')
      .select('items')
      .eq('business_id', bid)
      .eq('customer_id', cx.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('loyalty_preload_ledger')
      .select('id, amount, type, description, created_at')
      .eq('business_id', bid)
      .eq('customer_id', cx.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  let usualProduct = null
  const usualItems = ((usualRes.data as { items?: unknown[] } | null)?.items ?? []) as Array<{
    product_name?: string; unit_price?: number; product_id?: string; image_url?: string | null
  }>
  if (usualItems.length > 0 && usualItems[0]?.product_name) {
    const first = usualItems[0]
    let imgUrl: string | null = first.image_url ?? null
    if (!imgUrl && first.product_id) {
      const { data: prodImg } = await supabaseAdmin
        .from('pos_products')
        .select('image_url')
        .eq('id', first.product_id)
        .maybeSingle()
      imgUrl = (prodImg as { image_url?: string | null } | null)?.image_url ?? null
    }
    usualProduct = {
      name: first.product_name,
      price: Number(first.unit_price ?? 0),
      image_url: imgUrl,
      product_id: first.product_id ?? null,
    }
  }

  const walletData = walletRes.data as { balance?: number | null; currency?: string | null } | null

  return NextResponse.json({
    found: true,
    customer_id: cx.id,
    name: cx.name,
    points_balance: Number(cx.points_balance) || 0,
    loyalty_tier: cx.loyalty_tier ?? null,
    visit_count: Number(cx.visit_count) || 0,
    stamps_count: Number(cx.stamps_count) || 0,
    total_spent: (Number(cx.total_spent) || 0).toFixed(2),
    last_visit_at: cx.last_visit_at ?? null,
    email: cx.email ?? null,
    phone: cx.phone ?? null,
    member_since: cx.created_at ?? null,
    loyalty_identity_id: cx.loyalty_identity_id ?? null,
    wallet_balance: Number(walletData?.balance ?? 0),
    wallet_currency: walletData?.currency ?? 'AUD',
    challenges: (challengesRes.data ?? []) as unknown[],
    recent_txns: (txnsRes.data ?? []) as unknown[],
    preload_txns: (preloadRes.data ?? []) as unknown[],
    usual_product: usualProduct,
  })
}

// PATCH /api/public/cx/[slug]/me — session-gated profile update.
// body.customer_id and body.phone are accepted as dead params but IGNORED for identity.
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { customer_id?: string; phone?: string; name?: string; email?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  // customer_id + phone from body are IGNORED — customer derived from session identity
  const cust = await resolveCxCustomer<{ id: string }>(session.identity_id, bid, 'id')
  if (!cust) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const customerId = cust.id
  const patch: Record<string, string | null> = {}

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (name.length < 2) return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
    if (name.length > 80) return NextResponse.json({ error: 'Name too long' }, { status: 400 })
    patch.name = name
  }
  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    patch.email = email || null
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  const { error: updateErr } = await supabaseAdmin
    .from('pos_customers')
    .update(patch)
    .eq('id', customerId)
    .eq('business_id', bid)
  if (updateErr) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}