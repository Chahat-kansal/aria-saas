export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { normalisePhone } from '@/lib/clicksend'

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ found: false }, { status: 404 })

  let body: { phone?: string } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  const raw = (body.phone ?? '').trim()
  if (!raw) return NextResponse.json({ found: false })

  let phone = raw
  try { phone = normalisePhone(raw) } catch { /* keep raw */ }

  type CustomerRow = {
    id: string; name: string; email: string | null; phone: string | null; created_at: string | null
    points_balance: number | null; loyalty_tier: string | null
    visit_count: number | null; stamps_count: number | null; total_spent: string | null
    last_visit_at: string | null; loyalty_identity_id: string | null
  }

  const COLS = 'id, name, email, phone, created_at, points_balance, loyalty_tier, visit_count, stamps_count, total_spent, last_visit_at, loyalty_identity_id'

  let customer: CustomerRow | null = null
  const { data: byNorm } = await supabaseAdmin
    .from('pos_customers')
    .select(COLS)
    .eq('business_id', bid)
    .eq('phone', phone)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  customer = byNorm as CustomerRow | null

  if (!customer && phone !== raw) {
    const { data: byRaw } = await supabaseAdmin
      .from('pos_customers')
      .select(COLS)
      .eq('business_id', bid)
      .eq('phone', raw)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    customer = byRaw as CustomerRow | null
  }

  if (!customer) return NextResponse.json({ found: false })

  // Parallel fetch of all supplemental data
  const [walletRes, challengesRes, txnsRes, usualRes, preloadRes] = await Promise.all([
    supabaseAdmin
      .from('loyalty_preload_accounts')
      .select('balance, currency')
      .eq('business_id', bid)
      .eq('customer_id', customer.id)
      .maybeSingle(),
    supabaseAdmin
      .from('loyalty_challenges')
      .select('id, title, description, target_count, progress, reward_points, status, expires_at')
      .eq('business_id', bid)
      .eq('customer_id', customer.id)
      .not('status', 'eq', 'expired')
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('pos_loyalty_transactions')
      .select('id, type, points_delta, reward_redeemed, created_at')
      .eq('business_id', bid)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('pos_online_orders')
      .select('items')
      .eq('business_id', bid)
      .eq('customer_id', customer.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('loyalty_preload_ledger')
      .select('id, amount, type, description, created_at')
      .eq('business_id', bid)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // Parse usual product from last completed order's first item
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
  const walletBalance = Number(walletData?.balance ?? 0)
  const walletCurrency = walletData?.currency ?? 'AUD'

  return NextResponse.json({
    found: true,
    customer_id: customer.id,
    name: customer.name,
    points_balance: Number(customer.points_balance) || 0,
    loyalty_tier: customer.loyalty_tier ?? null,
    visit_count: Number(customer.visit_count) || 0,
    stamps_count: Number(customer.stamps_count) || 0,
    total_spent: (Number(customer.total_spent) || 0).toFixed(2),
    last_visit_at: customer.last_visit_at ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    member_since: customer.created_at ?? null,
    loyalty_identity_id: customer.loyalty_identity_id ?? null,
    wallet_balance: walletBalance,
    wallet_currency: walletCurrency,
    challenges: (challengesRes.data ?? []) as unknown[],
    recent_txns: (txnsRes.data ?? []) as unknown[],
    preload_txns: (preloadRes.data ?? []) as unknown[],
    usual_product: usualProduct,
  })
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { customer_id?: string; phone?: string; name?: string; email?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const { customer_id, phone: rawPhone } = body
  if (!customer_id || !rawPhone) return NextResponse.json({ error: 'customer_id and phone required' }, { status: 400 })

  let phone = rawPhone.trim()
  try { phone = normalisePhone(phone) } catch { /* keep raw */ }

  // Verify caller: customer must exist under this business with matching phone
  const { data: byCid } = await supabaseAdmin
    .from('pos_customers')
    .select('id, phone')
    .eq('id', customer_id)
    .eq('business_id', bid)
    .is('deleted_at', null)
    .maybeSingle()
  if (!byCid) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const storedPhone = (byCid as { phone?: string | null }).phone ?? ''
  if (storedPhone && storedPhone !== phone && storedPhone !== rawPhone.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

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
    .eq('id', customer_id)
    .eq('business_id', bid)
  if (updateErr) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}