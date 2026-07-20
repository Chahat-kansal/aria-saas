export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { sale_id, ai_response, group_id, edits } = await req.json()
  if (!sale_id || !ai_response?.splits) return NextResponse.json({ error: 'sale_id and ai_response.splits required' }, { status: 400 })

  const { data: sale } = await supabase.from('pos_sales').select('total_amount').eq('id', sale_id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  const splits = (edits ?? ai_response.splits).map((sp: any, i: number) => ({
    sale_id,
    business_id: bid,
    group_id: group_id ?? null,
    split_number: i + 1,
    split_method: 'by_item',
    person_label: sp.person,
    subtotal: sp.subtotal ?? 0,
    tax_amount: 0,
    tip_amount: sp.tip_suggestion ?? 0,
    total_amount: sp.total ?? sp.subtotal ?? 0,
    status: 'unpaid',
    ai_suggested: true,
    ai_reasoning: sp.reasoning ?? ai_response.overall_reasoning ?? null,
  }))

  const { data: inserted, error: insErr } = await supabase.from('pos_sale_splits').insert(splits).select()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await supabase.from('pos_sales').update({ status: 'open' }).eq('id', sale_id)

  return NextResponse.json({ splits: inserted ?? [] }, { status: 201 })
}

export const POST = withBusinessContext('pos/splits/ai-suggest/confirm', _POST)
