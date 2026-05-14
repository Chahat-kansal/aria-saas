export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: customer, error } = await supabase
    .from('pos_customers')
    .select('*')
    .eq('id', id)
    .eq('business_id', bid)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Purchase history (last 20 sales)
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('id, total_amount, payment_method, points_earned, points_redeemed, created_at, pos_sale_items(product_name, quantity, unit_price)')
    .eq('business_id', bid)
    .eq('customer_id', id)
    .neq('status', 'voided')
    .order('created_at', { ascending: false })
    .limit(20)

  // Loyalty transactions (last 20)
  const { data: loyaltyTx } = await supabase
    .from('pos_loyalty_transactions')
    .select('id, type, points_delta, stamps_delta, reward_redeemed, created_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ customer, sales: sales ?? [], loyalty_transactions: loyaltyTx ?? [] })
}

export const GET = withErrorCapture('pos/customers/[id]', _GET)

async function _PATCH(req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const SAFE = ['name','phone','email','birthday','notes','tags','marketing_consent','points_balance','stamps_count'] as const
  for (const k of SAFE) {
    if (k in body) allowed[k] = body[k]
  }

  const { error } = await supabase.from('pos_customers').update(allowed).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/customers/[id]', _PATCH)

async function _DELETE(_req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { error } = await supabase.from('pos_customers').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const DELETE = withErrorCapture('pos/customers/[id]', _DELETE)