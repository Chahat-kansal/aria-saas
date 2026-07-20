export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ splits: [] })

  const { searchParams } = new URL(req.url)
  const saleId = searchParams.get('sale_id')
  if (!saleId) return NextResponse.json({ error: 'sale_id required' }, { status: 400 })

  const { data: splits, error: e } = await supabase
    .from('pos_sale_splits')
    .select('*, pos_split_items(*), pos_split_payments(*)')
    .eq('sale_id', saleId)
    .eq('business_id', bid)
    .order('split_number')

  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ splits: splits ?? [] })
}

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json()
  const { sale_id, group_id, splits: splitInputs } = body

  if (!sale_id || !Array.isArray(splitInputs) || splitInputs.length === 0) {
    return NextResponse.json({ error: 'sale_id and splits[] required' }, { status: 400 })
  }

  // Verify business owns sale
  const { data: sale } = await supabase.from('pos_sales').select('id, total_amount, status').eq('id', sale_id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
  if (sale.status === 'voided') return NextResponse.json({ error: 'Cannot split a voided sale' }, { status: 400 })

  // Reject if splits already exist
  const { count } = await supabase.from('pos_sale_splits').select('id', { count: 'exact', head: true }).eq('sale_id', sale_id).neq('status', 'voided')
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Splits already exist — delete them first to re-split' }, { status: 409 })

  // Validate totals sum (±$0.05 tolerance)
  const splitTotal = splitInputs.reduce((s: number, sp: any) => s + (sp.total_amount ?? 0), 0)
  if (Math.abs(splitTotal - sale.total_amount) > 0.05) {
    return NextResponse.json({ error: `Split totals (A$${splitTotal.toFixed(2)}) do not match sale total (A$${sale.total_amount.toFixed(2)})` }, { status: 400 })
  }

  // Insert splits
  const rows = splitInputs.map((sp: any, i: number) => ({
    sale_id,
    business_id: bid,
    group_id: group_id ?? null,
    split_number: i + 1,
    split_method: sp.split_method ?? 'even',
    person_label: sp.person_label ?? `Person ${i + 1}`,
    group_member_id: sp.group_member_id ?? null,
    customer_id: sp.customer_id ?? null,
    subtotal: sp.subtotal ?? 0,
    tax_amount: sp.tax_amount ?? 0,
    tip_amount: sp.tip_amount ?? 0,
    tip_type: sp.tip_type ?? null,
    tip_value: sp.tip_value ?? null,
    total_amount: sp.total_amount ?? 0,
    status: 'unpaid',
    ai_suggested: sp.ai_suggested ?? false,
    ai_reasoning: sp.ai_reasoning ?? null,
  }))

  const { data: inserted, error: insErr } = await supabase.from('pos_sale_splits').insert(rows).select()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Insert split_items for by_item splits
  const itemRows: any[] = []
  for (let i = 0; i < splitInputs.length; i++) {
    const sp = splitInputs[i]
    const splitId = (inserted ?? [])[i]?.id
    if (!splitId || !Array.isArray(sp.items)) continue
    for (const item of sp.items) {
      itemRows.push({ split_id: splitId, sale_item_id: item.sale_item_id, quantity_assigned: item.quantity_assigned, amount_assigned: item.amount_assigned, business_id: bid })
    }
  }
  if (itemRows.length > 0) {
    await supabase.from('pos_split_items').insert(itemRows)
  }

  // Update sale status to open (being split)
  await supabase.from('pos_sales').update({ status: 'open' }).eq('id', sale_id)

  return NextResponse.json({ splits: inserted ?? [] }, { status: 201 })
}

export const GET = withErrorCapture('pos/splits', _GET)
export const POST = withBusinessContext('pos/splits', _POST)