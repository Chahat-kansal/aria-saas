export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: split } = await supabase.from('pos_sale_splits').select('id, sale_id, total_amount, status').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!split) return NextResponse.json({ error: 'Split not found' }, { status: 404 })
  if (split.status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 400 })
  if (split.status === 'void') return NextResponse.json({ error: 'Split is voided' }, { status: 400 })

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
    taken_by: user.id,
  })
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  // Sum all payments for this split
  const { data: payments } = await supabase.from('pos_split_payments').select('amount').eq('split_id', id)
  const totalPaid = (payments ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0)

  // Mark paid if fully covered (±$0.05 tolerance)
  if (totalPaid >= split.total_amount - 0.05) {
    await supabase.from('pos_sale_splits').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id)

    // Check if ALL splits for the sale are paid
    const { data: allSplits } = await supabase.from('pos_sale_splits').select('status').eq('sale_id', split.sale_id).neq('status', 'void')
    const allPaid = (allSplits ?? []).every((s: any) => s.status === 'paid')
    await supabase.from('pos_sales').update({ status: allPaid ? 'completed' : 'partial_paid' }).eq('id', split.sale_id)
  }

  // Log activity (non-blocking)
  import('@/lib/aria/brain').then(({ logActivity }) => {
    logActivity(bid, 'split_paid', `Split payment A$${amount.toFixed(2)} via ${method}`, { split_id: id, amount, method }).catch(() => {})
  }).catch(() => {})

  return NextResponse.json({ ok: true, total_paid: totalPaid })
}

export const POST = withErrorCapture('pos/splits/[id]/pay', _POST)