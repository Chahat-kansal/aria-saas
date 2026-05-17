export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { suggestSplit } from '@/lib/pos/ai-split'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const { sale_id, members, group_id } = body
  if (!sale_id) return NextResponse.json({ error: 'sale_id required' }, { status: 400 })

  const membersToUse = members ?? []
  if (!Array.isArray(membersToUse) || membersToUse.length < 2) {
    return NextResponse.json({ error: 'At least 2 members required for AI split' }, { status: 400 })
  }

  // Fetch sale + items
  const [{ data: saleItems }, { data: saleRow }] = await Promise.all([
    supabase.from('pos_sale_items').select('id, product_name, quantity, unit_price, line_total').eq('sale_id', sale_id),
    supabase.from('pos_sales').select('total_amount').eq('id', sale_id).maybeSingle(),
  ])
  if (!saleItems?.length) return NextResponse.json({ error: 'No items found for sale' }, { status: 400 })
  const saleTotal = Number(saleRow?.total_amount) || 0

  // Fetch group history if group_id provided
  let groupHistory = undefined
  if (group_id) {
    const { data: hist } = await supabase.from('pos_sale_splits').select('person_label, group_member_id, pos_split_items(pos_sale_items(product_name))')
      .eq('business_id', bid).not('group_id', 'is', null).order('created_at', { ascending: false }).limit(50)
    if (hist?.length) {
      const memberMap: Record<string, string[]> = {}
      for (const s of hist as any[]) {
        const name = s.person_label
        if (!memberMap[name]) memberMap[name] = []
        for (const si of s.pos_split_items ?? []) {
          if (si.pos_sale_items?.product_name) memberMap[name].push(si.pos_sale_items.product_name)
        }
      }
      groupHistory = Object.entries(memberMap).map(([member_name, past_items]) => ({ member_name, past_items: [...new Set(past_items)] }))
    }
  }

  const result = await suggestSplit(
    saleItems.map(i => ({ id: i.id, product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total })),
    membersToUse,
    groupHistory,
    saleTotal,
  )

  return NextResponse.json(result)
}

export const POST = withErrorCapture('pos/splits/ai-suggest', _POST)