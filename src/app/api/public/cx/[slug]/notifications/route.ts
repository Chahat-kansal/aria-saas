export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

// GET  ?customer_id=...
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ notifications: [] }, { status: 404 })

  const url = new URL(req.url)
  const customerId = url.searchParams.get('customer_id') ?? ''
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

// PATCH  { customer_id, id? }  — mark read (id=undefined → mark all read)
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ ok: false }, { status: 404 })

  let body: { customer_id?: string; id?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const { customer_id, id } = body
  if (!customer_id) return NextResponse.json({ ok: false, error: 'customer_id required' }, { status: 400 })

  const base = supabaseAdmin
    .from('cx_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('business_id', bid)
    .eq('customer_id', customer_id)
    .is('read_at', null)

  const { error } = await (id ? base.eq('id', id) : base)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}