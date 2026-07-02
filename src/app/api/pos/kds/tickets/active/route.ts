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
  if (!bid) return NextResponse.json({ tickets: [] })

  const url = new URL(req.url)
  const station = url.searchParams.get('station')
  const outlet_id = url.searchParams.get('outlet_id')
  const cutoff = new Date(Date.now() - 4 * 3600_000).toISOString()

  let q = supabase.from('pos_kds_tickets')
    .select('*')
    .eq('business_id', bid)
    .in('status', ['fired', 'in_progress'])
    .gte('fired_at', cutoff)
    .order('fired_at', { ascending: true })

  if (station) q = q.eq('station', station)
  // Include online tickets (outlet_id IS NULL) alongside outlet-scoped tickets
  if (outlet_id) q = q.or('outlet_id.eq.' + outlet_id + ',outlet_id.is.null')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as Record<string, unknown>[]

  // Batch-lookup product names for in-store tickets that have a sale_item_id.
  // Online tickets (sale_item_id=null) rely on the [Name] parse below instead.
  const saleItemIds = [...new Set(rows.map(t => t.sale_item_id as string | null).filter((id): id is string => !!id))]
  const productNameMap: Record<string, string> = {}
  if (saleItemIds.length > 0) {
    const { data: saleItems } = await supabase.from('pos_sale_items').select('id, product_name').in('id', saleItemIds)
    for (const si of saleItems ?? []) {
      const row = si as { id: string; product_name: string | null }
      if (row.id && row.product_name) productNameMap[row.id] = row.product_name
    }
  }

  const tickets = rows.map(t => {
    const saleItemId = t.sale_item_id as string | null
    let product_name: string | null = saleItemId ? (productNameMap[saleItemId] ?? null) : null
    let modifiers_summary: string | null = t.modifiers_summary as string | null

    // Online tickets embed product name as [Name] first line in modifiers_summary
    if (!product_name && modifiers_summary) {
      const m = modifiers_summary.match(/^\[(.+?)\](?:\n|$)/)
      if (m) {
        product_name = m[1]
        modifiers_summary = modifiers_summary.slice(m[0].length).trim() || null
      }
    }

    return { ...t, product_name, modifiers_summary }
  })

  return NextResponse.json({ tickets })
}

export const GET = withErrorCapture('pos/kds/tickets/active', _GET)
