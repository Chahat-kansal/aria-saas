export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ sales: [], total: 0 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const payment_method = searchParams.get('payment_method')
  const starts_at = searchParams.get('starts_at')
  const ends_at = searchParams.get('ends_at')
  const search = searchParams.get('search')
  const limit = Math.min(200, Number(searchParams.get('limit')) || 50)
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)

  let q = supabase.from('pos_sales')
    .select('id, sale_number, total_amount, subtotal, tax_amount, discount_amount, payment_method, status, created_at, customer_name, served_by, last_edited_at', { count: 'exact' })
    .eq('business_id', bid)

  if (status) q = q.eq('status', status)
  if (payment_method) q = q.eq('payment_method', payment_method)
  if (starts_at) q = q.gte('created_at', starts_at)
  if (ends_at) q = q.lte('created_at', ends_at)
  if (search) q = q.or(`sale_number.ilike.%${search}%,customer_name.ilike.%${search}%`)

  const { data, count, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sales: data ?? [], total: count ?? 0 })
}

export const GET = withErrorCapture('pos/sales-history', _GET)
