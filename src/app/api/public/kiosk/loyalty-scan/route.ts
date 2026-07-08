export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveCustomerCode } from '@/lib/loyalty/resolve-code'

// Public endpoint — kiosk-scoped loyalty scan. No staff auth required.
// Accepts code (10-digit short_code or UUID) + business_id. Returns name + points.
// business_id guard prevents cross-business lookup.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { code?: string; business_id?: string }
  const code = (body.code ?? '').trim()
  const bid  = (body.business_id ?? '').trim()

  if (!code || !bid) return NextResponse.json({ found: false, reason: 'missing_params' })

  const result = await resolveCustomerCode(code, bid)

  if (!result.found) {
    return NextResponse.json({ found: false, reason: result.reason })
  }

  const { customer } = result

  return NextResponse.json({
    found: true,
    customer_id: customer.customerId,
    name: customer.name ?? 'Member',
    points_balance: customer.pointsBalance,
    stamps_count: customer.stampsCount,
    loyalty_tier: customer.loyaltyTier ?? null,
  })
}