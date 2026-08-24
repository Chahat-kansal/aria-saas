export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { buildAxContext } from '@/lib/aria/ax-context'

/**
 * MS16 PHASE 6 — the context panel's data.
 *
 * Tenant comes from the rail (MS13), never the client. A failure here returns 503 rather than an
 * empty shell: an empty panel and an unreadable panel look identical to an owner, and only one of
 * them means "nothing is happening".
 */
async function _GET(_req: Request, _ctx: unknown, { businessId }: BusinessContext) {
  try {
    return NextResponse.json(await buildAxContext(businessId))
  } catch (e) {
    console.error('[aria/ax-context] failed:', (e as Error).message)
    return NextResponse.json({ error: 'unreadable' }, { status: 503 })
  }
}

export const GET = withBusinessContext('aria/ax-context', _GET)
