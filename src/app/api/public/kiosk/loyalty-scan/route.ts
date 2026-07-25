export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveCustomerCode } from '@/lib/loyalty/resolve-code'
import { limit } from '@/lib/rate-limit'

// Public endpoint — kiosk-scoped loyalty scan. No staff auth required.
// Accepts code (10-digit short_code or UUID) + business_id. Returns name + points.
// business_id guard prevents cross-business lookup.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { code?: string; business_id?: string }
  const code = (body.code ?? '').trim()
  const bid  = (body.business_id ?? '').trim()

  if (!code || !bid) return NextResponse.json({ found: false, reason: 'missing_params' })

  // SECURITY-P4 — previously had NO rate limit on a 10-digit-code lookup that returns name/points/
  // stamps. A generous kiosk-realistic limit (real in-store use is a handful of scans per minute)
  // still blocks a brute-force script from enumerating the code space.
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
  const rl = await limit('kiosk-loyalty-scan:' + ip + ':' + bid, { requests: 30, window: '1 m' })
  if (!rl.ok) {
    return NextResponse.json(
      { found: false, reason: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

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