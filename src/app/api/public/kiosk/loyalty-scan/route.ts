export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Public endpoint — kiosk-scoped loyalty scan. No staff auth required.
// Accepts code (10-digit short_code or UUID) + business_id, returns only name + points.
// The business_id guard prevents cross-business lookup.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { code?: string; business_id?: string }
  const code = (body.code ?? '').trim()
  const bid  = (body.business_id ?? '').trim()

  if (!code || !bid) return NextResponse.json({ found: false, reason: 'missing_params' })

  // Resolve loyalty_identity from short_code or UUID
  const isNumeric10 = /^\d{10}$/.test(code)
  const isUuid      = /^[0-9a-f-]{36}$/i.test(code)
  if (!isNumeric10 && !isUuid) return NextResponse.json({ found: false, reason: 'invalid_code' })

  const identQuery = isNumeric10
    ? supabaseAdmin.from('loyalty_identity').select('id').eq('short_code', code).maybeSingle()
    : supabaseAdmin.from('loyalty_identity').select('id').eq('id', code).maybeSingle()

  const { data: identRow } = await identQuery
  if (!identRow) return NextResponse.json({ found: false, reason: 'identity_not_found' })

  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, points_balance, stamps_count, loyalty_tier')
    .eq('business_id', bid)
    .eq('loyalty_identity_id', identRow.id)
    .is('deleted_at', null)
    .order('points_balance', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cust) return NextResponse.json({ found: false, reason: 'not_member' })

  const c = cust as { id: string; name: string | null; points_balance: number | null; stamps_count: number | null; loyalty_tier: string | null }

  return NextResponse.json({
    found: true,
    customer_id: c.id,
    name: c.name ?? 'Member',
    points_balance: Number(c.points_balance ?? 0),
    stamps_count: Number(c.stamps_count ?? 0),
    loyalty_tier: c.loyalty_tier ?? null,
  })
}