export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ roles: [] })
  const { data } = await supabase.from('pos_custom_roles')
    .select('*').eq('business_id', bid).eq('is_active', true).order('role_key')
  return NextResponse.json({ roles: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const role_key = String(body.role_key ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40)
  if (!role_key) return NextResponse.json({ error: 'role_key required' }, { status: 400 })
  const reserved = ['cashier', 'supervisor', 'manager', 'admin', 'owner']
  if (reserved.includes(role_key)) return NextResponse.json({ error: 'role_key collides with system role' }, { status: 400 })
  const { data, error } = await supabase.from('pos_custom_roles').insert({
    business_id: bid,
    role_key,
    display_name: String(body.display_name ?? role_key).slice(0, 100),
    description: body.description ?? null,
    permissions: body.permissions ?? {},
    is_system: false,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ role: data })
}

export const GET = withErrorCapture('pos/custom-roles', _GET)
export const POST = withErrorCapture('pos/custom-roles', _POST)
