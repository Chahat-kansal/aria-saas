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

  const { data: mod } = await supabase.from('pos_modifiers').select('business_id, businesses!inner(user_id, industry)').eq('id', id).single()
  if (!mod || (mod as any).businesses?.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if ((mod as any).businesses?.industry !== 'cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const body = await req.json()
  const allowed = ['name', 'price_adjustment', 'price_per_size', 'is_default', 'allow_quantity', 'max_quantity', 'is_active', 'display_order', 'inventory_link']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) updates[k] = body[k]

  const { data, error } = await supabase.from('pos_modifiers').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

async function _DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: mod } = await supabase.from('pos_modifiers').select('business_id, businesses!inner(user_id, industry)').eq('id', id).single()
  if (!mod || (mod as any).businesses?.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if ((mod as any).businesses?.industry !== 'cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  await supabase.from('pos_modifiers').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export const PATCH  = withErrorCapture('pos/modifiers/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/modifiers/[id]', _DELETE)