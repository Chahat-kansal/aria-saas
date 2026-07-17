export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _PATCH(req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = await params
  const { data: existing } = await supabase.from('pos_custom_roles').select('id, business_id, is_system').eq('id', id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.is_system) return NextResponse.json({ error: 'Cannot edit system role' }, { status: 400 })
  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.display_name !== undefined) updates.display_name = String(body.display_name).slice(0, 100)
  if (body.description !== undefined) updates.description = body.description
  if (body.permissions !== undefined) updates.permissions = body.permissions
  if (body.is_active !== undefined) updates.is_active = !!body.is_active
  const { data, error } = await supabase.from('pos_custom_roles').update(updates).eq('id', id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ role: data })
}

async function _DELETE(_req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = await params
  const { data: role } = await supabase.from('pos_custom_roles').select('role_key, is_system, business_id').eq('id', id).maybeSingle()
  if (!role || role.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role.is_system) return NextResponse.json({ error: 'Cannot delete system role' }, { status: 400 })
  const { count } = await supabase.from('pos_users').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('role', role.role_key)
  if ((count ?? 0) > 0) return NextResponse.json({ error: `Role still in use by ${count} user(s) — reassign first` }, { status: 400 })
  await supabase.from('pos_custom_roles').update({ is_active: false }).eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/custom-roles/[id]', _PATCH)
export const DELETE = withBusinessContext('pos/custom-roles/[id]', _DELETE)
