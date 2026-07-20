export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _PATCH(req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = await params
  const { data: existing } = await supabase.from('pos_tax_codes').select('id, is_system, business_id').eq('id', id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updates.name = String(body.name).slice(0, 100)
  if (body.rate !== undefined) {
    const r = Number(body.rate) || 0
    if (r < 0 || r > 100) return NextResponse.json({ error: 'Rate must be 0-100' }, { status: 400 })
    updates.rate = r
  }
  if (body.description !== undefined) updates.description = body.description
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.is_inclusive !== undefined && !existing.is_system) updates.is_inclusive = body.is_inclusive

  const { data, error } = await supabase.from('pos_tax_codes').update(updates).eq('id', id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tax_code: data })
}

async function _DELETE(_req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = await params
  const { data: existing } = await supabase.from('pos_tax_codes').select('is_system, business_id').eq('id', id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.is_system) return NextResponse.json({ error: 'Cannot delete system tax code — deactivate instead' }, { status: 400 })
  await supabase.from('pos_tax_codes').update({ is_active: false }).eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/tax-codes/[id]', _PATCH)
export const DELETE = withBusinessContext('pos/tax-codes/[id]', _DELETE)
