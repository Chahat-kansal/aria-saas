export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json()
  const allowed = ['name', 'display_name', 'selection_type', 'is_required', 'min_selections', 'max_selections', 'allow_quantity', 'color', 'step_number', 'display_order', 'archetype_slot']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) update[k] = body[k]

  const { data, error } = await supabase.from('pos_modifier_groups').update(update).eq('id', params.id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Bulk-replace modifiers if provided
  if (Array.isArray(body.modifiers)) {
    await supabase.from('pos_modifiers').update({ is_active: false }).eq('group_id', params.id).eq('business_id', bid)
    if (body.modifiers.length > 0) {
      await supabase.from('pos_modifiers').insert((body.modifiers as Record<string, unknown>[]).map((m, idx) => ({
        business_id: bid,
        group_id: params.id,
        name: String(m.name ?? '').slice(0, 100),
        price_adjustment: Number(m.price_adjustment) || 0,
        price_cents: Math.round((Number(m.price_adjustment) || 0) * 100),
        is_default: !!m.is_default,
        is_active: true,
        allow_quantity: !!m.allow_quantity,
        max_quantity: Math.max(1, Number(m.max_quantity) || 1),
        sort_order: Number(m.sort_order) || idx,
        display_order: Number(m.display_order) || idx,
      })))
    }
  }

  return NextResponse.json({ group: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  // Check if any products still reference this group
  const { count } = await supabase.from('pos_product_modifier_groups').select('*', { count: 'exact', head: true }).eq('group_id', params.id)
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Cannot delete: modifier group is attached to products. Detach first.' }, { status: 409 })

  await supabase.from('pos_modifiers').update({ is_active: false }).eq('group_id', params.id).eq('business_id', bid)
  const { error } = await supabase.from('pos_modifier_groups').delete().eq('id', params.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH  = withErrorCapture('pos/modifier-groups/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/modifier-groups/[id]', _DELETE)
