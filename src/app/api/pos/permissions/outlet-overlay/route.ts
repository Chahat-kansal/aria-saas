export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ overlays: [] })
  const { searchParams } = new URL(req.url)
  const outlet_id = searchParams.get('outlet_id')
  const pos_user_id = searchParams.get('pos_user_id')
  let q = supabase.from('pos_outlet_role_permissions').select('*').eq('business_id', bid)
  if (outlet_id) q = q.eq('outlet_id', outlet_id)
  if (pos_user_id) q = q.eq('pos_user_id', pos_user_id)
  const { data } = await q
  return NextResponse.json({ overlays: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { outlet_id, pos_user_id, permission_overlay } = await req.json()
  if (!outlet_id || !pos_user_id) return NextResponse.json({ error: 'outlet_id + pos_user_id required' }, { status: 400 })
  const { data, error } = await supabase.from('pos_outlet_role_permissions').upsert({
    business_id: bid, outlet_id, pos_user_id, permission_overlay: permission_overlay ?? {},
  }, { onConflict: 'outlet_id,pos_user_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ overlay: data })
}

export const GET = withErrorCapture('pos/permissions/outlet-overlay', _GET)
export const POST = withErrorCapture('pos/permissions/outlet-overlay', _POST)
