export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _PATCH(req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = 'then' in params ? await params : params
  const body = await req.json()
  const payload: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() }
  // Normalize: DB uses 'active' not 'is_active'
  if (body.is_active !== undefined && payload.active === undefined) payload.active = body.is_active
  delete payload.is_active

  const { error } = await supabase.from('pos_promotions').update(payload).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/promotions/[id]', _PATCH)

async function _DELETE(_req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = 'then' in params ? await params : params
  const { error } = await supabase.from('pos_promotions').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const DELETE = withBusinessContext('pos/promotions/[id]', _DELETE)