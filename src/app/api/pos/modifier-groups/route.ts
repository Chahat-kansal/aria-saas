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

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ groups: [] })
  const { data: groups } = await supabase.from('pos_modifier_groups').select('*').eq('business_id', bid).order('display_order')
  const { data: mods } = await supabase.from('pos_modifiers').select('*').eq('business_id', bid).eq('is_active', true).order('sort_order')
  const enriched = (groups ?? []).map(g => ({
    ...g,
    modifiers: (mods ?? []).filter(m => m.group_id === g.id),
  }))
  return NextResponse.json({ groups: enriched })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()

  const { data: group, error: groupErr } = await supabase.from('pos_modifier_groups').insert({
    business_id: bid,
    name: String(body.name ?? '').slice(0, 100),
    display_name: body.display_name ?? null,
    selection_type: body.selection_type === 'multi' ? 'multi' : 'single',
    is_required: !!body.is_required,
    min_selections: Math.max(0, Number(body.min_selections) || 0),
    max_selections: Math.max(1, Number(body.max_selections) || 1),
    allow_quantity: !!body.allow_quantity,
    color: body.color ?? '#7FB897',
    step_number: body.step_number != null ? (Number(body.step_number) || null) : null,
    display_order: Number(body.display_order) || 0,
  }).select().single()
  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 })

  const mods: Record<string, unknown>[] = Array.isArray(body.modifiers) ? body.modifiers : []
  if (mods.length > 0) {
    await supabase.from('pos_modifiers').insert(mods.map((m, idx) => ({
      business_id: bid,
      group_id: group.id,
      name: String(m.name ?? '').slice(0, 100),
      price_adjustment: Number(m.price_adjustment) || 0,
      is_default: !!m.is_default,
      is_active: true,
      allow_quantity: !!m.allow_quantity,
      max_quantity: Math.max(1, Number(m.max_quantity) || 1),
      sort_order: Number(m.sort_order) || idx,
      display_order: Number(m.display_order) || idx,
    })))
  }
  return NextResponse.json({ group }, { status: 201 })
}

export const GET  = withErrorCapture('pos/modifier-groups', _GET)
export const POST = withErrorCapture('pos/modifier-groups', _POST)
