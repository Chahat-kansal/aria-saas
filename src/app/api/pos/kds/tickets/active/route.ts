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
    .select('*, pos_sale_items!pos_kds_tickets_sale_item_id_fkey(product_name)')
    .eq('business_id', bid)
    .in('status', ['fired', 'in_progress'])
    .gte('fired_at', cutoff)
    .order('fired_at', { ascending: true })

  if (station) q = q.eq('station', station)
  if (outlet_id) q = q.eq('outlet_id', outlet_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tickets = (data ?? []).map((t: Record<string, unknown>) => {
    const joined = (t.pos_sale_items as { product_name: string } | null)?.product_name ?? null
    let product_name: string | null = joined
    let modifiers_summary: string | null = t.modifiers_summary as string | null

    // Online tickets embed product name as [Name] first line in modifiers_summary
    if (!product_name && modifiers_summary) {
      const m = modifiers_summary.match(/^\[(.+?)\](?:\n|$)/)
      if (m) {
        product_name = m[1]
        modifiers_summary = modifiers_summary.slice(m[0].length).trim() || null
      }
    }

    return { ...t, pos_sale_items: undefined, product_name, modifiers_summary }
  })

  return NextResponse.json({ tickets })
}

export const GET = withErrorCapture('pos/kds/tickets/active', _GET)
