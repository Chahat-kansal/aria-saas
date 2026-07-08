export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSession } from '@/lib/cx/get-cx-session'

async function resolveCustomerId(bid: string, identityId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('pos_customers')
    .select('id')
    .eq('business_id', bid)
    .eq('loyalty_identity_id', identityId)
    .is('deleted_at', null)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// GET — session-gated; ?customer_id= is a dead param, IGNORED for identity.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ notifications: [] }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = await resolveCustomerId(bid, session.identity_id)
  if (!customerId) return NextResponse.json({ notifications: [] })

  const { data, error } = await supabaseAdmin
    .from('cx_notifications')
    .select('id, type, title, body, action_url, read_at, created_at')
    .eq('business_id', bid)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ notifications: [] })
  return NextResponse.json({ notifications: data ?? [] })
}

// PATCH — session-gated; body.customer_id is a dead param, IGNORED for identity.
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ ok: false }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { customer_id?: string; id?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const customerId = await resolveCustomerId(bid, session.identity_id)
  if (!customerId) return NextResponse.json({ ok: false, error: 'Customer not found' }, { status: 404 })

  const base = supabaseAdmin
    .from('cx_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('business_id', bid)
    .eq('customer_id', customerId)
    .is('read_at', null)

  const { error } = await (body.id ? base.eq('id', body.id) : base)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}