export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request, { params }: { params: { id: string } }, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = String(body.name).trim()
  if (body.is_active !== undefined) update.is_active = Boolean(body.is_active)
  const { data, error } = await supabase.from('pos_registers').update(update).eq('id', params.id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ register: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }, { supabase, businessId: bid }: BusinessContext) {
  await supabase.from('pos_registers').delete().eq('id', params.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/registers/[id]', _PATCH)
export const DELETE = withBusinessContext('pos/registers/[id]', _DELETE)
