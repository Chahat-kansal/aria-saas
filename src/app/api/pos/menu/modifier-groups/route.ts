import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

// Auth helper: verifies user owns business
async function getBid() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Try user_active_business first, then fall back to businesses table
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

export async function GET() {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: groups, error: groupsError } = await supabaseAdmin
    .from('pos_modifier_groups')
    .select('id,name,selection_type,is_required,allow_quantity,min_selections,max_selections,display_order,color,archetype_slot,show_conversational_buttons')
    .eq('business_id', bid)
    .order('display_order')

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 })
  }

  const { data: modifiers, error: modifiersError } = await supabaseAdmin
    .from('pos_modifiers')
    .select('id,group_id,name,price_adjustment,is_active,is_default,allow_quantity,max_quantity,sort_order,kds_color')
    .eq('business_id', bid)
    .order('sort_order')

  if (modifiersError) {
    return NextResponse.json({ error: modifiersError.message }, { status: 500 })
  }

  const merged = (groups ?? []).map((group) => ({
    ...group,
    modifiers: (modifiers ?? []).filter((m) => m.group_id === group.id),
  }))

  return NextResponse.json({ groups: merged })
}

export async function POST(request: Request) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('pos_modifier_groups')
    .insert({
      business_id: bid,
      name,
      selection_type: (body.selection_type as string) ?? 'single',
      is_required: (body.is_required as boolean) ?? false,
      allow_quantity: (body.allow_quantity as boolean) ?? false,
      min_selections: Number(body.min_selections) || 0,
      max_selections: Number(body.max_selections) || 1,
      color: (body.color as string) ?? '#7FB897',
      archetype_slot: (body.archetype_slot as string) ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
