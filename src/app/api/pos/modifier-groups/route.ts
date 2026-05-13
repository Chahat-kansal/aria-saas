export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function requireCafeBusiness(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, business_id: string) {
  const { data } = await supabase.from('businesses').select('id, industry').eq('id', business_id).eq('user_id', userId).maybeSingle()
  if (!data) return null
  if (data.industry !== 'cafe') return 'not_cafe'
  return data
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const business_id = new URL(req.url).searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const biz = await requireCafeBusiness(supabase, user.id, business_id)
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (biz === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const { data: groups, error } = await supabase
    .from('pos_modifier_groups')
    .select('*, pos_modifiers(*, display_order.asc())')
    .eq('business_id', business_id)
    .order('display_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: groups ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { business_id, name, selection_type = 'single', is_required = false, min_selections = 0, max_selections = null, allow_quantity = false, show_conversational_buttons = false, display_order = 0, color = '#7FB897' } = body

  const biz = await requireCafeBusiness(supabase, user.id, business_id)
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (biz === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const { data, error } = await supabase
    .from('pos_modifier_groups')
    .insert({ business_id, name, selection_type, is_required, min_selections, max_selections, allow_quantity, show_conversational_buttons, display_order, color })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export const GET  = withErrorCapture('pos/modifier-groups', _GET)
export const POST = withErrorCapture('pos/modifier-groups', _POST)