export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ batches: [] })

  const { searchParams } = new URL(req.url)
  const bid = searchParams.get('business_id')
  if (!bid) return NextResponse.json({ batches: [] })

  // Get batches expiring in next 90 days (or already expired in last 7)
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const future = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]

  const { data: batches } = await supabase
    .from('pos_product_batches')
    .select('id, product_id, expiry_date, quantity_remaining, batch_ref')
    .eq('business_id', bid)
    .eq('expiry_tracked', true)
    .gt('quantity_remaining', 0)
    .gte('expiry_date', cutoff)
    .lte('expiry_date', future)
    .order('expiry_date', { ascending: true })

  if (!batches?.length) return NextResponse.json({ batches: [] })

  // Fetch product names
  const productIds = [...new Set(batches.map(b => b.product_id))]
  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name')
    .in('id', productIds)

  const productMap = Object.fromEntries((products ?? []).map(p => [p.id, p.name]))

  return NextResponse.json({
    batches: batches.map(b => ({ ...b, product_name: productMap[b.product_id] ?? null }))
  })
}
