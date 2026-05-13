export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: group } = await supabase.from('pos_modifier_groups').select('business_id, businesses!inner(user_id, industry)').eq('id', id).single()
  if (!group || (group as any).businesses?.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if ((group as any).businesses?.industry !== 'cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const body = await req.json()
  const allowed = ['name', 'display_name', 'selection_type', 'is_required', 'min_selections', 'max_selections', 'allow_quantity', 'show_conversational_buttons', 'display_order', 'color']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) updates[k] = body[k]

  const { data, error } = await supabase.from('pos_modifier_groups').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

async function _DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: group } = await supabase.from('pos_modifier_groups').select('business_id, businesses!inner(user_id, industry)').eq('id', id).single()
  if (!group || (group as any).businesses?.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if ((group as any).businesses?.industry !== 'cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  await supabase.from('pos_modifiers').update({ is_active: false }).eq('group_id', id)
  await supabase.from('pos_product_modifier_groups').delete().eq('group_id', id)
  await supabase.from('pos_modifier_groups').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export const PATCH  = withErrorCapture('pos/modifier-groups/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/modifier-groups/[id]', _DELETE)