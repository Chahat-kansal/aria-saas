export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { normalisePhone } from '@/lib/clicksend'
import { linkOrCreateMembership } from '@/lib/loyalty/membership'

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { name?: string; phone?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const rawName = (body.name ?? '').trim()
  const rawPhone = (body.phone ?? '').trim()

  if (!rawName || rawName.length < 2) {
    return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
  }
  if (!rawPhone) {
    return NextResponse.json({ error: 'Mobile number required' }, { status: 400 })
  }

  const phone = normalisePhone(rawPhone)

  // Find or create loyalty_identity by phone
  const { data: existingId } = await supabaseAdmin
    .from('loyalty_identity')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  let identityId: string
  if (existingId?.id) {
    identityId = existingId.id as string
  } else {
    const { data: newId, error: idErr } = await supabaseAdmin
      .from('loyalty_identity')
      .insert({ phone })
      .select('id')
      .single()
    if (idErr || !newId) return NextResponse.json({ error: 'Could not create account' }, { status: 500 })
    identityId = newId.id as string
  }

  const { customer_id, name } = await linkOrCreateMembership(identityId, bid, { phone }, rawName)

  return NextResponse.json({ ok: true, customer_id, name, phone })
}