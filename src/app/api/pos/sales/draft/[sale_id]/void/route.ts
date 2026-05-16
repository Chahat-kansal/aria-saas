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
  if (sale.status !== 'draft') return NextResponse.json({ error: 'Only drafts can be voided this way' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', sale.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // FK ON DELETE CASCADE handles split_items, split_payments, sale_items
  await supabase.from('pos_sales').delete().eq('id', sale_id)

  return NextResponse.json({ sale_id, deleted: true })
}

export const POST = withErrorCapture('pos/sales/draft/void', _POST)