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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const body = await request.json()

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (body.name !== undefined) updateData.name = body.name
  if (body.selection_type !== undefined) updateData.selection_type = body.selection_type
  if (body.is_required !== undefined) updateData.is_required = body.is_required
  if (body.allow_quantity !== undefined) updateData.allow_quantity = body.allow_quantity
  if (body.min_selections !== undefined) updateData.min_selections = body.min_selections
  if (body.max_selections !== undefined) updateData.max_selections = body.max_selections
  if (body.color !== undefined) updateData.color = body.color
  if (body.archetype_slot !== undefined) updateData.archetype_slot = body.archetype_slot
  if (body.display_order !== undefined) updateData.display_order = body.display_order

  const { error } = await supabaseAdmin
    .from('pos_modifier_groups')
    .update(updateData)
    .eq('id', id)
    .eq('business_id', bid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Delete all modifiers in the group
  const { error: modErr } = await supabaseAdmin
    .from('pos_modifiers')
    .delete()
    .eq('group_id', id)
    .eq('business_id', bid)

  if (modErr) return NextResponse.json({ error: modErr.message }, { status: 500 })

  // Delete product links
  const { error: linkErr } = await supabaseAdmin
    .from('pos_product_modifier_groups')
    .delete()
    .eq('group_id', id)
    .eq('business_id', bid)

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  // Delete the group itself
  const { error: groupErr } = await supabaseAdmin
    .from('pos_modifier_groups')
    .delete()
    .eq('id', id)
    .eq('business_id', bid)

  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const bid = await getBid()
  if (!bid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const body = await request.json()
  const { action, product_id } = body as { action: 'link' | 'unlink'; product_id: string }

  if (!product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 })

  if (action === 'link') {
    const { error } = await supabaseAdmin
      .from('pos_product_modifier_groups')
      .upsert(
        { product_id, group_id: id, business_id: bid, display_order: 0 },
        { onConflict: 'product_id,group_id' }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'unlink') {
    const { error } = await supabaseAdmin
      .from('pos_product_modifier_groups')
      .delete()
      .eq('product_id', product_id)
      .eq('group_id', id)
      .eq('business_id', bid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}