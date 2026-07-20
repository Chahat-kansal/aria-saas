export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function _POST(req: Request, ctx: Ctx, { supabase, userId, businessId: bid }: BusinessContext) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params

  const { data: split } = await supabase.from('pos_sale_splits').select('id, sale_id, total_amount, amount_paid, status').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!split) return NextResponse.json({ error: 'Split not found' }, { status: 404 })
  if (split.status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 400 })
  if (split.status === 'voided') return NextResponse.json({ error: 'Split is voided' }, { status: 400 })

  const body = await req.json()
  const { method, amount, tip_portion, reference, processor } = body
  if (!method || !amount) return NextResponse.json({ error: 'method and amount required' }, { status: 400 })

  // Record payment
  const { error: payErr } = await supabase.from('pos_split_payments').insert({
    split_id: id,
    sale_id: split.sale_id,
    business_id: bid,
    method,
    amount,
    tip_portion: tip_portion ?? null,
    reference: reference ?? null,
    processor: processor ?? null,
    taken_by: userId,
  })
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  // Sum all payments for this split
  const { data: payments } = await supabase.from('pos_split_payments').select('amount').eq('split_id', id)
  const totalPaid = (payments ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0)

  // Sprint A depth: track amount_paid on split record; flip to 'paid' when fully covered
  const newStatus = totalPaid >= (Number(split.total_amount) || 0) - 0.05 ? 'paid' : 'unpaid'
  await supabase.from('pos_sale_splits').update({
    amount_paid: +totalPaid.toFixed(2),
    status: newStatus,
    paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
  }).eq('id', id)

  if (newStatus === 'paid') {

    // Check if ALL splits for the sale are paid
    const { data: allSplits } = await supabase.from('pos_sale_splits').select('status').eq('sale_id', split.sale_id).neq('status', 'voided')
    const allPaid = (allSplits ?? []).every((s: any) => s.status === 'paid')
    await supabase.from('pos_sales').update({ status: allPaid ? 'completed' : 'partial_paid' }).eq('id', split.sale_id)
  }

  // Log activity (non-blocking)
  import('@/lib/aria/brain').then(({ logActivity }) => {
    logActivity(bid, 'split_paid', `Split payment A$${amount.toFixed(2)} via ${method}`, { split_id: id, amount, method }).catch(() => {})
  }).catch(() => {})

  return NextResponse.json({ ok: true, total_paid: totalPaid })
}

export const POST = withBusinessContext('pos/splits/[id]/pay', _POST)
