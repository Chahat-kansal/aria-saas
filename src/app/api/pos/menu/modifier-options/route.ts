import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

async function getBid() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (biz?.id as string | null) ?? null
}

export async function POST(request: Request) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { group_id, name, price_adjustment, allow_quantity, max_quantity, is_default, is_active } = body as {
    group_id: string
    name: string
    price_adjustment?: number
    allow_quantity?: boolean
    max_quantity?: number
    is_default?: boolean
    is_active?: boolean
  }

  if (!group_id) return NextResponse.json({ error: 'group_id required' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Verify the group belongs to this business
  const { data: group, error: groupErr } = await supabaseAdmin
    .from('pos_modifier_groups')
    .select('id')
    .eq('id', group_id)
    .eq('business_id', bid)
    .maybeSingle()

  if (groupErr || !group) return NextResponse.json({ error: 'Modifier group not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('pos_modifiers')
    .insert({
      business_id: bid,
      group_id,
      name: name.trim(),
      price_adjustment: price_adjustment ?? 0,
      allow_quantity: allow_quantity ?? false,
      max_quantity: max_quantity ?? 1,
      is_default: is_default ?? false,
      is_active: is_active ?? true,
    })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ modifier: data }, { status: 201 })
}