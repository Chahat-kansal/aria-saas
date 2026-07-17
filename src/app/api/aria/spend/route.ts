export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getDailySpend } from '@/lib/aria/cost-guard'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

// CANON-MIGRATE-1 — this route previously had no withErrorCapture wrapping at all (a bare export);
// moving it onto withBusinessContext additionally gains error-capture/Sentry reporting on an
// unhandled exception, which it never had before. Purely additive per RULE 0 — the happy-path
// response is unchanged.
async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const spend = await getDailySpend(bid)
  return NextResponse.json({
    today: spend,
    percent_used: spend.limit_cents > 0 ? Math.round((spend.spent_cents / spend.limit_cents) * 100) : 0,
  })
}

export const GET = withBusinessContext('aria/spend', _GET)
