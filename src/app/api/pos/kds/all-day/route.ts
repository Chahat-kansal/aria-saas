export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const station = searchParams.get('station')

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  const bid = active?.business_id ?? biz?.id ?? null
  if (!bid) return NextResponse.json({ counts: [] })

  let q = supabase
    .from('pos_kds_tickets')
    .select('sale_item_id, pos_sale_items ( product_name, quantity )')
    .eq('business_id', bid)
    .in('status', ['fired', 'in_progress'])
  if (station) q = q.eq('station', station)

  const { data: tickets } = await q.limit(500)

  const counts: Record<string, number> = {}
  for (const t of tickets ?? []) {
    const name = (t.pos_sale_items as any)?.product_name ?? 'Unknown'
    const qty = Number((t.pos_sale_items as any)?.quantity ?? 1)
    counts[name] = (counts[name] ?? 0) + qty
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  return NextResponse.json({ counts: sorted })
}

export const GET = withErrorCapture('pos/kds/all-day', _GET)