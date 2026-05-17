export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function _POST(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership: confirm split belongs to user's business
  const { data: split } = await supabase.from('pos_sale_splits').select('id, business_id').eq('id', id).maybeSingle()
  if (!split) return NextResponse.json({ error: 'Split not found' }, { status: 404 })
  const { data: bizCheck } = await supabase.from('businesses').select('id').eq('id', split.business_id).eq('user_id', user.id).maybeSingle()
  if (!bizCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { sale_item_id, to_split_id, quantity_assigned, amount_assigned } = await req.json()
  if (!sale_item_id || !to_split_id) return NextResponse.json({ error: 'sale_item_id and to_split_id required' }, { status: 400 })

  // Remove item from current split
  await supabase.from('pos_split_items').delete().eq('split_id', id).eq('sale_item_id', sale_item_id)

  // Add to target split
  await supabase.from('pos_split_items').upsert({ split_id: to_split_id, sale_item_id, quantity_assigned: quantity_assigned ?? 1, amount_assigned: amount_assigned ?? 0 })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/splits/[id]/reassign-item', _POST)