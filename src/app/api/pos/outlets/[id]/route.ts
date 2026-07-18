export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _PATCH(req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = 'then' in params ? await params : params
  const body = await req.json()
  const allowed: Record<string, unknown> = {}
  const SAFE = ['accepts_online_orders','online_order_throttle_per_15min','pickup_ready_estimate_minutes','name','phone','address'] as const
  for (const k of SAFE) { if (k in body) allowed[k] = body[k] }

  const { error } = await supabase.from('pos_outlets').update(allowed).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/outlets/[id]', _PATCH)