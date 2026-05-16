export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ sale_id: string }> | { sale_id: string } }

async function _POST(_req: Request, ctx: Ctx) {
  const { sale_id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sale } = await supabase.from('pos_sales').select('id, status, business_id').eq('id', sale_id).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
  if (sale.status !== 'draft') return NextResponse.json({ error: 'Sale not in draft state' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', sale.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { count: splitCount } = await supabase.from('pos_sale_splits').select('id', { count: 'exact', head: true }).eq('sale_id', sale_id)
  const newStatus = (splitCount ?? 0) > 0 ? 'open' : 'completed'

  await supabase.from('pos_sales').update({ status: newStatus }).eq('id', sale_id)
  return NextResponse.json({ sale_id, status: newStatus })
}

export const POST = withErrorCapture('pos/sales/draft/promote', _POST)