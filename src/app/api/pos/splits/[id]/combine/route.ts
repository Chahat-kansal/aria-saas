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

  const { merge_split_id } = await req.json()
  if (!merge_split_id) return NextResponse.json({ error: 'merge_split_id required' }, { status: 400 })

  const [{ data: target }, { data: source }] = await Promise.all([
    supabase.from('pos_sale_splits').select('*').eq('id', id).maybeSingle(),
    supabase.from('pos_sale_splits').select('*').eq('id', merge_split_id).maybeSingle(),
  ])
  if (!target || !source) return NextResponse.json({ error: 'Split not found' }, { status: 404 })
  if (source.status === 'paid' || target.status === 'paid') return NextResponse.json({ error: 'Cannot combine paid splits' }, { status: 400 })

  // Merge source into target
  await supabase.from('pos_sale_splits').update({
    subtotal: (target.subtotal ?? 0) + (source.subtotal ?? 0),
    tax_amount: (target.tax_amount ?? 0) + (source.tax_amount ?? 0),
    tip_amount: (target.tip_amount ?? 0) + (source.tip_amount ?? 0),
    total_amount: (target.total_amount ?? 0) + (source.total_amount ?? 0),
    person_label: `${target.person_label} + ${source.person_label}`,
  }).eq('id', id)

  // Move items and payments from source to target
  await Promise.all([
    supabase.from('pos_split_items').update({ split_id: id }).eq('split_id', merge_split_id),
    supabase.from('pos_split_payments').update({ split_id: id }).eq('split_id', merge_split_id),
  ])

  // Void the merged-away split
  await supabase.from('pos_sale_splits').update({ status: 'voided' }).eq('id', merge_split_id)

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/splits/[id]/combine', _POST)